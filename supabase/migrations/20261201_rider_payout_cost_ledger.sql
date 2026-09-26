-- F3.1: authoritative Paystack balance-ledger evidence for rider payouts.
-- This table is populated only by a future service-role reconciliation path.
-- No fee is inferred until matching Paystack ledger evidence exists.

CREATE TABLE IF NOT EXISTS public.rider_payout_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid REFERENCES public.riders(id),
  withdrawal_request_id bigint REFERENCES public.withdrawal_requests(id),
  transfer_id uuid REFERENCES public.transfers(id),
  attempt_id uuid REFERENCES public.rider_payout_reconciliation_attempts(id),
  paystack_ledger_entry_id text NOT NULL UNIQUE,
  paystack_model_responsible text,
  paystack_model_row text,
  paystack_reference text,
  paystack_transfer_code text,
  transfer_amount bigint CHECK (transfer_amount IS NULL OR transfer_amount >= 0),
  balance_difference bigint,
  paystack_fee_amount bigint CHECK (paystack_fee_amount IS NULL OR paystack_fee_amount >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  fee_status text NOT NULL DEFAULT 'unknown'
    CHECK (fee_status IN ('unknown','matched','unmatched','reversed')),
  source text NOT NULL DEFAULT 'paystack_balance_ledger',
  source_endpoint text,
  raw_payload jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rider_payout_cost_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_payout_cost_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rider_payout_cost_ledger TO authenticated;
GRANT ALL ON public.rider_payout_cost_ledger TO service_role;

CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_transfer
  ON public.rider_payout_cost_ledger(transfer_id);
CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_withdrawal
  ON public.rider_payout_cost_ledger(withdrawal_request_id);
CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_rider
  ON public.rider_payout_cost_ledger(rider_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_model
  ON public.rider_payout_cost_ledger(paystack_model_responsible, paystack_model_row);

DROP POLICY IF EXISTS rider_payout_cost_ledger_select_own
  ON public.rider_payout_cost_ledger;
CREATE POLICY rider_payout_cost_ledger_select_own
  ON public.rider_payout_cost_ledger FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = rider_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS rider_payout_cost_ledger_select_admin
  ON public.rider_payout_cost_ledger;
CREATE POLICY rider_payout_cost_ledger_select_admin
  ON public.rider_payout_cost_ledger FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.prevent_rider_payout_cost_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.paystack_ledger_entry_id IS DISTINCT FROM NEW.paystack_ledger_entry_id
     OR OLD.paystack_model_responsible IS DISTINCT FROM NEW.paystack_model_responsible
     OR OLD.paystack_model_row IS DISTINCT FROM NEW.paystack_model_row
     OR OLD.transfer_id IS DISTINCT FROM NEW.transfer_id
     OR OLD.withdrawal_request_id IS DISTINCT FROM NEW.withdrawal_request_id
     OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
     OR OLD.balance_difference IS DISTINCT FROM NEW.balance_difference
     OR OLD.transfer_amount IS DISTINCT FROM NEW.transfer_amount
     OR OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.raw_payload IS DISTINCT FROM NEW.raw_payload THEN
    RAISE EXCEPTION
      'rider payout cost evidence identity and original evidence are immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_rider_payout_cost_evidence_change()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_rider_payout_cost_evidence_change()
  TO service_role;

CREATE OR REPLACE TRIGGER trg_prevent_rider_payout_cost_evidence_change
BEFORE UPDATE ON public.rider_payout_cost_ledger
FOR EACH ROW
EXECUTE FUNCTION public.prevent_rider_payout_cost_evidence_change();
