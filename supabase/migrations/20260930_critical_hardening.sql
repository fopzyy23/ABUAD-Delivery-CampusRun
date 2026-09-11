-- ============================================================
-- 20260930_critical_hardening.sql
-- Post-review hardening pass 1 (2026-09-30). Corrective /
-- idempotent. Safe to run against the live database via the
-- Supabase SQL editor.
--
-- Fixes shipped by this migration:
--   1. Payment RPCs (create_pending_payment,
--      handle_paystack_payment_success,
--      handle_paystack_payment_failed) are callable by anon —
--      SECURITY DEFINER + no EXECUTE lockdown. Now EXECUTE is
--      revoked from PUBLIC / anon / authenticated and granted
--      to service_role only (the paystack-initialize EF and the
--      paystack-webhook EF are the only legitimate callers, and
--      both run with the service-role key).
--   2. Direct INSERT on orders / order_items is revoked from
--      anon + authenticated (restores 20260906 intent; this
--      migration also drops the now-unused orders_insert_own /
--      order_items_insert_own policies so no future GRANT can
--      re-open the bypass). Checkouts go exclusively through the
--      place_order() SECURITY DEFINER RPC.
--   3. enforce_order_item_pricing() gains an upper quantity cap
--      (1..99) — the RPC already caps at 99; this is a
--      defense-in-depth floor for direct writes.
--   4. delivery_settlements.rider_id referenced public.profiles(id)
--      but orders.rider_id / withdrawal_requests.rider_id reference
--      public.riders(id). generate_settlement() therefore aborted
--      on FK violation for every assigned-rider order. The FK now
--      points at public.riders(id) and the rider recipient lookup
--      resolves the rider's profile via riders.user_id.
--   5. riders_read_own_deliveries compared rider_id to auth.uid()
--      (profiles id) — meaningless once rider_id is a riders.id.
--      Rewritten to resolve the caller's riders rows.
--   6. enforce_order_status_transitions() still gated the vendor
--      branch on roles.role = 'vendor', but 20260922 moved vendor
--      capability to profiles.vendor_id IS NOT NULL — new vendors
--      (role 'user') were locked out of status transitions. The
--      branch now uses public.order_has_vendor_item().
--   7. Refund workflow hardening:
--        * refunds.status CHECK gains 'processing';
--        * approve_refund() accepts 'requested' OR 'failed'
--          (failed refreshes can now be re-approved for retry);
--        * claim_refund_for_execution() atomically flips
--          'approved' → 'processing' so the paystack-refund Edge
--          Function cannot double-execute (TOCTOU closure).
--          service_role-only.
--        * release_stuck_refund() moves a stranded 'processing'
--          row back to 'failed' for review/retry. service_role-only.
--        * refunds_select_admin policy lets admins SEE all refunds
--          (the admin refund UI was completely blind without it).
--   8. generate_settlement() now requires is_admin() — it was
--      callable by any authenticated user (was granted EXECUTE in
--      20260927).
--   9. Indexes for the hot queries: rider pool listing, assigned
--      orders, user orders, payment status.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Payment RPC EXECUTE lockdown → service_role only
-- ------------------------------------------------------------
-- These RPCs are SECURITY DEFINER and mutate money/order state.
-- The browser never calls them directly: paystack-initialize and
-- paystack-webhook (both running with the service-role key) are
-- the only legitimate callers.
DO $$
DECLARE
  v_sig regprocedure;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_pending_payment',
        'handle_paystack_payment_success',
        'handle_paystack_payment_failed'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2. Direct INSERT on orders / order_items → closed for clients
-- ------------------------------------------------------------
-- Restates the 20260906 lockdown (currently the final word in the
-- migration history) and removes the now-inert permissive INSERT
-- policies so no future GRANT can silently re-open the bypass.
REVOKE INSERT ON public.orders FROM anon, authenticated;
REVOKE INSERT ON public.order_items FROM anon, authenticated;

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
DROP POLICY IF EXISTS "order_items_insert_own" ON public.order_items;

-- ------------------------------------------------------------
-- 3. Quantity ceiling in the pricing trigger (defense in depth)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_order_item_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
BEGIN
  IF NEW.qty IS NULL OR NEW.qty < 1 THEN
    RAISE EXCEPTION 'order item quantity must be at least 1';
  END IF;
  IF NEW.qty > 99 THEN
    RAISE EXCEPTION 'order item quantity cannot exceed 99';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id::text = NEW.product_id::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', NEW.product_id;
  END IF;
  IF v_product.active IS NOT TRUE THEN
    RAISE EXCEPTION 'product % is no longer available', NEW.product_id;
  END IF;

  -- Authoritative values only: anything client-supplied in these columns
  -- is discarded and re-derived from the products table.
  NEW.price     := v_product.price;
  NEW.vendor_id := v_product.vendor_id;
  NEW.name      := v_product.name;
  NEW.icon      := COALESCE(v_product.icon, NEW.icon, '');

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 4. delivery_settlements.rider_id → public.riders(id)
-- ------------------------------------------------------------
-- orders.rider_id and withdrawal_requests.rider_id already reference
-- public.riders(id); the settlement ledger pointed at profiles(id),
-- so assigned-rider settlements could never be written.
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.delivery_settlements'::regclass
    AND contype = 'f'
    AND confrelid = 'public.profiles'::regclass;
  IF FOUND THEN
    EXECUTE format('ALTER TABLE public.delivery_settlements DROP CONSTRAINT %I', v_conname);
  END IF;

  -- Defensive: null out any legacy rider_id value that does not resolve
  -- in public.riders (legacy rows could hold a profiles id). NULL is
  -- permitted by the FK and means "no rider" (vendor-self delivery).
  UPDATE public.delivery_settlements ds
  SET rider_id = NULL
  WHERE ds.rider_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.riders r WHERE r.id = ds.rider_id);
END $$;

ALTER TABLE public.delivery_settlements DROP CONSTRAINT IF EXISTS delivery_settlements_rider_id_fkey;
ALTER TABLE public.delivery_settlements
  ADD CONSTRAINT delivery_settlements_rider_id_fkey
  FOREIGN KEY (rider_id) REFERENCES public.riders(id);

-- Riders read only their OWN settlement rows (resolved via riders.user_id).
DROP POLICY IF EXISTS "riders_read_own_deliveries" ON public.delivery_settlements;
CREATE POLICY "riders_read_own_deliveries" ON public.delivery_settlements
  FOR SELECT TO authenticated
  USING (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 5. generate_settlement(): admin gate + rider recipient fix
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_settlement(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_item record;
  v_count integer;
  v_vendor_settlement_id uuid;
  v_delivery_settlement_id uuid;
  v_recipient public.transfer_recipients%ROWTYPE;
  v_transfer_result jsonb;
BEGIN
  -- Settlement creation is an administrative action — never called by the
  -- customer or vendor UI. Previously callable by any authenticated user.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE order_id = p_order_id AND status = 'success' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % has no successful payment - cannot settle', p_order_id;
  END IF;

  IF v_order.status != 'Delivered' THEN
    RAISE EXCEPTION 'Order % is not Delivered (status: %) - cannot settle', p_order_id, v_order.status;
  END IF;

  SELECT count(*) INTO v_count FROM public.vendor_settlements WHERE order_id = p_order_id;
  IF v_count > 0 THEN
    RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', true, 'vendor_settlements', v_count);
  END IF;

  FOR v_item IN
    SELECT oi.vendor_id, SUM(oi.price * oi.qty) AS total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.vendor_id
  LOOP
    INSERT INTO public.vendor_settlements (order_id, vendor_id, amount, status)
    VALUES (p_order_id, v_item.vendor_id, v_item.total, 'pending')
    RETURNING id INTO v_vendor_settlement_id;

    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'vendor' AND vendor_id = v_item.vendor_id;

    IF FOUND THEN
      BEGIN
        v_transfer_result := public.create_pending_transfer(
          p_vendor_settlement_id := v_vendor_settlement_id,
          p_paystack_reference := gen_random_uuid()::text,
          p_recipient_code := v_recipient.recipient_code
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create pending transfer for vendor settlement %: %', v_vendor_settlement_id, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Use the authoritative stored split columns (rider 1000 / company 500
  -- for new orders; backfilled 80/20 for historical rows).
  INSERT INTO public.delivery_settlements (order_id, rider_id, delivery_fee, rider_amount, platform_amount, status)
  VALUES (
    p_order_id,
    v_order.rider_id,
    v_order.fee,
    v_order.rider_delivery_share,
    v_order.company_delivery_share,
    'pending'
  )
  RETURNING id INTO v_delivery_settlement_id;

  -- FIX: orders.rider_id is a riders.id — resolve the rider's profile via
  -- riders.user_id. Previously the lookup compared profile_id with a
  -- riders.id that never matched any profile, silently skipping transfers.
  IF v_order.rider_id IS NOT NULL THEN
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'rider'
      AND profile_id = (SELECT user_id FROM public.riders WHERE id = v_order.rider_id);

    IF FOUND THEN
      BEGIN
        v_transfer_result := public.create_pending_transfer(
          p_delivery_settlement_id := v_delivery_settlement_id,
          p_paystack_reference := gen_random_uuid()::text,
          p_recipient_code := v_recipient.recipient_code
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create pending transfer for delivery settlement %: %', v_delivery_settlement_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', false);
END;
$$;

-- ------------------------------------------------------------
-- 6. Order status transitions: vendor capability via vendor_id
-- ------------------------------------------------------------
-- 20260922 moved vendor capability to profiles.vendor_id IS NOT NULL;
-- the trigger still keyed the vendor branch on roles.role = 'vendor',
-- which locked new vendors (role 'user') out of the Preparing / Ready
-- for pickup / vendor-self Delivered transitions.
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
    IF OLD.rider_id IS NULL
       AND OLD.status IN ('Order confirmed', 'Ready for pickup')
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
-- 7. Refund workflow: 'processing', claim/release, failed retry
-- ------------------------------------------------------------
-- 7a. Rebuild the status CHECK to include 'processing'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.refunds'::regclass
      AND contype = 'c'
      AND conname = 'refunds_status_check'
  ) THEN
    ALTER TABLE public.refunds DROP CONSTRAINT refunds_status_check;
  END IF;
END $$;

ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_status_check
    CHECK (status IN ('requested', 'approved', 'rejected', 'pending', 'processed', 'failed', 'processing'));

-- 7b. approve_refund(): 'requested' OR 'failed' → 'approved'.
--     A previously-failed refund can now be re-approved for a retry.
CREATE OR REPLACE FUNCTION public.approve_refund(
  p_refund_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
  v_prev text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

  IF v_refund.status NOT IN ('requested', 'failed') THEN
    RAISE EXCEPTION 'Refund % has status % — only ''requested'' or ''failed'' refunds can be approved',
      p_refund_id, v_refund.status;
  END IF;

  v_prev := v_refund.status;

  UPDATE public.refunds
  SET status = 'approved', updated_at = now()
  WHERE id = p_refund_id;

  RETURN json_build_object(
    'refund_id', p_refund_id,
    'status', 'approved',
    'previous_status', v_prev
  );
END;
$$;

-- 7c. claim_refund_for_execution(): atomic 'approved' → 'processing'.
--     Called by the paystack-refund Edge Function under service_role
--     BEFORE any Paystack API call. Only one caller per approved refund
--     can ever claim, closing the read-check-then-act race.
CREATE OR REPLACE FUNCTION public.claim_refund_for_execution(p_refund_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
BEGIN
  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

  IF v_refund.status = 'processing' THEN
    RETURN json_build_object(
      'refund_id', p_refund_id,
      'status', 'processing',
      'claim', false,
      'reason', 'Refund is already being processed'
    );
  END IF;

  IF v_refund.status != 'approved' THEN
    RAISE EXCEPTION 'Refund % has status % — only ''approved'' refunds can be claimed for execution',
      p_refund_id, v_refund.status;
  END IF;

  UPDATE public.refunds
  SET status = 'processing', updated_at = now()
  WHERE id = p_refund_id;

  RETURN json_build_object(
    'refund_id', p_refund_id,
    'status', 'processing',
    'claim', true,
    'previous_status', 'approved'
  );
END;
$$;

-- 7d. release_stuck_refund(): service-role escapes hatch for a refund that
--     crashed mid-execution (claimed 'processing' but the function never
--     resolved it). Moves it back to 'failed' so an admin can re-approve.
CREATE OR REPLACE FUNCTION public.release_stuck_refund(p_refund_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
BEGIN
  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

  IF v_refund.status != 'processing' THEN
    RAISE EXCEPTION 'Refund % has status % — only ''processing'' refunds can be released',
      p_refund_id, v_refund.status;
  END IF;

  UPDATE public.refunds
  SET status = 'failed', updated_at = now()
  WHERE id = p_refund_id;

  RETURN json_build_object(
    'refund_id', p_refund_id,
    'status', 'failed',
    'previous_status', 'processing'
  );
END;
$$;

-- 7e. EXECUTE lockdown for the new server-only RPCs.
REVOKE ALL ON FUNCTION public.claim_refund_for_execution(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_refund_for_execution(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.release_stuck_refund(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stuck_refund(uuid) TO service_role;

-- 7f. Admins can SEE all refunds. Without this the refunds RPCs worked but
--     the admin UI rendered nothing (customers_read_own_refunds only ever
--     matched the admin's own orders).
CREATE POLICY "refunds_select_admin" ON public.refunds
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 8. Indexes for hot queries
-- ------------------------------------------------------------
-- Rider "available deliveries" pool: unassigned, paid, rider-delivery.
CREATE INDEX IF NOT EXISTS idx_orders_pool
  ON public.orders (status, delivery_method, payment_status)
  WHERE rider_id IS NULL;

-- "My orders" and beginner rider / vendor order listing.
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_rider_id ON public.orders (rider_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders (payment_status);

-- ============================================================
-- SUMMARY
-- ============================================================
-- * Payment RPCs: service_role EXECUTE only
-- * orders / order_items direct INSERT: anon + authenticated revoked,
--   permissive INSERT policies dropped
-- * order item quantity: 1..99 (trigger floor + RPC cap)
-- * delivery_settlements.rider_id → public.riders(id); rider read policy
--   resolved via riders.user_id
-- * generate_settlement: is_admin() gate + rider recipient via riders.user_id
-- * order status transitions: vendor branch uses order_has_vendor_item()
-- * refunds: 'processing' status; approve_refund accepts failed→approved;
--   claim_refund_for_execution + release_stuck_refund (service_role);
--   refunds_select_admin policy
-- * New indexes on orders: pool, user_id, rider_id, payment_status
-- ============================================================