-- ============================================================
-- 20260822_admin_vendor_assignment_rpc.sql
-- ============================================================
-- Server-side RPC backing the Admin Vendor Assignment UI.
-- The admin panel calls only supabase.rpc('assign_user_to_vendor', {...});
-- it never updates profiles directly from the client.
--
-- Vendor dashboard requires BOTH role='vendor' AND profiles.vendor_id to be
-- set, so this RPC assigns a user by setting BOTH columns together (and
-- unassigns by setting role='user' and clearing vendor_id).
--
-- Security (honours the task constraints):
--   * SECURITY DEFINER (runs as the table owner, postgres) so it can UPDATE
--     profiles without a service-role key and without weakening RLS.
--   * Self-authorizes via the EXISTING public.is_admin() SECURITY DEFINER
--     helper — only authenticated admins may assign a vendor.
--   * Sets ONLY profiles.role + profiles.vendor_id (the exact pair the vendor
--     dashboard needs). It never touches auth.users, never inserts rows, and
--     never sets role to anything other than 'vendor' (assign) or 'user'
--     (unassign).
--   * The role change is ALLOWED by the existing BEFORE UPDATE trigger
--     prevent_profile_role_escalation(), which only blocks role changes made
--     by NON-admins (its guard is `IF NOT public.is_admin() AND ...`). The
--     trigger is invoked with auth.uid() = the calling admin, so is_admin()
--     is true and the UPDATE proceeds. The trigger itself is NOT modified.
--   * Grants EXECUTE to `authenticated`; non-admins can CALL the RPC but the
--     is_admin() guard inside raises a permission error.
--   * No dynamic SQL; SET search_path = public; owned by the migration
--     runner (trusted owner). RLS/triggers/is_admin() are NOT modified.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_user_to_vendor(
  target_user_id uuid,
  target_vendor_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin-only: reuse the existing (untouched) is_admin() SECURITY DEFINER helper.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  -- The target must have a profile row.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'unknown target user %', target_user_id;
  END IF;

  -- When assigning to a real vendor, that vendor must exist.
  -- NULL unassigns the user (allowed).
  IF target_vendor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = target_vendor_id) THEN
    RAISE EXCEPTION 'unknown vendor %', target_vendor_id;
  END IF;

  IF target_vendor_id IS NOT NULL THEN
    -- Assign: promote to vendor AND link the vendor account (both columns the
    -- dashboard needs). Role escalation is admin-gated and permitted by the
    -- existing trigger (is_admin() is true for the calling admin).
    UPDATE public.profiles
    SET role = 'vendor',
        vendor_id = target_vendor_id
    WHERE id = target_user_id;
  ELSE
    -- Unassign: demote back to 'user' and clear the vendor link.
    UPDATE public.profiles
    SET role = 'user',
        vendor_id = NULL
    WHERE id = target_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_user_to_vendor(uuid, text) TO authenticated;
