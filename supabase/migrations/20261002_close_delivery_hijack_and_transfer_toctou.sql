-- ============================================================
-- 20261002_close_delivery_hijack_and_transfer_toctou.sql
-- Post-review hardening pass 2 (2026-10-02). Corrective /
-- idempotent. Safe to run against the live database via the
-- Supabase SQL editor.
--
-- Fixes shipped by this migration:
--   1. DELIVERY-METHOD HIJACK (HIGH). orders_update_vendor
--      (20260906) lets a vendor with an item on the order set
--      delivery_method = 'vendor_self' + status = 'Delivered',
--      stealing the rider's delivery payout. The status trigger
--      only validated status transitions, never delivery_method,
--      and its early "no status change" return let delivery_method
--      flips bypass ALL checks. Now non-admin delivery_method
--      changes are only legal for the vendor's 'both' → rider /
--      both → vendor_self choice; 'rider' → 'vendor_self' and any
--      other flip raise.
--   2. DOUBLE-PAYMENT RACE (HIGH). paystack-initialize could
--      create two 'pending' payments for one order (idempotency
--      keyed on reference, not order_id). A partial unique index
--      now allows at most one 'pending' payment per order at the
--      DB level; the second insert fails with a unique violation
--      that the edge function resolves by reusing the existing
--      pending payment.
--   3. TRANSFER TOCTOU (HIGH). paystack-transfer prepared the row
--      (pending), called Paystack, THEN flipped to processing —
--      the FOR UPDATE lock died at RPC commit, before the HTTP
--      call, so two concurrent requests both called Paystack
--      (double payout). Mirrors the refund claim/release model:
--      claim_transfer_for_execution() atomically flips
--      pending → processing and returns the authoritative payout
--      values BEFORE Paystack is called; release_transfer_for_retry()
--      flips a stranded 'processing' row back to 'pending';
--      record_transfer_code() stores the Paystack transfer_code.
--   4. orders.fee CHECK (fee >= 0) for parity with total/subtotal.
--
-- NOT CHANGED: generate_settlement() keeps its authenticated-EXECUTE
-- grant. It is gated inside by is_admin() (the same pattern as
-- approve_refund / assign_user_to_vendor), so any authenticated
-- caller that is not an admin gets a permission error. Switching it
-- to service_role-only would actually BREAK it, because is_admin()
-- depends on auth.uid() which is NULL for the service role.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Delivery-method hijack guard (status-transition trigger)
-- ------------------------------------------------------------
-- Canonical body copied verbatim from 20261001_rider_pool_payment_
-- visibility.sql, plus ONE new delivery-method guard injected before
-- the "no status change" early return (so delivery_method-only flips
-- cannot bypass it). The trigger itself (trg_enforce_order_status_
-- transitions, BEFORE UPDATE ON orders from 20260901) stays attached;
-- a same-signature CREATE OR REPLACE FUNCTION does not need trigger
-- recreation.
CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- NEW GUARD (20261002): delivery_method is only changeable by
  -- admins, or by the vendor choosing on a 'both' order. A flipper
  -- to 'vendor_self' on a 'rider'/'both' delivery order would steal
  -- the rider's delivery share, so it is blocked unconditionally.
  IF NOT public.is_admin()
     AND NEW.delivery_method IS DISTINCT FROM OLD.delivery_method THEN
    IF OLD.delivery_method <> 'both'
       OR NEW.delivery_method NOT IN ('rider', 'vendor_self') THEN
      RAISE EXCEPTION 'delivery_method can only be changed from ''both'' (vendor choice)';
    END IF;
  END IF;

  -- No status change: nothing to validate here (other triggers/policies
  -- already guard user_id, order_number, total, fee, spot).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Admins keep full control (unchanged behaviour).
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Customer transitions on their OWN order.
  IF OLD.user_id = auth.uid() THEN
    IF (OLD.status = 'Delivered' AND NEW.status = 'Rated')
       OR (OLD.status IN ('Order confirmed', 'Preparing') AND NEW.status = 'Cancelled') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Assigned-rider transitions (rider_id must be the caller's rider row).
  IF NEW.rider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.riders
    WHERE id = NEW.rider_id AND user_id = auth.uid()
  ) THEN
    -- Claiming an unassigned rider-delivery order.
    -- PAYMENT GATE (20261001): the OLD row must already be paid —
    -- pending/failed/refunded orders can never be claimed here.
    IF OLD.rider_id IS NULL
       AND OLD.status IN ('Order confirmed', 'Ready for pickup')
       AND OLD.payment_status = 'success'
       AND NEW.status = 'Rider assigned' THEN
      RETURN NEW;
    END IF;
    -- Linear delivery progression.
    IF (OLD.status = 'Rider assigned' AND NEW.status = 'Picked up')
       OR (OLD.status = 'Picked up' AND NEW.status = 'On the Way')
       OR (OLD.status = 'On the Way' AND NEW.status = 'Delivered') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Vendor transitions on orders containing their own order_items.
  -- FIX: use order_has_vendor_item() (vendor_id-based capability) instead
  -- of the legacy role = 'vendor' check, matching the 20260922 model.
  IF public.order_has_vendor_item(OLD.id) THEN
    IF (OLD.status = 'Order confirmed' AND NEW.status IN ('Preparing', 'Cancelled'))
       OR (OLD.status = 'Preparing' AND NEW.status = 'Ready for pickup')
       OR (OLD.status = 'Preparing' AND NEW.status = 'Delivered'
           AND NEW.delivery_method = 'vendor_self') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Illegal order status transition % -> % for this role', OLD.status, NEW.status;
END;
$$;

-- ------------------------------------------------------------
-- 2. Double-payment race: at most one 'pending' payment per order
-- ------------------------------------------------------------
-- The order_id is unique across non-terminal ('pending') payments.
-- A second concurrent initialize / a second paystack-initialize call
-- for the same order can never insert another pending payment — it
-- gets a 23505 unique violation, which the edge function resolves by
-- reusing the first pending payment's authorization_url.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_pending_per_order
  ON public.payments (order_id)
  WHERE status = 'pending';

-- ------------------------------------------------------------
-- 3. Transfer TOCTOU closure (claim-first, mirroring refunds)
-- ------------------------------------------------------------
-- 3a. claim_transfer_for_execution()
--     Called by paystack-transfer BEFORE Paystack is invoked.
--     ATOMICALLY: locks the transfer row, refuses anything not
--     'pending', verifies the linked settlement + order exactly like
--     prepare_transfer_for_payout, then flips to 'processing' and
--     returns the AUTHORITATIVE payout values. Exactly one caller wins;
--     every concurrent caller gets claim=false (or an exception).
CREATE OR REPLACE FUNCTION public.claim_transfer_for_execution(
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

  -- Already claimed by another concurrent request -> not this caller's.
  IF v_t.status = 'processing' THEN
    RETURN jsonb_build_object(
      'transfer_id', p_transfer_id,
      'status', 'processing',
      'claim', false,
      'reason', 'transfer is already being processed'
    );
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
    v_amount := v_vs.amount;
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
    v_amount := v_ds.rider_amount;
    SELECT status, rider_id INTO v_order_status, v_rider_id
    FROM public.orders WHERE id = v_ds.order_id;
    IF v_rider_id IS NULL THEN
      RAISE EXCEPTION 'delivery settlement % has no assigned rider (vendor_self?)', v_ds.id;
    END IF;
    IF v_order_status IS NULL OR v_order_status <> 'Delivered' THEN
      RAISE EXCEPTION 'order for delivery settlement % is not Delivered', v_ds.id;
    END IF;
  END IF;

  -- Announce the trusted server-side write so the transfers guard trigger
  -- (prevent_transfer_unauthorized_changes) lets status mutate.
  PERFORM set_config('app.transfer_server_update', 'on', true);

  UPDATE public.transfers
  SET status = 'processing',
      raw_payload = jsonb_build_object('claimed_at', now())
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', v_t.id,
    'reference', v_t.paystack_reference,
    'recipient_code', v_t.recipient_code,
    'payee_type', v_t.payee_type,
    'amount', v_amount,
    'amount_kobo', (v_amount * 100)::bigint,
    'currency', v_t.currency,
    'claim', true
  );
END;
$$;

-- 3b. release_transfer_for_retry()
--     Service-role escape hatch: Paystack refused the transfer, so the
--     claimed 'processing' row is reset to 'pending' for a later retry.
--     Mirrors release_stuck_refund().
CREATE OR REPLACE FUNCTION public.release_transfer_for_retry(
  p_transfer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer public.transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_transfer FROM public.transfers
  WHERE id = p_transfer_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transfer % not found', p_transfer_id;
  END IF;

  IF v_transfer.status <> 'processing' THEN
    RAISE EXCEPTION 'transfer % has status % - only ''processing'' transfers can be released',
      p_transfer_id, v_transfer.status;
  END IF;

  PERFORM set_config('app.transfer_server_update', 'on', true);

  UPDATE public.transfers
  SET status = 'pending',
      raw_payload = jsonb_build_object('released_at', now())
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'pending',
    'previous_status', 'processing'
  );
END;
$$;

-- 3c. record_transfer_code()
--     After Paystack accepts the /transfer call, store its transfer_code
--     on the claimed (processing) row, which the webhook matching (B7)
--     depends on. Refuses terminal rows.
CREATE OR REPLACE FUNCTION public.record_transfer_code(
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

  IF v_t.status NOT IN ('pending', 'processing') THEN
    RAISE EXCEPTION 'transfer % is % - cannot record transfer code',
      p_transfer_id, v_t.status;
  END IF;

  PERFORM set_config('app.transfer_server_update', 'on', true);

  UPDATE public.transfers
  SET transfer_code = COALESCE(NULLIF(p_transfer_code, ''), transfer_code),
      raw_payload = COALESCE(raw_payload, '{}'::jsonb)
        || jsonb_build_object('recorded_code_at', now())
  WHERE id = p_transfer_id;
END;
$$;

-- 3d. EXECUTE lockdown for the new server-only RPCs.
REVOKE ALL ON FUNCTION public.claim_transfer_for_execution(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transfer_for_execution(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.release_transfer_for_retry(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_transfer_for_retry(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.record_transfer_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_transfer_code(uuid, text) TO service_role;

-- ------------------------------------------------------------
-- 4. orders.fee CHECK (fee >= 0), parity with total/subtotal
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND conname = 'orders_fee_check'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_fee_check CHECK (fee >= 0);
  END IF;
END $$;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * enforce_order_status_transitions: delivery_method flips are
--   admin-only, except the vendor's 'both' → rider / vendor_self
--   choice (closes the vendor delivery-method hijack).
-- * payments: UNIQUE (order_id) WHERE status = 'pending' — at most
--   one payable checkout per order (closes the double-init race).
-- * transfers: claim_transfer_for_execution / release_transfer_for_retry /
--   record_transfer_code — claim-before-Paystack (closes the double
--   payout TOCTOU). service_role-only.
-- * orders.fee CHECK (fee >= 0).
-- ============================================================