-- ============================================================
-- PRE-FIX RLS POLICY BACKUP — VERIFIED FROM pg_policies
-- ============================================================
-- Database: CampusRun (Supabase)
-- Verified: 2026-08-15 (authenticated user's confirmation)
--
-- IMPORTANT:
--   This file is a READ-ONLY REFERENCE of the Row Level Security
--   policies that existed BEFORE the security-hardening migration
--   (20260815_fix_rls_security.sql) is run.
--
--   It recreates the CURRENT (pre-fix) policies EXACTLY as they
--   appear in the verified pg_policies dump (policy name, command,
--   role, USING/qual, WITH CHECK).
--
--   It is NOT meant to be executed as part of normal operation.
--   It exists ONLY so you can restore the exact pre-fix RLS state
--   if you ever need to roll back the hardening migration.
--
--   This file does NOT disable RLS, does NOT touch data, and does
--   NOT use a service role key.
--
-- Restore procedure (ONLY if you intentionally want the pre-fix
-- state back AFTER running 20260815_fix_rls_security.sql):
--   1. Drop the policies created by the hardening migration, OR
--      run the hardening migration's DROP POLICY loop again.
--   2. Run this file in the Supabase SQL editor.
--
-- Full pg_policies source (14 policies):
--   SELECT schemaname, tablename, policyname, permissive, roles,
--          cmd, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
-- ============================================================

-- ============================================================
-- TABLE: public.order_items (2 policies)
-- ============================================================

-- Command: INSERT | Roles: {public}
CREATE POLICY "Users can create their own order items"
  ON public.order_items
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

-- Command: SELECT | Roles: {public}
CREATE POLICY "Users can view their own order items"
  ON public.order_items
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: orders (4 policies)
-- ============================================================

-- Command: UPDATE | Roles: {authenticated}
CREATE POLICY "Approved riders can claim and update deliveries"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    (
      status = 'Order confirmed'
      AND rider_id IS NULL
      AND EXISTS (
        SELECT 1 FROM riders r
        WHERE r.user_id = auth.uid()
          AND r.status = 'approved'
      )
    )
    OR
    (
      rider_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM riders r
        WHERE r.id = orders.rider_id
          AND r.user_id = auth.uid()
          AND r.status = 'approved'
      )
    )
  )
  WITH CHECK (
    rider_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = orders.rider_id
        AND r.user_id = auth.uid()
        AND r.status = 'approved'
    )
  );

-- Command: SELECT | Roles: {authenticated}
CREATE POLICY "Approved riders can view delivery orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = orders.rider_id
        AND r.user_id = auth.uid()
        AND r.status = 'approved'
    )
    OR
    (
      status = 'Order confirmed'
      AND rider_id IS NULL
      AND EXISTS (
        SELECT 1 FROM riders r
        WHERE r.user_id = auth.uid()
          AND r.status = 'approved'
      )
    )
  );

-- Command: INSERT | Roles: {public}
CREATE POLICY "Users can create their own orders"
  ON public.orders
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

-- Command: SELECT | Roles: {public}
CREATE POLICY "Users can view their own orders"
  ON public.orders
  FOR SELECT
  TO public
  USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: products (1 policy)
-- ============================================================

-- Command: SELECT | Roles: {public}
CREATE POLICY "Anyone can view products"
  ON public.products
  FOR SELECT
  TO public
  USING (true);

-- ============================================================
-- TABLE: profiles (3 policies)
-- ============================================================

-- Command: INSERT | Roles: {public}
CREATE POLICY "Users can create their own profile"
  ON public.profiles
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = id);

-- Command: UPDATE | Roles: {public}
-- NOTE: pg_policies.with_check was NULL, so the policy has NO
-- explicit WITH CHECK clause — PostgreSQL uses the USING
-- expression as the default check. Recreated exactly as-is.
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO public
  USING (auth.uid() = id);

-- Command: SELECT | Roles: {public}
CREATE POLICY "Users can view their own profile"
  ON public.profiles
  FOR SELECT
  TO public
  USING (auth.uid() = id);

-- ============================================================
-- TABLE: riders (3 policies)
-- ============================================================

-- Command: INSERT | Roles: {public}
CREATE POLICY "riders_insert_own"
  ON public.riders
  FOR INSERT
  TO public
  WITH CHECK (auth.uid() = user_id);

-- Command: SELECT | Roles: {public}
CREATE POLICY "riders_select_own"
  ON public.riders
  FOR SELECT
  TO public
  USING (auth.uid() = user_id);

-- Command: UPDATE | Roles: {public}
-- NOTE: original policy.with_check = NULL for this UPDATE policy,
-- so there is no explicit WITH CHECK clause (PostgreSQL defaults
-- to the USING expression). Recreated exactly as-is.
CREATE POLICY "riders_update_own"
  ON public.riders
  FOR UPDATE
  TO public
  USING (auth.uid() = user_id);

-- ============================================================
-- TABLE: vendors (1 policy)
-- ============================================================

-- Command: SELECT | Roles: {public}
CREATE POLICY "Anyone can view vendors"
  ON public.vendors
  FOR SELECT
  TO public
  USING (true);

-- ============================================================
-- END OF PRE-FIX RLS POLICY BACKUP (14 policies)
-- ============================================================
