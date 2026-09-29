-- ============================================================
-- 20261206_fix_vendor_delivery_fee_guard.sql
-- ============================================================
-- Fixes the prevent_order_unauthorized_changes trigger to recognize
-- app.vendor_delivery_server_update GUC in addition to app.order_server_update.
--
-- The set_vendor_delivery_method RPC (20261009) uses
-- app.vendor_delivery_server_update to authorize fee changes when
-- vendors choose delivery method (rider = 1500, vendor_self = 0).
-- However, the prevent_order_unauthorized_changes trigger (last updated
-- 20261111) only checks app.order_server_update, so the fee update
-- was being blocked even when the trusted server-side RPC opted in.
--
-- This migration adds the vendor_delivery_server_update check to the
-- fee protection block, allowing the legitimate RPC to update the fee
-- while still blocking unauthorized client changes.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_order_unauthorized_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 'on' ONLY when trusted server-side code (a SECURITY DEFINER
  -- payment/settlement/maintenance function) opted in for THIS
  -- transaction. Clients cannot set GUCs through PostgREST.
  v_server_update boolean :=
    COALESCE(current_setting('app.order_server_update', true), 'off') = 'on';
  -- Vendor delivery choice RPC uses this GUC to authorize fee changes
  v_vendor_delivery_server_update boolean :=
    COALESCE(current_setting('app.vendor_delivery_server_update', true), 'off') = 'on';
  -- Phase 8A.2: 'on' only while capture_delivery_completion_time() is
  -- stamping its own authoritative value inside THIS transaction. Raised by
  -- that trigger function only (it cannot be called as an RPC), and it is
  -- transaction-local, so clients can neither forge it nor reuse it later.
  v_completion_stamped boolean :=
    COALESCE(current_setting('app.order_delivery_completion_stamped', true), 'off') = 'on';
BEGIN
  -- ---- B1 (20260907): payment/financial columns are server-managed ----
  -- Blocked for every client role, admin included. Only server-side code
  -- that set app.order_server_update may change these.
  IF NOT v_server_update THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'payment_status is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.payment_reference IS DISTINCT FROM OLD.payment_reference THEN
      RAISE EXCEPTION 'payment_reference is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
      RAISE EXCEPTION 'transaction_id is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
      RAISE EXCEPTION 'subtotal is server-managed and cannot be changed by clients';
    END IF;

    -- ---- Phase 8A.2 FIX 1: delivery_completed_at is server-managed ----
    -- Blocked for every client role, admin included. The only writers are:
    --   (a) capture_delivery_completion_time(), on the first transition to
    --       Delivered (it announces itself with the latch above), and
    --   (b) trusted server-side code holding app.order_server_update='on'.
    -- A client that supplies the column is rejected — including on a
    -- Delivered transition, where the capture trigger would then have no
    -- stamp to make — so the timestamp can never be client-chosen. Updates
    -- that do not touch the column are unaffected, so existing order update
    -- permissions keep working normally.
    IF NOT v_completion_stamped
       AND NEW.delivery_completed_at IS DISTINCT FROM OLD.delivery_completed_at THEN
      RAISE EXCEPTION 'delivery_completed_at is server-managed and cannot be changed by clients';
    END IF;
  END IF;

  -- ---- Legacy guards (unchanged from 20260815) ----
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change order user_id';
  END IF;
  IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
    RAISE EXCEPTION 'Cannot change order_number';
  END IF;
  IF NOT public.is_admin() THEN
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'Cannot change order total';
    END IF;
    -- Fee changes are allowed for:
    -- 1. Admins (handled by NOT public.is_admin() check)
    -- 2. Trusted server-side code with app.order_server_update = 'on'
    -- 3. Vendor delivery choice RPC with app.vendor_delivery_server_update = 'on'
    IF NOT v_server_update
       AND NOT v_vendor_delivery_server_update
       AND NEW.fee IS DISTINCT FROM OLD.fee THEN
      RAISE EXCEPTION 'Cannot change order fee';
    END IF;
    IF NEW.spot IS DISTINCT FROM OLD.spot THEN
      RAISE EXCEPTION 'Cannot change order spot';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- No trigger re-bind: trg_prevent_order_unauthorized_changes keeps its name,
-- BEFORE UPDATE timing and binding, so existing references still hold and
-- there is exactly one guard trigger.