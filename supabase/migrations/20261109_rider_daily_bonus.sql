-- Phase 8A: rider daily delivery bonus.
-- Separate earning source; does not alter the ₦1,000 delivery settlement.

CREATE TABLE IF NOT EXISTS public.rider_daily_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES public.riders(id) ON DELETE RESTRICT,
  qualifying_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 500 CHECK (amount = 500),
  bonus_type text NOT NULL DEFAULT 'fifth_daily_delivery'
    CHECK (bonus_type = 'fifth_daily_delivery'),
  reason text NOT NULL DEFAULT 'Fifth qualifying delivery of the calendar day',
  qualifying_delivery_count integer NOT NULL CHECK (qualifying_delivery_count >= 5),
  qualifying_settlement_id uuid NOT NULL REFERENCES public.delivery_settlements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rider_id, qualifying_date),
  UNIQUE (qualifying_settlement_id)
);

CREATE INDEX IF NOT EXISTS idx_rider_daily_bonuses_rider_date
  ON public.rider_daily_bonuses(rider_id, qualifying_date DESC);

ALTER TABLE public.rider_daily_bonuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rider_daily_bonuses_select_own ON public.rider_daily_bonuses;
CREATE POLICY rider_daily_bonuses_select_own ON public.rider_daily_bonuses
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.riders r WHERE r.id = rider_id AND r.user_id = auth.uid()));
DROP POLICY IF EXISTS rider_daily_bonuses_select_admin ON public.rider_daily_bonuses;
CREATE POLICY rider_daily_bonuses_select_admin ON public.rider_daily_bonuses
  FOR SELECT TO authenticated
  USING (public.is_admin());
REVOKE ALL ON public.rider_daily_bonuses FROM anon, authenticated;
GRANT SELECT ON public.rider_daily_bonuses TO authenticated;

CREATE OR REPLACE FUNCTION public._award_rider_daily_bonus(p_settlement_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE s public.delivery_settlements%ROWTYPE; d date; n integer; b public.rider_daily_bonuses%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.delivery_settlements WHERE id=p_settlement_id FOR UPDATE;
  IF NOT FOUND OR s.rider_id IS NULL OR s.status='reversed' THEN
    RETURN jsonb_build_object('awarded',false,'reason','not_qualifying');
  END IF;
  d := (s.created_at AT TIME ZONE 'Africa/Lagos')::date;
  PERFORM 1 FROM public.riders WHERE id=s.rider_id FOR UPDATE;
  SELECT count(*) INTO n
  FROM public.delivery_settlements ds
  WHERE ds.rider_id=s.rider_id AND ds.status <> 'reversed'
    AND (ds.created_at AT TIME ZONE 'Africa/Lagos')::date=d;
  IF n < 5 THEN RETURN jsonb_build_object('awarded',false,'count',n,'qualifying_date',d); END IF;
  INSERT INTO public.rider_daily_bonuses(rider_id,qualifying_date,qualifying_delivery_count,qualifying_settlement_id)
  VALUES(s.rider_id,d,n,s.id)
  ON CONFLICT (rider_id,qualifying_date) DO NOTHING
  RETURNING * INTO b;
  IF FOUND THEN RETURN jsonb_build_object('awarded',true,'bonus_id',b.id,'amount',b.amount,'qualifying_date',d); END IF;
  SELECT * INTO b FROM public.rider_daily_bonuses WHERE rider_id=s.rider_id AND qualifying_date=d;
  RETURN jsonb_build_object('awarded',false,'already_exists',true,'bonus_id',b.id,'amount',b.amount,'qualifying_date',d);
END; $func$;
REVOKE ALL ON FUNCTION public._award_rider_daily_bonus(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._award_rider_daily_bonus(uuid) TO service_role;

-- Award after the authoritative delivery settlement is created. Re-running
-- the settlement path is safe because both settlement and bonus are unique.
CREATE OR REPLACE FUNCTION public.auto_settle_delivered_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.status='Delivered' AND NEW.payment_status='success'
     AND (OLD.status IS DISTINCT FROM 'Delivered' OR OLD.payment_status IS DISTINCT FROM 'success') THEN
    PERFORM public._settle_order_core(NEW.id);
    PERFORM public._award_rider_daily_bonus(ds.id)
    FROM public.delivery_settlements ds WHERE ds.order_id=NEW.id;
  END IF;
  RETURN NEW;
END; $func$;

CREATE OR REPLACE FUNCTION public._calculate_rider_balance(p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE g numeric; w numeric; r numeric; b numeric;
BEGIN
  SELECT COALESCE(SUM(rider_amount),0) INTO g FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status <> 'reversed';
  SELECT g + COALESCE((SELECT SUM(amount) FROM public.rider_daily_bonuses WHERE rider_id=p_rider_id),0) INTO g;
  SELECT COALESCE(SUM(wr.amount),0) INTO w FROM public.withdrawal_requests wr
    WHERE wr.rider_id=p_rider_id AND wr.status='paid'
      AND EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=wr.id AND t.status='success');
  SELECT COALESCE(SUM(amount),0) INTO r FROM public.withdrawal_requests WHERE rider_id=p_rider_id AND status IN ('pending','approved');
  b:=GREATEST(g-w-r,0);
  RETURN jsonb_build_object('gross_earned',g,'withdrawn_amount',w,'reserved_amount',r,'available_balance',b);
END; $func$;

CREATE OR REPLACE FUNCTION public.get_rider_earnings(p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE b jsonb; p numeric; o jsonb; a jsonb; today numeric; hist jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.riders WHERE id=p_rider_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Not authorized to view earnings for this rider'; END IF;
  b:=public._calculate_rider_balance(p_rider_id);
  SELECT COALESCE(SUM(rider_amount),0) INTO p FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status='pending';
  SELECT COALESCE(SUM(amount),0) INTO today FROM public.rider_daily_bonuses WHERE rider_id=p_rider_id AND qualifying_date=(now() AT TIME ZONE 'Africa/Lagos')::date;
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.qualifying_date DESC),'[]'::jsonb) INTO hist FROM (SELECT qualifying_date,amount,bonus_type,created_at FROM public.rider_daily_bonuses WHERE rider_id=p_rider_id ORDER BY qualifying_date DESC LIMIT 30) x;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id',order_id,'rider_amount',rider_amount)),'[]'::jsonb) INTO o FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status='pending';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id',order_id,'rider_amount',rider_amount,'status',status)),'[]'::jsonb) INTO a FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status <> 'reversed';
  RETURN b || jsonb_build_object('lifetime_earnings',(b->>'gross_earned')::numeric,'lifetime_available_balance',(b->>'available_balance')::numeric,'pending_earnings',p,'pending_withdrawals',(b->>'reserved_amount')::numeric,'bonus_earned_today',today,'bonus_history',hist,'orders',o,'all_orders',a);
END; $func$;
