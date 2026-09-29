-- 20261229_rider_settlement_withdrawal_exclusivity.sql
-- A4: serialize rider settlement payout creation with withdrawals.
-- The balance function already accounts for existing settlement transfers;
-- this guard closes the race while a new settlement transfer is inserted.

CREATE OR REPLACE FUNCTION public.guard_rider_settlement_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rider_id uuid; v_available numeric;
BEGIN
  IF NEW.delivery_settlement_id IS NULL THEN RETURN NEW; END IF;
  SELECT rider_id INTO v_rider_id FROM public.delivery_settlements
   WHERE id=NEW.delivery_settlement_id FOR SHARE;
  IF v_rider_id IS NULL THEN RAISE EXCEPTION 'settlement transfer has no rider'; END IF;

  -- Same lock order as request_withdrawal(): rider first. If a withdrawal
  -- wins, its reservation is included in the balance below; if settlement
  -- wins, this transfer is inserted before the withdrawal computes balance.
  PERFORM 1 FROM public.riders WHERE id=v_rider_id FOR UPDATE;
  v_available := COALESCE((public._calculate_rider_balance(v_rider_id)->>'available_balance')::numeric,0);
  IF NEW.amount > v_available THEN
    RAISE EXCEPTION 'rider settlement payout exceeds available balance';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_rider_settlement_balance ON public.transfers;
CREATE TRIGGER trg_guard_rider_settlement_balance
BEFORE INSERT ON public.transfers
FOR EACH ROW WHEN (NEW.delivery_settlement_id IS NOT NULL AND NEW.payee_type='rider')
EXECUTE FUNCTION public.guard_rider_settlement_balance();

REVOKE ALL ON FUNCTION public.guard_rider_settlement_balance() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_rider_settlement_balance() TO service_role;
