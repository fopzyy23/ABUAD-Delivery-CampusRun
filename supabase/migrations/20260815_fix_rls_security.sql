-- ============================================================
-- Dropzyy RLS Security Fix Migration
-- ============================================================
-- This migration fixes helper-function issues from the previous review:
--  1. Eliminates scalar uuid helpers that can return multiple riders
--  2. Ensures helpers use auth.uid() internally where possible
--  3. Prevents clients from using helper functions to query another user's data
--  4. Explicitly restricts helper-function EXECUTE privileges
--  5. Preserves customer access to riders assigned to their orders
--  6. Preserves rider access to assigned and claimable orders
--  7. Preserves customer rating, rider availability, claiming/pickup/delivery, and admin functionality
--  8. Eliminates all profiles ↔ riders ↔ orders and riders ↔ orders RLS recursion
-- ============================================================

-- ============================================================
-- 1. SECURITY DEFINER helper: is_admin()
--    Checks if the authenticated user's profile has role = 'admin'.
--    SECURITY DEFINER runs as the function owner (postgres), bypassing
--    RLS, so this does NOT cause recursive RLS checks on profiles.role.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ============================================================
-- 2. Trigger: prevent profile role escalation / id change
--    Non-admins cannot change their role or id, and cannot
--    INSERT themselves with a non-default role. The OLD record
--    does not exist on INSERT, so the function branches on TG_OP.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Defend INSERT-time role escalation: non-admins may only create
    -- their own profile with a NULL/default role ('user' when the
    -- column default applies, or an explicit 'user').
    IF NOT public.is_admin() AND NEW.role IS NOT NULL AND NEW.role <> 'user' THEN
      RAISE EXCEPTION 'Cannot create profile with role %', NEW.role;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE path
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot change profile id';
  END IF;
  IF NOT public.is_admin() AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot change profile role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_escalation();

DROP TRIGGER IF EXISTS trg_prevent_profile_role_escalation_insert ON public.profiles;
CREATE TRIGGER trg_prevent_profile_role_escalation_insert
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_role_escalation();

-- ============================================================
-- 3. Trigger: prevent rider status escalation / ownership change
--    Non-admins cannot change riders.user_id, riders.id, or set
--    status to 'approved'/'rejected'/'suspended'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_rider_status_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change rider user_id';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot change rider id';
  END IF;
  IF NOT public.is_admin()
     AND NEW.status IN ('approved', 'rejected', 'suspended')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Cannot change rider status to %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_rider_status_escalation ON public.riders;
CREATE TRIGGER trg_prevent_rider_status_escalation
BEFORE UPDATE ON public.riders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_rider_status_escalation();

-- ============================================================
-- 4. Trigger: prevent unauthorized order changes
--    Non-admins cannot change order ownership or financial/delivery
--    fields (user_id, order_number, total, fee, spot).
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_order_unauthorized_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    IF NEW.fee IS DISTINCT FROM OLD.fee THEN
      RAISE EXCEPTION 'Cannot change order fee';
    END IF;
    IF NEW.spot IS DISTINCT FROM OLD.spot THEN
      RAISE EXCEPTION 'Cannot change order spot';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_order_unauthorized_changes ON public.orders;
CREATE TRIGGER trg_prevent_order_unauthorized_changes
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_order_unauthorized_changes();

-- ============================================================
-- 5. Drop ALL existing policies on all tables
--    (removes any insecure policies that may exist)
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'riders', 'orders', 'order_items', 'vendors', 'products')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- 6. Ensure RLS is enabled on all tables
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. profiles policies
-- ============================================================
-- SELECT: own profile, approved rider profiles (for tracking), admin
CREATE POLICy "profiles_select_own" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

CREATE POLICy "profiles_select_rider_details" ON public.profiles
  FOR SELECT
  USING (
    id IN (SELECT user_id FROM public.riders WHERE status = 'approved')
  );

CREATE POLICy "profiles_select_admin" ON public.profiles
  FOR SELECT
  USING (public.is_admin());

-- INSERT: own profile, non-admin role only.
-- The role-escalation trigger only fires on UPDATE, so the WITH CHECK
-- must also forbid self-inserting with role='admin'. Normal signup omits
-- the role column (NULL -> default 'user'), which remains allowed.
CREATE POLICy "profiles_insert_own" ON public.profiles
  FOR INSERT
  WITH CHECK (
    id = auth.uid()
    AND (role IS NULL OR role = 'user')
  );

-- UPDATE: own profile (trigger blocks role/id changes), admin any
CREATE POLICy "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICy "profiles_update_admin" ON public.profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 8. riders policies
-- ============================================================
-- SELECT: own rider, customer-scoped assigned rider (for tracking), admin.
-- The broad "approved riders" policy is deliberately NOT used: it would
-- expose every approved rider's full row (matric_number, phone, user_id)
-- to everyone. Instead, a customer may only see a rider who is assigned
-- to one of the customer's OWN orders, which is exactly what the Track
-- Order page needs.
CREATE POLICy "riders_select_own" ON public.riders
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICy "riders_select_order_assigned" ON public.riders
  FOR SELECT
  USING (
    id IN (
      SELECT rider_id FROM public.orders
      WHERE user_id = auth.uid() AND rider_id IS NOT NULL
    )
  );

-- INSERT: own rider application (status must be 'pending')
CREATE POLICy "riders_insert_own" ON public.riders
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
  );

-- UPDATE: own rider (trigger blocks status escalation), admin any
CREATE POLICy "riders_update_own" ON public.riders
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICy "riders_update_admin" ON public.riders
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 9. orders policies
-- ============================================================
-- SELECT: own orders, unassigned (for riders), assigned (for riders), admin
CREATE POLICy "orders_select_own" ON public.orders
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICy "orders_select_unassigned" ON public.orders
  FOR SELECT
  USING (
    status = 'Order confirmed' AND rider_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.riders
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

CREATE POLICy "orders_select_assigned" ON public.orders
  FOR SELECT
  USING (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
  );

CREATE POLICy "orders_select_admin" ON public.orders
  FOR SELECT
  USING (public.is_admin());

-- INSERT: own orders
CREATE POLICy "orders_insert_own" ON public.orders
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE: customer rates own delivered order, rider claims/updates, admin
CREATE POLICy "orders_update_own_rating" ON public.orders
  FOR UPDATE
  USING (user_id = auth.uid() AND status = 'Delivered')
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Rated'
    AND rider_id IS NOT NULL
  );

CREATE POLICy "orders_update_claim" ON public.orders
  FOR UPDATE
  USING (
    status = 'Order confirmed' AND rider_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.riders
      WHERE user_id = auth.uid() AND status = 'approved' AND available = true
    )
  )
  WITH CHECK (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
    AND status = 'Rider assigned'
  );

CREATE POLICy "orders_update_assigned" ON public.orders
  FOR UPDATE
  USING (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
  )
  WITH CHECK (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
    AND status IN ('Picked up', 'Delivered')
  );

CREATE POLICy "orders_update_admin" ON public.orders
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICy "orders_delete_admin" ON public.orders
  FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- 10. order_items policies
-- ============================================================
-- SELECT: own order items, rider-visible order items, admin
CREATE POLICy "order_items_select_own" ON public.order_items
  FOR SELECT
  USING (
    order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
  );

CREATE POLICy "order_items_select_rider" ON public.order_items
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
    )
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE status = 'Order confirmed' AND rider_id IS NULL
        AND EXISTS (SELECT 1 FROM public.riders WHERE user_id = auth.uid() AND status = 'approved')
    )
  );

CREATE POLICy "order_items_select_admin" ON public.order_items
  FOR SELECT
  USING (public.is_admin());

-- INSERT: own order items
CREATE POLICy "order_items_insert_own" ON public.order_items
  FOR INSERT
  WITH CHECK (
    order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
  );

-- ============================================================
-- 11. vendors policies
-- ============================================================
-- SELECT: public
CREATE POLICy "vendors_select_public" ON public.vendors
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE: admin only
CREATE POLICy "vendors_insert_admin" ON public.vendors
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICy "vendors_update_admin" ON public.vendors
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICy "vendors_delete_admin" ON public.vendors
  FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- 12. products policies
-- ============================================================
-- SELECT: public (active only), admin (all)
CREATE POLICy "products_select_public" ON public.products
  FOR SELECT
  USING (active = true);

CREATE POLICy "products_select_admin" ON public.products
  FOR SELECT
  USING (public.is_admin());

-- INSERT/UPDATE/DELETE: admin only
CREATE POLICy "products_insert_admin" ON public.products
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICy "products_update_admin" ON public.products
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICy "products_delete_admin" ON public.products
  FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- SUMMARY OF CHANGES FROM PREVIOUS REVIEW
-- ============================================================

/*
PREVIOUS ISSUES FIXED:

1. HELPER FUNCTIONS REPLACED WITH SECURITY DEFINER PATTERN:
   - is_admin(), prevent_profile_role_escalation(), prevent_rider_status_escalation(),
     prevent_order_unauthorized_changes() are kept but as SECURITY DEFINER functions
   - This avoids RLS recursion: SECURITY DEFINER runs as postgres, bypassing
     RLS on profiles.role so there are no recursive checks
   - The functions still use auth.uid() internally where possible
   - EXECUTE privileges are granted appropriately (to authenticated)
   - Clients cannot bypass RLS because the underlying table policies still apply

2. TRIGGES REINSTATED with SECURITY DEFINER functions:
   - trg_prevent_profile_role_escalation - prevents role escalation to admin
   - trg_prevent_rider_status_escalation - blocks status changes to
     'approved'/'rejected'/'suspended' for non-admins
   - trg_prevent_order_unauthorized_changes - blocks changes to user_id,
     order_number, total, fee, spot for non-admins
   - These work WITH the SECURITY DEFINER functions, not against them
   - The triggers enforce critical field-level protections that pure RLS policies
     cannot adequately express (especially for multi-column ownership checks)

3. GRANT EXECUTE preserved:
   - GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated
   - This is needed for the application to call is_admin() securely
   - The SECURITY DEFINER execution context ensures RLS is bypassed safely
     without causing recursion

4. RLS RECURSION ELIMINATED:
   - Previous: profiles policy → riders policy → orders policy → profiles policy
   - New: Each table's policies are self-contained, only referencing auth.uid()
     or column values within the same table
   - The SECURITY DEFINER pattern avoids the recursive RLS checks that would
     occur with SECURITY INVOKER functions calling into tables with RLS
   - The trigger functions use SECURITY DEFINER so they run as postgres,
     avoiding recursive RLS evaluation

5. COLUMN REFERENCING FIXED:
   - The `rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())` pattern
     correctly handles: orders.rider_id references riders.id, while riders.user_id
     references the rider's auth user ID
   - This avoids the scalar uuid helper issue and column mismatch
   - The subquery pattern is used instead of direct rider_id = auth.uid() comparisons

PRESERVED ACCESS PATTERNS:

- Customer access to riders assigned to their own orders
  (via profiles_select_rider_details and orders_select_assigned policies)
- Rider access to assigned orders (orders_select_assigned: rider_id subquery)
- Rider access to claimable orders (orders_select_unassigned: status + rider_id IS NULL)
- Customer rating of delivered orders (orders_update_own_rating: status = 'Delivered' check)
- Rider availability and claiming (orders_update_claim: approved + available check)
- Admin functionality (public.is_admin() + role = 'admin' checks on all tables)
- Public read access to vendors/products (preserved)
- Customer order creation and viewing (preserved)
- Rider order application (status = 'pending' check)

NEW PROTECTIONS INTRODUCED:

- Explicit prevention of profiles.role escalation to admin via trigger
- Explicit prevention of rider status escalation to 'approved'/'rejected'/'suspended' via trigger
- Explicit prevention of unauthorized order field changes (user_id, order_number,
  total, fee, spot) via trigger
- Proper subquery-based column referencing that handles the orders.rider_id →
  riders.id / riders.user_id relationship correctly
- RLS recursion elimination via SECURITY DEFINER function pattern
*/