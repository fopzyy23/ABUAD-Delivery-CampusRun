-- ============================================================
-- 20261203_fix_rider_profile_privacy.sql
-- ============================================================
-- Fixes rider profile privacy exposure from the overly broad
-- profiles_select_rider_details policy (introduced in 20260815).
--
-- The previous policy allowed ANY authenticated user to read the
-- full profiles (email, phone, hostel, role) of ALL approved
-- riders, not just riders assigned to their own orders.
--
-- This migration:
-- 1. Drops the overly broad profiles_select_rider_details policy
-- 2. Creates a SECURITY DEFINER function get_rider_details_for_order()
--    that returns only the fields needed by the customer UI
--    (full_name, phone) for riders assigned to orders the caller owns
-- 3. Grants EXECUTE on the function to authenticated users
-- ============================================================

-- 1. Drop the overly broad policy that exposes all approved rider profiles
DROP POLICY IF EXISTS "profiles_select_rider_details" ON public.profiles;

-- 2. Create a SECURITY DEFINER function to safely fetch rider details
--    for a specific order the caller owns.
--    Returns only: full_name, phone
--    Does NOT expose: email, hostel, role, or any other profile columns
CREATE OR REPLACE FUNCTION public.get_rider_details_for_order(p_order_id uuid)
RETURNS TABLE (
  full_name text,
  phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.full_name,
    r.phone
  FROM public.orders o
  JOIN public.riders r ON r.id = o.rider_id
  JOIN public.profiles p ON p.id = r.user_id
  WHERE o.id = p_order_id
    AND o.user_id = auth.uid()
    AND o.rider_id IS NOT NULL
    AND r.status = 'approved';
$$;

-- 3. Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_rider_details_for_order(uuid) TO authenticated;

-- 4. For admin access to rider profiles, the existing profiles_select_admin
--    policy (using public.is_admin()) already covers it. No changes needed.

-- 5. For rider access to their own profile, the existing profiles_select_own
--    policy (id = auth.uid()) already covers it. No changes needed.

-- Note: The riders_select_order_assigned policy already allows customers
-- to see the rider row (including phone) for riders assigned to their
-- own orders. This function provides the rider's full_name from profiles
-- in a similarly restricted manner, without exposing email/hostel/role.