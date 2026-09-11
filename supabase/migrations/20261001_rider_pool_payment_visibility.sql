-- ============================================================
-- 20261001_rider_pool_payment_visibility.sql
-- ============================================================
-- Closes the LAST rider-pool payment-eligibility gap: the READ path.
--
-- PROBLEM
--   place_order() creates every order with payment_status = 'pending'
--   (by design — Paystack needs an order id before payment succeeds).
--   The claim path (orders_update_claim, 20260916) and the rider
--   notification trigger (notify_riders_new_pool_order, 20260917)
--   already require payment_status = 'success', but the rider-pool
--   SELECT policy did NOT. orders_select_unassigned (canonical
--   definition: 20260821_fix_orders_rls_recursion.sql; no later
--   migration redefines it) exposed every unassigned rider-delivery
--   order in 'Order confirmed' / 'Ready for pickup' status to approved
--   riders regardless of payment state. Only the frontend filter in
--   app.js (loadOrdersFromSupabase() pool query + rider() pending
--   filter) kept unpaid orders out of the Rider Hub — any direct API
--   client could still read them.
--
-- FIX (smallest safe change)
--   1. Recreate ONLY orders_select_unassigned, preserving every
--      existing condition and adding one server-side requirement:
--      payment_status = 'success'. A rider-pool order is now visible
--      server-side ONLY when it is paid. Orders whose payment is
--      'pending', 'failed', 'abandoned' (never stored — the webhook
--      maps abandoned events to 'failed'), or 'refunded' (the
--      orders_payment_status_check constraint's fourth value) are
--      NEVER returned to riders.
--   2. Defense-in-depth backstop: the claim branch of
--      enforce_order_status_transitions() (canonical definition:
--      20260930_critical_hardening.sql, copied verbatim here) accepted
--      the claim transition without checking payment state. RLS
--      already blocks unpaid claims via orders_update_claim, but RLS
--      is permissive-OR — the BEFORE UPDATE trigger is the independent
--      backstop, so its claim branch now also requires
--      OLD.payment_status = 'success'. Every other branch (admin,
--      customer, rider progression, vendor) is copied verbatim from
--      20260930.
--
-- NOT CHANGED
--   * place_order() still creates orders with status = 'Order
--     confirmed', payment_status = 'pending', delivery_method = 'rider'
--     (Paystack needs the order id before payment).
--   * Paystack initialization / payment RPCs / webhook / payments
--     ledger / refund architecture are untouched.
--   * The vendor → Preparing → Ready for pickup → rider workflow for
--     successfully paid orders is untouched.
--   * The rider notification trigger (20260917) is untouched — it
--     already requires NEW.payment_status = 'success' AND
--     NEW.status = 'Ready for pickup' AND NEW.rider_id IS NULL AND
--     NEW.delivery_method = 'rider', so pending/failed payments can
--     never notify riders.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Rider-pool SELECT: paid orders only.
--    Previous policy (20260821_fix_orders_rls_recursion.sql):
--      status IN ('Order confirmed', 'Ready for pickup')
--      AND rider_id IS NULL
--      AND delivery_method = 'rider'
--      AND public.is_approved_rider()
--    New: identical + payment_status = 'success'.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "orders_select_unassigned" ON public.orders;

CREATE POLICY "orders_select_unassigned" ON public.orders
  FOR SELECT
  USING (
    status IN ('Order confirmed', 'Ready for pickup')
    AND rider_id IS NULL
    AND delivery_method = 'rider'
    AND payment_status = 'success'
    AND public.is_approved_rider()
  );

-- ------------------------------------------------------------
-- 2. Transition-trigger backstop: a rider claim requires a paid
--    order. Body copied verbatim from 20260930_critical_hardening.sql
--    except for one line in the claim branch (OLD.payment_status).
--    The trigger trg_enforce_order_status_transitions (BEFORE UPDATE
--    ON orders, created in 20260901) stays attached: a same-signature
--    CREATE OR REPLACE FUNCTION does not need trigger recreation.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- ============================================================
-- SUMMARY
-- ============================================================
-- * orders_select_unassigned now requires payment_status = 'success'
--   in addition to the existing pool conditions, so unpaid orders
--   cannot be READ by riders server-side.
-- * enforce_order_status_transitions() claim branch requires
--   OLD.payment_status = 'success' (backstop on top of
--   orders_update_claim RLS, which 20260916 already gated).
-- * Unchanged: place_order() creation flow, Paystack functions,
--   webhook, payments/settlement/refund ledgers, notify trigger,
--   vendor workflow, and all other RLS policies.
-- ============================================================