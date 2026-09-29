-- F3.2.1: add direct Paystack transfer fee evidence and ledger event classification
-- to the rider_payout_cost_ledger table. Does not modify F3.1 evidence columns.

ALTER TABLE public.rider_payout_cost_ledger
  ADD COLUMN IF NOT EXISTS paystack_transfer_fee_amount bigint
    CHECK (paystack_transfer_fee_amount IS NULL OR paystack_transfer_fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS paystack_transfer_fee_source text
    CHECK (paystack_transfer_fee_source IN ('transfer_response','webhook','balance_ledger')),
  ADD COLUMN IF NOT EXISTS paystack_transfer_fee_payload jsonb,
  ADD COLUMN IF NOT EXISTS ledger_event_type text
    CHECK (ledger_event_type IN ('transfer_principal','transfer_fee','stamp_duty','reversal','other','unknown')),
  ADD COLUMN IF NOT EXISTS paystack_transfer_id text;

-- Index for fee correlation lookups
CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_transfer_fee
  ON public.rider_payout_cost_ledger(paystack_transfer_id)
  WHERE paystack_transfer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_fee_source
  ON public.rider_payout_cost_ledger(paystack_transfer_fee_source)
  WHERE paystack_transfer_fee_source IS NOT NULL;

-- Re-apply the immutability trigger to include new evidence columns
DROP TRIGGER IF EXISTS trg_prevent_rider_payout_cost_evidence_change
  ON public.rider_payout_cost_ledger;

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
     OR OLD.raw_payload IS DISTINCT FROM NEW.raw_payload
     OR OLD.paystack_transfer_id IS DISTINCT FROM NEW.paystack_transfer_id
     OR OLD.paystack_transfer_fee_amount IS DISTINCT FROM NEW.paystack_transfer_fee_amount
     OR OLD.paystack_transfer_fee_source IS DISTINCT FROM NEW.paystack_transfer_fee_source
     OR OLD.paystack_transfer_fee_payload IS DISTINCT FROM NEW.paystack_transfer_fee_payload
     OR OLD.ledger_event_type IS DISTINCT FROM NEW.ledger_event_type THEN
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

-- Additional useful indexes for reconciler query patterns
CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_paystack_reference
  ON public.rider_payout_cost_ledger(paystack_reference)
  WHERE paystack_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_paystack_transfer_code
  ON public.rider_payout_cost_ledger(paystack_transfer_code)
  WHERE paystack_transfer_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rider_payout_cost_ledger_attempt_id
  ON public.rider_payout_cost_ledger(attempt_id)
  WHERE attempt_id IS NOT NULL;

-- Composite index for the reconciler's transfers query
CREATE INDEX IF NOT EXISTS idx_transfers_reconciler_query
  ON public.transfers(payee_type, withdrawal_request_id, status)
  WHERE payee_type = 'rider' AND withdrawal_request_id IS NOT NULL;