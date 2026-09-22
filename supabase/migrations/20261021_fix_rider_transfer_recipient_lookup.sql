-- ============================================================
-- 20261021_fix_rider_transfer_recipient_lookup.sql
-- Corrective migration ONLY — fixes the rider recipient lookup in
-- public.create_pending_transfer without touching history.
-- ============================================================
-- BUG: delivery_settlements.rider_id references public.riders(id),
-- but create_pending_transfer (20260913:352-353) compared
-- transfer_recipients.profile_id = v_ds.rider_id directly.
-- transfer_recipients.profile_id stores the profile/auth id
-- (profiles.id = auth.uid()), so this lookup NEVER matched and every
-- rider payout raised 'no transfer recipient registered for rider %'.
-- Callers swallow that into a WARNING, so rider transfers were silently
-- never created (vendor transfers were unaffected).
--
-- FIX: resolve riders.id -> riders.user_id -> profile_id, exactly as the
-- settlement engines already do (20260930, 20261004, 20261013).
-- SCOPE: body is identical to the 20260913 original EXCEPT the lookup.
-- No signature, privilege, table, or RLS change.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_pending_transfer(
  p_vendor_settlement_id uuid DEFAULT NULL,
  p_delivery_settlement_id uuid DEFAULT NULL,
  p_paystack_reference text DEFAULT NULL,
  p_recipient_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_vs public.vendor_settlements%ROWTYPE;
  v_ds public.delivery_settlements%ROWTYPE;
  v_recipient public.transfer_recipients%ROWTYPE;
  v_existing public.transfers%ROWTYPE;
  v_payee_type text;
  v_amount numeric;
  v_transfer_id uuid;
BEGIN
  IF (p_vendor_settlement_id IS NULL) = (p_delivery_settlement_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one of vendor_settlement_id / delivery_settlement_id is required';
  END IF;
  IF p_paystack_reference IS NULL OR p_paystack_reference = '' THEN
    RAISE EXCEPTION 'paystack_reference is required';
  END IF;

  IF p_vendor_settlement_id IS NOT NULL THEN
    SELECT * INTO v_vendor_vs FROM public.vendor_settlements
    WHERE id = p_vendor_settlement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'vendor settlement % not found', p_vendor_settlement_id; END IF;
    IF v_vendor_vs.status != 'pending' THEN
      RAISE EXCEPTION 'vendor settlement % is % - not payout-eligible', p_vendor_settlement_id, v_vendor_vs.status;
    END IF;
    v_payee_type := 'vendor';
    v_amount := v_vendor_vs.amount;
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'vendor' AND vendor_id = v_vendor_vs.vendor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no transfer recipient registered for vendor %', v_vendor_vs.vendor_id;
    END IF;
    IF p_recipient_code != v_recipient.recipient_code THEN
      RAISE EXCEPTION 'recipient_code does not match the registered vendor recipient';
    END IF;
  ELSE
    SELECT * INTO v_ds FROM public.delivery_settlements
    WHERE id = p_delivery_settlement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'delivery settlement % not found', p_delivery_settlement_id; END IF;
    IF v_ds.status != 'pending' THEN
      RAISE EXCEPTION 'delivery settlement % is % - not payout-eligible', p_delivery_settlement_id, v_ds.status;
    END IF;
    IF v_ds.rider_id IS NULL THEN
      RAISE EXCEPTION 'delivery settlement % has no rider (vendor_self or unassigned) - no rider payout', p_delivery_settlement_id;
    END IF;
    v_payee_type := 'rider';
    v_amount := v_ds.rider_amount;
    -- CORRECTED (20261021): riders.id -> riders.user_id -> profile_id.
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'rider'
      AND profile_id = (SELECT user_id FROM public.riders WHERE id = v_ds.rider_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no transfer recipient registered for rider %', v_ds.rider_id;
    END IF;
    IF p_recipient_code != v_recipient.recipient_code THEN
      RAISE EXCEPTION 'recipient_code does not match the registered rider recipient';
    END IF;
  END IF;
  IF p_vendor_settlement_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.transfers WHERE vendor_settlement_id = p_vendor_settlement_id;
  ELSE
    SELECT * INTO v_existing FROM public.transfers WHERE delivery_settlement_id = p_delivery_settlement_id;
  END IF;
  IF FOUND THEN
    RETURN jsonb_build_object('transfer_id', v_existing.id, 'reference', v_existing.paystack_reference, 'status', v_existing.status, 'already_exists', true);
  END IF;
  INSERT INTO public.transfers (vendor_settlement_id, delivery_settlement_id, payee_type, amount, currency, status, paystack_reference, recipient_code)
  VALUES (p_vendor_settlement_id, p_delivery_settlement_id, v_payee_type, v_amount, 'NGN', 'pending', p_paystack_reference, p_recipient_code)
  RETURNING id INTO v_transfer_id;
  RETURN jsonb_build_object('transfer_id', v_transfer_id, 'reference', p_paystack_reference, 'status', 'pending', 'already_exists', false);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_pending_transfer(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_transfer(uuid, uuid, text, text) TO service_role;
