-- ============================================================
-- 20260821_fix_orders_rls_recursion.sql
-- ============================================================
-- Fixes 42P17 "infinite recursion detected in policy for relation orders",
-- raised during checkout on `supabase.from('orders').insert(...).select()`
-- (i.e. any SELECT on orders, including the row echoed back after INSERT).
--
-- EXACT RECURSION CHAIN:
--   The `orders` SELECT policies contained inline subqueries over OTHER
--   RLS-enabled tables:
--     orders_select_unassigned -> EXISTS (SELECT 1 FROM riders ...)            [riders]
--     orders_select_assigned    -> rider_id IN (SELECT id FROM riders ...)     [riders]
--     orders_select_vendor      -> EXISTS (SELECT 1 FROM order_items oi
--                                 WHERE oi.order_id = orders.id
--                                   AND oi.vendor_id IN (SELECT vendor_id FROM profiles ...)) [order_items + profiles]
--   RLS is evaluated against the UNION of all SELECT policies, so ANY select
--   on orders (e.g. the row echoed by insert().select() in checkout) evaluates
--   those subqueries WITH RLS still active on riders / order_items / profiles.
--   Those tables' policies point back at orders:
--     riders_select_order_assigned -> id IN (SELECT rider_id FROM orders ...)        [orders]
--     order_items_select_own/rider -> order_id IN (SELECT id FROM orders ...)       [orders]
--     profiles_select_rider_details -> id IN (SELECT user_id FROM riders ...)      [riders -> orders ... ]
--   => orders -> riders -> orders -> ...  (and orders -> order_items -> orders -> ...)
--      => 42P17 infinite recursion in policy for relation "orders".
--
-- FIX (smallest secure change): replace ONLY the cross-table subqueries that
-- live inside the `orders` SELECT/UPDATE policies with SECURITY DEFINER helper
-- functions. Each helper executes as the table owner (postgres) and therefore
-- BYPASSES RLS on the inner table(s), which breaks the cycle. Once the `orders`
-- policies are self-contained (function-based), every other table's inline
-- reference back into orders is transitively safe, so riders / order_items /
-- profiles / products / rider_ratings policies need NO changes. RLS stays
-- ENABLED on every table.
--
-- Constraints honoured:
--   * No references to orders.vendor_id (vendor access is derived from
--     order_items.vendor_id, per the live schema).
--   * No schema changes: no ADD/DROP COLUMN, no CREATE/DROP TABLE, no new cols.
--   * No changes to prevent_profile_role_escalation(), is_admin(),
--     prevent_rider_status_escalation(), or prevent_order_unauthorized_changes().
--   * role on every created profile stays 'user' (enforced by the trigger + app).
--   * No dynamic SQL; every helper uses SET search_path = public.
-- ============================================================

-- ============================================================
-- Helper functions (SECURITY DEFINER bypass RLS on inner tables).
-- Owned by the migration runner (postgres = table owner), so internal
-- queries run with row_security effectively OFF -> no policy re-entry.
-- ============================================================

-- True when the authenticated user is an APPROVED rider.
-- Replaces: EXISTS (SELECT 1 FROM riders WHERE user_id = auth.uid() AND status = 'approved')
CREATE OR REPLACE FUNCTION public.is_approved_rider()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.riders
    WHERE user_id = auth.uid() AND status = 'approved'
  );
$$;

-- True when the authenticated user is an APPROVED AND available rider
-- (used by the rider "claim" update policy).
CREATE OR REPLACE FUNCTION public.is_available_rider()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.riders
    WHERE user_id = auth.uid()
      AND status = 'approved'
      AND available = true
  );
$$;

-- True when the caller owns the rider row with key `rid`.
-- Replaces: rider_id IN (SELECT id FROM riders WHERE user_id = auth.uid())
CREATE OR REPLACE FUNCTION public.caller_owns_rider(rid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.riders
    WHERE id = rid AND user_id = auth.uid()
  );
$$;

-- True when an order contains at least one line belonging to the caller's
-- own vendor (profiles.vendor_id -> vendors.id). Queries BOTH order_items and
-- profiles as the table owner, so neither table's RLS is re-entered.
-- Replaces the inline EXISTS (SELECT ... FROM order_items ... vendor_id IN
-- (SELECT vendor_id FROM profiles WHERE id = auth.uid() AND role = 'vendor')).
CREATE OR REPLACE FUNCTION public.order_has_vendor_item(oid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = oid
      AND oi.vendor_id = (
        SELECT vendor_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'vendor'
      )
  );
$$;

-- ============================================================
-- Grants: the authenticated role must be able to call the helpers from
-- within RLS policy expressions. (is_admin() already grants to authenticated.)
-- ============================================================
GRANT EXECUTE ON FUNCTION public.is_approved_rider() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_available_rider() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caller_owns_rider(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_has_vendor_item(uuid) TO authenticated;

-- ============================================================
-- Rewrite ONLY the orders SELECT/UPDATE policies that held inline
-- cross-table subqueries. All other policies are left untouched.
-- ============================================================

-- 1. Rider pool (incl. 'Ready for pickup'). Rider-approval check -> function.
DROP POLICY IF EXISTS "orders_select_unassigned" ON public.orders;
CREATE POLICY "orders_select_unassigned" ON public.orders
  FOR SELECT
  USING (
    status IN ('Order confirmed', 'Ready for pickup')
    AND rider_id IS NULL
    AND delivery_method = 'rider'
    AND public.is_approved_rider()
  );

-- 2. Orders assigned to the caller's own rider row. Rider-ownership check -> function.
DROP POLICY IF EXISTS "orders_select_assigned" ON public.orders;
CREATE POLICY "orders_select_assigned" ON public.orders
  FOR SELECT
  USING (
    public.caller_owns_rider(rider_id)
  );

-- 3. Vendor order visibility: order contains one of the caller's vendor's items.
--    (order_items + profiles lookup -> SECURITY DEFINER helper, bypasses their RLS.)
DROP POLICY IF EXISTS "orders_select_vendor" ON public.orders;
CREATE POLICY "orders_select_vendor" ON public.orders
  FOR SELECT
  USING (
    public.order_has_vendor_item(orders.id)
  );

-- 4. Rider claim. Rider availability/ownership checks -> functions.
DROP POLICY IF EXISTS "orders_update_claim" ON public.orders;
CREATE POLICY "orders_update_claim" ON public.orders
  FOR UPDATE
  USING (
    status IN ('Order confirmed', 'Ready for pickup')
    AND rider_id IS NULL
    AND delivery_method = 'rider'
    AND public.is_available_rider()
  )
  WITH CHECK (
    public.caller_owns_rider(rider_id)
    AND status = 'Rider assigned'
  );

-- 5. Rider update of already-assigned orders. Rider-ownership check -> function.
DROP POLICY IF EXISTS "orders_update_assigned" ON public.orders;
CREATE POLICY "orders_update_assigned" ON public.orders
  FOR UPDATE
  USING (
    public.caller_owns_rider(rider_id)
  )
  WITH CHECK (
    public.caller_owns_rider(rider_id)
    AND status IN ('Picked up', 'Delivered')
  );

-- 6. Vendor order updates: order must contain the caller's vendor's items.
--    (order_items + profiles lookup -> SECURITY DEFINER helper.)
DROP POLICY IF EXISTS "orders_update_vendor" ON public.orders;
CREATE POLICY "orders_update_vendor" ON public.orders
  FOR UPDATE
  USING (
    public.order_has_vendor_item(orders.id)
  )
  WITH CHECK (
    public.order_has_vendor_item(orders.id)
    AND status IN ('Order confirmed', 'Preparing', 'Ready for pickup', 'Delivered', 'Cancelled')
    AND delivery_method IN ('rider', 'vendor_self', 'both')
  );

-- Keep these untouched (already safe, no cross-table subqueries):
--   orders_select_own        (user_id = auth.uid())
--   orders_select_admin      (public.is_admin())
--   orders_insert_own        (user_id = auth.uid())
--   orders_update_own_rating (user_id = auth.uid() AND status = 'Delivered')
--   orders_update_admin      (public.is_admin())
--   orders_delete_admin      (public.is_admin())
