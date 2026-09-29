-- ============================================================
-- 20261217_fix_aal2_policy_safety.sql
-- ============================================================
-- Converts require_admin_aal2() from a throwing function to a boolean
-- predicate for safe use in RLS policies. The original throwing behavior
-- is preserved for RPC callers that need it, while policies get a
-- non-throwing variant that fails cleanly without database errors.
-- ============================================================

-- Create a non-throwing boolean predicate for RLS policies
CREATE OR REPLACE FUNCTION public.is_admin_aal2()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN false;
  END IF;
  IF COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin_aal2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_aal2() TO authenticated;

-- Update the original require_admin_aal2() to use the new predicate
-- This preserves the throwing behavior for RPC callers
CREATE OR REPLACE FUNCTION public.require_admin_aal2()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_aal2() THEN
    RAISE EXCEPTION 'AAL2/MFA is required for this admin operation';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.require_admin_aal2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_admin_aal2() TO authenticated;

-- Update RLS policies to use the non-throwing is_admin_aal2() predicate
-- instead of the throwing require_admin_aal2()

-- withdrawal_requests
DROP POLICY IF EXISTS "withdrawal_requests_update_admin" ON public.withdrawal_requests;
CREATE POLICY "withdrawal_requests_update_admin" ON public.withdrawal_requests
  FOR UPDATE USING (public.is_admin() AND public.is_admin_aal2())
  WITH CHECK (public.is_admin() AND public.is_admin_aal2());

-- riders
DROP POLICY IF EXISTS "riders_update_admin" ON public.riders;
CREATE POLICY "riders_update_admin" ON public.riders
  FOR UPDATE USING (public.is_admin() AND public.is_admin_aal2())
  WITH CHECK (public.is_admin() AND public.is_admin_aal2());

-- vendor_applications
DROP POLICY IF EXISTS "vendor_applications_update_admin" ON public.vendor_applications;
CREATE POLICY "vendor_applications_update_admin" ON public.vendor_applications
  FOR UPDATE USING (public.is_admin() AND public.is_admin_aal2())
  WITH CHECK (public.is_admin() AND public.is_admin_aal2());

-- vendors
DROP POLICY IF EXISTS "vendors_insert_admin" ON public.vendors;
CREATE POLICY "vendors_insert_admin" ON public.vendors
  FOR INSERT WITH CHECK (public.is_admin() AND public.is_admin_aal2());
DROP POLICY IF EXISTS "vendors_update_admin" ON public.vendors;
CREATE POLICY "vendors_update_admin" ON public.vendors
  FOR UPDATE USING (public.is_admin() AND public.is_admin_aal2())
  WITH CHECK (public.is_admin() AND public.is_admin_aal2());
DROP POLICY IF EXISTS "vendors_delete_admin" ON public.vendors;
CREATE POLICY "vendors_delete_admin" ON public.vendors
  FOR DELETE USING (public.is_admin() AND public.is_admin_aal2());

-- products
DROP POLICY IF EXISTS "products_insert_admin" ON public.products;
CREATE POLICY "products_insert_admin" ON public.products
  FOR INSERT WITH CHECK (public.is_admin() AND public.is_admin_aal2());
DROP POLICY IF EXISTS "products_update_admin" ON public.products;
CREATE POLICY "products_update_admin" ON public.products
  FOR UPDATE USING (public.is_admin() AND public.is_admin_aal2())
  WITH CHECK (public.is_admin() AND public.is_admin_aal2());
DROP POLICY IF EXISTS "products_delete_admin" ON public.products;
CREATE POLICY "products_delete_admin" ON public.products
  FOR DELETE USING (public.is_admin() AND public.is_admin_aal2());

-- profiles trigger - update to use is_admin_aal2()
CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_aal2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin()
     AND (NEW.role IS DISTINCT FROM OLD.role
           OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id) THEN
    IF NOT public.is_admin_aal2() THEN
      RAISE EXCEPTION 'AAL2/MFA is required for this admin operation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privileged_aal2 ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privileged_aal2
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privileged_aal2();