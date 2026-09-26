-- Phase F2.2: make rider payout attempt identity and original amount immutable.

CREATE OR REPLACE FUNCTION public.prevent_rider_payout_attempt_identity_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.transfer_id IS DISTINCT FROM NEW.transfer_id
     OR OLD.withdrawal_request_id IS DISTINCT FROM NEW.withdrawal_request_id
     OR OLD.attempt_no IS DISTINCT FROM NEW.attempt_no
     OR OLD.amount IS DISTINCT FROM NEW.amount THEN
    RAISE EXCEPTION
      'rider payout attempt identity and original amount are immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_rider_payout_attempt_identity_change()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_rider_payout_attempt_identity_change()
  TO service_role;

CREATE OR REPLACE TRIGGER trg_prevent_rider_payout_attempt_identity_change
BEFORE UPDATE ON public.rider_payout_reconciliation_attempts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_rider_payout_attempt_identity_change();
