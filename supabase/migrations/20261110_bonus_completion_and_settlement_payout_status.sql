-- Phase 8A corrections: immutable delivery completion date, bonus validity,
-- and explicit rider settlement payout status.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_completed_at timestamptz;

CREATE OR REPLACE FUNCTION public.capture_delivery_completion_time()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.status = 'Delivered'
     AND OLD.status IS DISTINCT FROM 'Delivered'
     AND NEW.delivery_completed_at IS NULL THEN
    NEW.delivery_completed_at := now();
  END IF;
  RETURN NEW;
END; $func$;

DROP TRIGGER IF EXISTS trg_capture_delivery_completion_time ON public.orders;
CREATE TRIGGER trg_capture_delivery_completion_time
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.capture_delivery_completion_time();

-- Delivery settlement validity remains separate from payout state. The latter
-- mirrors the existing transfer ledger without changing claim/retry behavior.
ALTER TABLE public.delivery_settlements
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'pending';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='delivery_settlements_payout_status_check') THEN
    ALTER TABLE public.delivery_settlements ADD CONSTRAINT delivery_settlements_payout_status_check
      CHECK (payout_status IN ('pending','processing','success','failed','reversed'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_delivery_settlements_payout_status
  ON public.delivery_settlements(rider_id, payout_status);

CREATE OR REPLACE FUNCTION public.sync_delivery_settlement_payout_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.delivery_settlement_id IS NOT NULL THEN
    UPDATE public.delivery_settlements
    SET payout_status = NEW.status
    WHERE id = NEW.delivery_settlement_id;
  END IF;
  RETURN NEW;
END; $func$;

DROP TRIGGER IF EXISTS trg_sync_delivery_settlement_payout_status ON public.transfers;
CREATE TRIGGER trg_sync_delivery_settlement_payout_status
AFTER INSERT OR UPDATE OF status ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_settlement_payout_status();

-- Use the immutable completion event, not settlement creation time. The
-- fallback preserves legacy rows created before delivery_completed_at existed.
CREATE OR REPLACE FUNCTION public._award_rider_daily_bonus(p_settlement_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE s public.delivery_settlements%ROWTYPE; v_completion timestamptz; d date; n integer; b public.rider_daily_bonuses%ROWTYPE;
BEGIN
  SELECT ds.* INTO s FROM public.delivery_settlements ds WHERE ds.id=p_settlement_id FOR UPDATE;
  IF NOT FOUND OR s.rider_id IS NULL OR s.status='reversed' THEN
    RETURN jsonb_build_object('awarded',false,'reason','not_qualifying');
  END IF;
  SELECT COALESCE(o.delivery_completed_at, s.created_at) INTO v_completion
  FROM public.orders o WHERE o.id=s.order_id;
  d := (v_completion AT TIME ZONE 'Africa/Lagos')::date;
  PERFORM 1 FROM public.riders WHERE id=s.rider_id FOR UPDATE;
  SELECT count(*) INTO n
  FROM public.delivery_settlements ds
  JOIN public.orders o ON o.id=ds.order_id
  WHERE ds.rider_id=s.rider_id AND ds.status <> 'reversed'
    AND (COALESCE(o.delivery_completed_at, ds.created_at) AT TIME ZONE 'Africa/Lagos')::date=d;
  IF n < 5 THEN RETURN jsonb_build_object('awarded',false,'count',n,'qualifying_date',d); END IF;
  INSERT INTO public.rider_daily_bonuses(rider_id,qualifying_date,qualifying_delivery_count,qualifying_settlement_id)
  VALUES(s.rider_id,d,n,s.id) ON CONFLICT (rider_id,qualifying_date) DO NOTHING RETURNING * INTO b;
  IF FOUND THEN RETURN jsonb_build_object('awarded',true,'bonus_id',b.id,'amount',b.amount,'qualifying_date',d); END IF;
  SELECT * INTO b FROM public.rider_daily_bonuses WHERE rider_id=s.rider_id AND qualifying_date=d;
  RETURN jsonb_build_object('awarded',false,'already_exists',true,'bonus_id',b.id,'amount',b.amount,'qualifying_date',d);
END; $func$;

-- Only valid, non-reversed qualifying settlements contribute their bonus.
CREATE OR REPLACE FUNCTION public._calculate_rider_balance(p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE g numeric; w numeric; r numeric; b numeric;
BEGIN
  SELECT COALESCE(SUM(rider_amount),0) INTO g FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status <> 'reversed';
  SELECT g + COALESCE((SELECT SUM(bn.amount) FROM public.rider_daily_bonuses bn JOIN public.delivery_settlements ds ON ds.id=bn.qualifying_settlement_id WHERE bn.rider_id=p_rider_id AND ds.status <> 'reversed'),0) INTO g;
  SELECT COALESCE(SUM(wr.amount),0) INTO w FROM public.withdrawal_requests wr WHERE wr.rider_id=p_rider_id AND wr.status='paid' AND EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=wr.id AND t.status='success');
  SELECT COALESCE(SUM(amount),0) INTO r FROM public.withdrawal_requests WHERE rider_id=p_rider_id AND status IN ('pending','approved');
  b:=GREATEST(g-w-r,0);
  RETURN jsonb_build_object('gross_earned',g,'withdrawn_amount',w,'reserved_amount',r,'available_balance',b);
END; $func$;
