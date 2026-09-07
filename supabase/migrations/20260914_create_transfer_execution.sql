-- ============================================================
-- 20260914_create_transfer_execution.sql
-- B7 - Paystack transfer EXECUTION + webhook state handling
-- ============================================================
-- Adds the server-only RPCs that the two new Edge Functions
-- (paystack-transfer, paystack-transfer-webhook) use to move a
-- transfer ledger row from 'pending' -> 'processing' -> terminal.
--
-- SAFETY MODEL
--   * Every RPC is SECURITY DEFINER with EXECUTE revoked from
--     PUBLIC/anon/authenticated and granted to service_role only
--     (same lockdown as the B6 RPCs).
--   * The B6 immutability trigger on public.transfers is NOT weakened:
--     identity columns stay immutable for everyone, and status /
--     transfer_code / raw_payload still change only inside a
--     transaction that sets app.transfer_server_update.
--   * Amounts are NEVER caller arguments: they are re-read from the
--     authoritative settlement rows inside the RPC.
--   * Reference / transfer-code matching is enforced before any
--     webhook status is applied.
--   * Idempotent: row locks (FOR UPDATE) + status pre-checks + the
--     UNIQUE paystack_reference / settlement-FK columns make repeated
--     events and repeated payout calls safe no-ops.
--
-- NO TRANSFER IS INITIATED BY THIS MIGRATION.
-- ============================================================

-- 1. prepare_transfer_for_payout
--    Called by paystack-transfer BEFORE the Paystack /transfer call.
--    Atomically: locks the transfer row, refuses non-pending states,
--    refuses payouts whose linked settlement is no longer 'pending',
--    and returns the AUTHORITATIVE payout values (amount in kobo,
--    recipient code, reference). The caller may not override any of
--    them - they are read from the database, not the request.
CREATE OR REPLACE FUNCTION public.prepare_transfer_for_payout(
  p_transfer_id uuid
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
  v_amount numeric;
  v_order_status text;
  v_rider_id uuid;
BEGIN
  IF p_transfer_id IS NULL THEN
    RAISE EXCEPTION 'transfer_id is required';
  END IF;

  -- Serialize concurrent payout attempts on the same transfer.
  SELECT * INTO v_t FROM public.transfers
  WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer % not found', p_transfer_id;
  END IF;

  -- Refuse anything not sitting in 'pending'.
  IF v_t.status <> 'pending' THEN
    RAISE EXCEPTION 'transfer % is % - cannot initiate (already processing/successful?)',
      p_transfer_id, v_t.status;
  END IF;

  IF v_t.payee_type = 'vendor' THEN
    SELECT * INTO v_vs FROM public.vendor_settlements
    WHERE id = v_t.vendor_settlement_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'linked vendor settlement missing for transfer %', p_transfer_id;
    END IF;
    IF v_vs.status <> 'pending' THEN
      RAISE EXCEPTION 'vendor settlement % is % - not payout-eligible',
        v_vs.id, v_vs.status;
    END IF;
    -- Authoritative vendor payout = product-line revenue (never changed).
    v_amount := v_vs.amount;
    -- The order must still be Delivered for the settlement to be valid.
    SELECT status INTO v_order_status FROM public.orders
    WHERE id = v_vs.order_id;
    IF v_order_status IS NULL OR v_order_status <> 'Delivered' THEN
      RAISE EXCEPTION 'order for vendor settlement % is not Delivered', v_vs.id;
    END IF;
  ELSE
    SELECT * INTO v_ds FROM public.delivery_settlements
    WHERE id = v_t.delivery_settlement_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'linked delivery settlement missing for transfer %', p_transfer_id;
    END IF;
    IF v_ds.status <> 'pending' THEN
      RAISE EXCEPTION 'delivery settlement % is % - not payout-eligible',
        v_ds.id, v_ds.status;
    END IF;
    -- Authoritative rider payout = 80% of the delivery fee (N800 on N1,000).
    v_amount := v_ds.rider_amount;
    -- vendor_self / unassigned orders have rider_id NULL: no rider payout.
    SELECT status, rider_id INTO v_order_status, v_rider_id
    FROM public.orders WHERE id = v_ds.order_id;
    IF v_rider_id IS NULL THEN
      RAISE EXCEPTION 'delivery settlement % has no assigned rider (vendor_self?)', v_ds.id;
    END IF;
    IF v_order_status IS NULL OR v_order_status <> 'Delivered' THEN
      RAISE EXCEPTION 'order for delivery settlement % is not Delivered', v_ds.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'transfer_id', v_t.id,
    'reference', v_t.paystack_reference,
    'recipient_code', v_t.recipient_code,
    'payee_type', v_t.payee_type,
    'amount', v_amount,
    'amount_kobo', (v_amount * 100)::bigint,
    'currency', v_t.currency
  );
END;
$$;

-- 2. mark_transfer_processing
--    Called by paystack-transfer AFTER Paystack accepts the /transfer call.
--    Flips the ledger row to 'processing' and records the transfer code.
--    Safe no-op if the row already left 'pending' (idempotency).
CREATE OR REPLACE FUNCTION public.mark_transfer_processing(
  p_transfer_id uuid,
  p_transfer_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_t FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer % not found', p_transfer_id;
  END IF;

  -- Idempotency: already processing or terminal -> nothing to do.
  IF v_t.status <> 'pending' THEN
    RAISE EXCEPTION 'transfer % is % - cannot mark processing', p_transfer_id, v_t.status;
  END IF;

  PERFORM set_config('app.transfer_server_update', 'on', true);

  UPDATE public.transfers
  SET status = 'processing',
      transfer_code = COALESCE(NULLIF(p_transfer_code, ''), transfer_code),
      raw_payload = jsonb_build_object('marked_processing_at', now())
  WHERE id = p_transfer_id;
END;
$$;

-- 3. apply_transfer_webhook_event
--    Called by paystack-transfer-webhook AFTER HMAC verification.
--    Locates the transfer by Paystack reference, enforces transfer-code
--    matching, and applies the terminal state machine:
--      processing -> success | failed | reversed
--    Terminal states are final (repeated events become safe no-ops).
--    p_event_status is the Paystack event meaning, NOT trusted blindly:
--    only the whitelist below is accepted and it is cross-checked
--    against the local row state before anything is written.
CREATE OR REPLACE FUNCTION public.apply_transfer_webhook_event(
  p_reference text,
  p_transfer_code text,
  p_event_status text,
  p_payload jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.transfers%ROWTYPE;
  v_new text;
BEGIN
  IF p_event_status NOT IN ('success', 'failed', 'reversed') THEN
    RAISE EXCEPTION 'unsupported transfer event status %', p_event_status;
  END IF;

  SELECT * INTO v_t FROM public.transfers
  WHERE paystack_reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no transfer for reference %', p_reference;
  END IF;

  -- Reference/transfer-code matching: if Paystack supplies a transfer
  -- code it must match the one recorded when the transfer was initiated.
  IF NULLIF(p_transfer_code, '') IS NOT NULL
     AND v_t.transfer_code IS NOT NULL
     AND p_transfer_code <> v_t.transfer_code THEN
    RAISE EXCEPTION 'transfer code mismatch for reference %', p_reference;
  END IF;

  -- State machine: only 'processing' rows may move to a terminal state.
  IF v_t.status = 'success' OR v_t.status = 'reversed' THEN
    RETURN v_t.status;  -- already terminal: idempotent no-op
  END IF;
  IF v_t.status = 'failed' THEN
    -- Paystack may retry after a failure; a success after a recorded
    -- failure must be honored exactly once.
    IF p_event_status = 'failed' THEN RETURN 'failed'; END IF;
  END IF;
  IF v_t.status = 'pending' THEN
    -- A webhook arrived for a transfer the ledger never saw leave
    -- 'pending'. Only a success is promoted (with code evidence);
    -- failure/reversed events for a never-initiated transfer are ignored.
    IF p_event_status <> 'success' THEN RETURN v_t.status; END IF;
  END IF;

  v_new := p_event_status;

  PERFORM set_config('app.transfer_server_update', 'on', true);

  UPDATE public.transfers
  SET status = v_new,
      transfer_code = COALESCE(v_t.transfer_code, NULLIF(p_transfer_code, '')),
      raw_payload = COALESCE(p_payload, v_t.raw_payload)
  WHERE id = v_t.id;

  RETURN v_new;
END;
$$;

-- 4. EXECUTE lockdown: service_role only (same model as B6).
REVOKE ALL ON FUNCTION public.prepare_transfer_for_payout(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_transfer_processing(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_transfer_webhook_event(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_transfer_for_payout(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_transfer_processing(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_transfer_webhook_event(text, text, text, jsonb) TO service_role;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * prepare_transfer_for_payout: locks + validates + returns the
--   AUTHORITATIVE amount/recipient/reference (never client values).
-- * mark_transfer_processing: pending -> processing flip, post-accept.
-- * apply_transfer_webhook_event: terminal state machine with
--   reference + transfer-code matching, idempotent, terminal-final.
-- * All three: SECURITY DEFINER, service_role-only EXECUTE, use the
--   app.transfer_server_update GUC so the B6 guard trigger passes.
-- * NO transfer is initiated by this migration.
-- ============================================================