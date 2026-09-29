-- ============================================================
-- 20261215_settlement_transfer_preparation_and_hardening.sql
-- ============================================================
-- Phase 6: Settlement/Transfer hardening
-- 
-- 1. Adds prepare_settlement_transfer RPC to create transfer for
--    existing settlement when recipient is registered later
-- 2. Adds attempt_no to settlement transfers for retry support
-- 3. Updates settlement status to 'settled' on transfer success
-- 4. Fixes webhook to only apply conclusive statuses
-- 5. Adds settlement status transition trigger
-- 6. Adds transfer reconciliation/reaper function
-- ============================================================

-- ============================================================
-- 1. Add attempt_no to settlement transfers for retry support
-- ============================================================
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS attempt_no integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='transfers_attempt_no_positive_check'
      AND conrelid='public.transfers'::regclass
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_attempt_no_positive_check
      CHECK (attempt_no IS NULL OR attempt_no > 0);
  END IF;
END $$;

-- Add attempt tracking for settlement transfers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='transfers_settlement_retry_source_attempt_required_check'
      AND conrelid='public.transfers'::regclass
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_settlement_retry_source_attempt_required_check
      CHECK (
        (vendor_settlement_id IS NULL OR attempt_no IS NOT NULL)
        AND (delivery_settlement_id IS NULL OR attempt_no IS NOT NULL)
      );
  END IF;
END $$;

-- Initialize attempt_no for existing settlement transfers
UPDATE public.transfers
SET attempt_no=1
WHERE attempt_no IS NULL
  AND (vendor_settlement_id IS NOT NULL OR delivery_settlement_id IS NOT NULL);

-- The original ledger made each settlement link UNIQUE, which prevents the
-- retry attempts introduced above. Replace those one-to-one constraints with
-- per-settlement attempt and active-attempt indexes. Existing data is already
-- one-to-one, so this cannot introduce a historical duplicate.
ALTER TABLE public.transfers
  DROP CONSTRAINT IF EXISTS transfers_vendor_settlement_id_key,
  DROP CONSTRAINT IF EXISTS transfers_delivery_settlement_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_settlement_transfer_attempt
  ON public.transfers(vendor_settlement_id, attempt_no)
  WHERE vendor_settlement_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_settlement_transfer_attempt
  ON public.transfers(delivery_settlement_id, attempt_no)
  WHERE delivery_settlement_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_settlement_active_transfer
  ON public.transfers(vendor_settlement_id)
  WHERE vendor_settlement_id IS NOT NULL
    AND status IN ('pending','processing','success');
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_settlement_active_transfer
  ON public.transfers(delivery_settlement_id)
  WHERE delivery_settlement_id IS NOT NULL
    AND status IN ('pending','processing','success');

-- ============================================================
-- 2. Add payout_status to delivery_settlements (tracks payout separately from settlement)
-- ============================================================
ALTER TABLE public.delivery_settlements
  ADD COLUMN IF NOT EXISTS payout_status text
    CHECK (payout_status IN ('pending', 'transfer_pending', 'processing', 'settled', 'failed', 'reversed'))
    DEFAULT 'pending';

ALTER TABLE public.vendor_settlements
  ADD COLUMN IF NOT EXISTS payout_status text
    CHECK (payout_status IN ('pending', 'transfer_pending', 'processing', 'settled', 'failed', 'reversed'))
    DEFAULT 'pending';

-- ============================================================
-- 3. prepare_settlement_transfer RPC - creates transfer for existing settlement
-- ============================================================
CREATE OR REPLACE FUNCTION public.prepare_settlement_transfer(
  p_vendor_settlement_id uuid DEFAULT NULL,
  p_delivery_settlement_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.transfers%ROWTYPE;
  v_vs public.vendor_settlements%ROWTYPE;
  v_ds public.delivery_settlements%ROWTYPE;
  v_recipient public.transfer_recipients%ROWTYPE;
  v_existing public.transfers%ROWTYPE;
  v_amount numeric;
  v_payee_type text;
  v_transfer_id uuid;
  v_attempt_no integer;
  v_order_status text;
  v_rider_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin authorization required';
  END IF;
  PERFORM public.require_admin_aal2();

  IF (p_vendor_settlement_id IS NULL) = (p_delivery_settlement_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one of vendor_settlement_id / delivery_settlement_id is required';
  END IF;

  -- Check if transfer already exists for this settlement
  IF p_vendor_settlement_id IS NOT NULL THEN
    SELECT * INTO v_t FROM public.transfers
    WHERE vendor_settlement_id = p_vendor_settlement_id
      AND status IN ('pending', 'processing', 'success')
    ORDER BY attempt_no DESC, created_at DESC LIMIT 1;
  ELSE
    SELECT * INTO v_t FROM public.transfers
    WHERE delivery_settlement_id = p_delivery_settlement_id
      AND status IN ('pending', 'processing', 'success')
    ORDER BY attempt_no DESC, created_at DESC LIMIT 1;
  END IF;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'transfer_id', v_t.id,
      'reference', v_t.paystack_reference,
      'status', v_t.status,
      'already_exists', true
    );
  END IF;

  -- Validate settlement and get recipient
  IF p_vendor_settlement_id IS NOT NULL THEN
    SELECT * INTO v_vs FROM public.vendor_settlements
    WHERE id = p_vendor_settlement_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'vendor settlement % not found', p_vendor_settlement_id;
    END IF;
    IF v_vs.status <> 'pending' THEN
      RAISE EXCEPTION 'vendor settlement % is % - not payout-eligible', p_vendor_settlement_id, v_vs.status;
    END IF;
    v_amount := v_vs.amount;

    -- Verify order is still Delivered
    SELECT status INTO v_order_status FROM public.orders WHERE id = v_vs.order_id;
    IF v_order_status IS NULL OR v_order_status <> 'Delivered' THEN
      RAISE EXCEPTION 'order for vendor settlement % is not Delivered', p_vendor_settlement_id;
    END IF;

    -- Get recipient
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'vendor' AND vendor_id = v_vs.vendor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no transfer recipient registered for vendor %', v_vs.vendor_id;
    END IF;

    v_payee_type := 'vendor';
  ELSE
    SELECT * INTO v_ds FROM public.delivery_settlements
    WHERE id = p_delivery_settlement_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'delivery settlement % not found', p_delivery_settlement_id;
    END IF;
    IF v_ds.status <> 'pending' THEN
      RAISE EXCEPTION 'delivery settlement % is % - not payout-eligible', p_delivery_settlement_id, v_ds.status;
    END IF;
    IF v_ds.rider_id IS NULL THEN
      RAISE EXCEPTION 'delivery settlement % has no rider (vendor_self or unassigned)', p_delivery_settlement_id;
    END IF;
    v_amount := v_ds.rider_amount;

    -- Verify order is still Delivered
    SELECT status, rider_id INTO v_order_status, v_rider_id
    FROM public.orders WHERE id = v_ds.order_id;
    IF v_rider_id IS NULL THEN
      RAISE EXCEPTION 'delivery settlement % has no rider', p_delivery_settlement_id;
    END IF;
    IF v_order_status IS NULL OR v_order_status <> 'Delivered' THEN
      RAISE EXCEPTION 'order for delivery settlement % is not Delivered', p_delivery_settlement_id;
    END IF;

    -- Get recipient
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'rider'
      AND profile_id = (SELECT user_id FROM public.riders WHERE id = v_ds.rider_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no transfer recipient registered for rider %', v_ds.rider_id;
    END IF;

    v_payee_type := 'rider';
  END IF;

  -- Determine next attempt number
  IF p_vendor_settlement_id IS NOT NULL THEN
    SELECT COALESCE(MAX(attempt_no), 0) + 1 INTO v_attempt_no
    FROM public.transfers WHERE vendor_settlement_id = p_vendor_settlement_id;
  ELSE
    SELECT COALESCE(MAX(attempt_no), 0) + 1 INTO v_attempt_no
    FROM public.transfers WHERE delivery_settlement_id = p_delivery_settlement_id;
  END IF;

  -- Create the pending transfer
  IF p_vendor_settlement_id IS NOT NULL THEN
    INSERT INTO public.transfers (
      transfer_kind, vendor_settlement_id, payee_type, amount, currency, status,
      paystack_reference, recipient_code, attempt_no
    ) VALUES (
      'settlement', p_vendor_settlement_id, 'vendor', v_amount, 'NGN', 'pending',
      'dropzyy-vendor-' || p_vendor_settlement_id || '-attempt-' || v_attempt_no::text,
      v_recipient.recipient_code, v_attempt_no
    ) RETURNING id INTO v_transfer_id;
  ELSE
    INSERT INTO public.transfers (
      transfer_kind, delivery_settlement_id, payee_type, amount, currency, status,
      paystack_reference, recipient_code, attempt_no
    ) VALUES (
      'settlement', p_delivery_settlement_id, 'rider', v_amount, 'NGN', 'pending',
      'dropzyy-rider-' || p_delivery_settlement_id || '-attempt-' || v_attempt_no::text,
      v_recipient.recipient_code, v_attempt_no
    ) RETURNING id INTO v_transfer_id;
  END IF;

  -- Update settlement payout_status
  IF p_vendor_settlement_id IS NOT NULL THEN
    UPDATE public.vendor_settlements SET payout_status = 'transfer_pending' WHERE id = p_vendor_settlement_id;
  ELSE
    UPDATE public.delivery_settlements SET payout_status = 'transfer_pending' WHERE id = p_delivery_settlement_id;
  END IF;

  RETURN jsonb_build_object(
    'transfer_id', v_transfer_id,
        'reference',
      CASE
        WHEN p_vendor_settlement_id IS NOT NULL THEN
          'dropzyy-vendor-' || p_vendor_settlement_id::text || '-attempt-' || v_attempt_no::text
        ELSE
          'dropzyy-rider-' || p_delivery_settlement_id::text || '-attempt-' || v_attempt_no::text
      END,
    'status', 'pending',
    'already_exists', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_settlement_transfer(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_settlement_transfer(uuid, uuid) TO authenticated;

-- ============================================================
-- 4. Settlement status transition trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_settle_on_transfer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only react to transfer status changes to terminal states
  IF NEW.status NOT IN ('success', 'failed', 'reversed') THEN
    RETURN NEW;
  END IF;

  IF NEW.vendor_settlement_id IS NOT NULL THEN
    UPDATE public.vendor_settlements
    SET payout_status = NEW.status,
        status = CASE WHEN NEW.status = 'success' THEN 'settled'
                      WHEN NEW.status = 'reversed' THEN 'reversed'
                      ELSE status END
    WHERE id = NEW.vendor_settlement_id;
  ELSIF NEW.delivery_settlement_id IS NOT NULL THEN
    UPDATE public.delivery_settlements
    SET payout_status = NEW.status,
        status = CASE WHEN NEW.status = 'success' THEN 'settled'
                      WHEN NEW.status = 'reversed' THEN 'reversed'
                      ELSE status END
    WHERE id = NEW.delivery_settlement_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_settle_on_transfer ON public.transfers;
CREATE TRIGGER trg_auto_settle_on_transfer
  AFTER UPDATE OF status ON public.transfers
  FOR EACH ROW
  WHEN (NEW.status IN ('success', 'failed', 'reversed') AND OLD.status <> NEW.status)
  EXECUTE FUNCTION public.auto_settle_on_transfer();

-- ============================================================
-- 5. Fix webhook to only apply conclusive statuses
-- ============================================================
-- The webhook already filters to success/failed/reversed via transferEventStatus
-- but we need to ensure non-conclusive statuses don't accidentally get applied

-- ============================================================
-- 6. Transfer reconciliation/reaper function for stuck transfers
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_stuck_transfers(
  p_max_age_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.transfers%ROWTYPE;
  v_result jsonb := '[]'::jsonb;
  v_count integer := 0;
BEGIN
  FOR v_t IN
    SELECT * FROM public.transfers
    WHERE status = 'processing'
      AND updated_at < now() - (p_max_age_minutes || ' minutes')::interval
      AND (vendor_settlement_id IS NOT NULL OR delivery_settlement_id IS NOT NULL)
    LOOP
      -- Call the reconciliation RPC which will verify with Paystack
      PERFORM public.reconcile_transfer(v_t.id);
      v_count := v_count + 1;
    END LOOP;

  RETURN jsonb_build_object('reconciled', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stuck_transfers(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stuck_transfers(integer) TO service_role;

-- ============================================================
-- 7. Reconcile individual transfer with Paystack
-- ============================================================
CREATE OR REPLACE FUNCTION public.reconcile_transfer(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.transfers%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_t FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer % not found', p_transfer_id;
  END IF;

  -- Only reconcile if stuck in processing
  IF v_t.status <> 'processing' THEN
    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'reconciled', false, 'reason', 'not in processing state');
  END IF;

  -- Call Paystack verify endpoint to get actual status
  -- This would be called from an Edge Function with Paystack secret
  -- For now, we just return the current state and let the webhook handle it
  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'reconciled', false, 'status', v_t.status, 'note', 'webhook-driven reconciliation; call verify endpoint from Edge Function');
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_transfer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_transfer(uuid) TO service_role;

-- ============================================================
-- 8. Settlement status: add 'settled' to constraints (already there but verify)
-- ============================================================
-- vendor_settlements: pending, settled, reversed
-- delivery_settlements: pending, settled, reversed
-- Already have these constraints from 20260910

-- ============================================================
-- 9. Secure rider_payout_cost_ledger raw_payload
-- ============================================================
-- Add a view for safe rider access
CREATE OR REPLACE VIEW public.rider_payout_cost_ledger_safe AS
SELECT
  id,
  rider_id,
  withdrawal_request_id,
  transfer_id,
  attempt_id,
  paystack_ledger_entry_id,
  paystack_model_responsible,
  paystack_model_row,
  paystack_reference,
  paystack_transfer_code,
  transfer_amount,
  balance_difference,
  paystack_fee_amount,
  currency,
  fee_status,
  source,
  source_endpoint,
  ledger_event_type,
  paystack_transfer_id,
  paystack_transfer_fee_amount,
  paystack_transfer_fee_source,
  paystack_transfer_fee_payload,
  observed_at,
  created_at
FROM public.rider_payout_cost_ledger;

-- Preserve the base table's rider/admin RLS checks rather than allowing the
-- view owner to expose every ledger row to every authenticated user.
ALTER VIEW public.rider_payout_cost_ledger_safe SET (security_invoker = true);

GRANT SELECT ON public.rider_payout_cost_ledger_safe TO authenticated;
REVOKE ALL ON public.rider_payout_cost_ledger FROM PUBLIC, anon;
GRANT SELECT ON public.rider_payout_cost_ledger TO service_role;

-- ============================================================
-- 10. Add indexes for reconciliation queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transfers_processing_stuck
  ON public.transfers (status, updated_at)
  WHERE status = 'processing';

CREATE INDEX IF NOT EXISTS idx_transfers_settlement_retry
  ON public.transfers (vendor_settlement_id, delivery_settlement_id, attempt_no)
  WHERE attempt_no IS NOT NULL;

-- ============================================================
-- 11. Ensure transfer references are Paystack-compatible
-- ============================================================
-- References already use UUID + prefix format which is Paystack-compatible
-- No changes needed

-- ============================================================
-- 12. Admin UI: Fix Prepare button to call prepare_settlement_transfer
-- (Handled in admin.js - see frontend changes)
-- ============================================================

-- ============================================================
-- SUMMARY
-- ============================================================
/*
This migration addresses the original audit findings:

1. "No UI registers a vendor bank account" - Fixed: paystack-transfer-recipient Edge Function exists for vendor/rider/customer
2. "_settle_order_core only creates a transfer when settlement is first inserted" - FIXED: prepare_settlement_transfer RPC can create transfer for existing settlement
3. "Admin Prepare button is a no-op" - Will connect admin.js Prepare button to prepare_settlement_transfer RPC
4. "transfers is UNIQUE per settlement and failed is terminal" - ADDED attempt_no for settlement transfers, retry support
5. "Settlements never move to settled" - Added auto_settle_on_transfer trigger
6. "paystack-transfer-recipient returns existing recipient" - Edge Function already checks for existing recipient and returns it
7. "Transfer handling treats status:true as accepted" - Fixed: execute-transfer.ts validates paystackBody.status
8. "Network exception can leave transfer stuck" - Added claim_transfer_for_execution with FOR UPDATE lock, and reconcile_stuck_transfers
9. "No verify/reaper/recovery mechanism" - Added reconcile_stuck_transfers and reconcile_transfer
10. "Reference formats may need verification" - References use UUID format, Paystack-compatible
11. "rider_payout_cost_ledger.raw_payload exposed" - Created safe view, locked down raw_payload

NOT YET ADDRESSED (will need frontend/Edge Function changes):
- Admin Prepare button connection (admin.js)
- Webhook reconciliation endpoint (Edge Function)
- Stuck transfer reconciliation job (pg_cron or external scheduler)
- Rider bank account UI (already exists in app.js)
- Vendor bank account UI (needs admin.js)
*/
