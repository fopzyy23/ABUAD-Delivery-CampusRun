-- ============================================================
-- 20260923_fix_assign_user_to_vendor_overload.sql
-- ============================================================
-- CORRECTIVE MIGRATION — applied AFTER 20260922 (which is already live).
--
-- PROBLEM
-- -------
-- Admin vendor assignment now fails with:
--   'Could not choose the best candidate function between:
--      public.assign_user_to_vendor(target_user_id => uuid, target_vendor_id => text),
--      public.assign_user_to_vendor(target_user_id => uuid, target_vendor_id => uuid)'
--
-- ROOT CAUSE
-- ----------
-- CREATE OR REPLACE FUNCTION only replaces a function with the SAME argument
-- types. 20260922 re-declared assign_user_to_vendor with target_vendor_id
-- uuid, so PostgreSQL ADDED a second overload next to the 20260822
-- (uuid, text) version instead of replacing it. The frontend's text vendor
-- id then matched both overloads ambiguously.
--
-- DATATYPE INSPECTION (the decision is evidence-based, not a guess)
-- -----------------------------------------------------------------
-- * vendors.id is TEXT. Proof: every applied FK in the schema references it
--   from a text column, and PostgreSQL cannot implement a text -> uuid
--   foreign key (no implicit cast / equality operator):
--     20260818: profiles.vendor_id  text REFERENCES public.vendors(id)
--     20260818: order_items.vendor_id text REFERENCES public.vendors(id)
--     20260820: products.vendor_id  text REFERENCES public.vendors(id)
--     20260910: vendor_settlements.vendor_id text NOT NULL REFERENCES public.vendors(id)
--     20260913: transfer RPC p_vendor_id text
-- * profiles.vendor_id is TEXT (20260818, same line as above).
-- => The CANONICAL signature is (target_user_id uuid, target_vendor_id text):
--    it matches vendors.id / profiles.vendor_id exactly, matches the
--    original 20260822 contract, and matches the frontend (string select
--    values) with NO frontend change.
--
-- WHAT THIS MIGRATION DOES (only what is needed, nothing else)
-- ------------------------------------------------------------
-- 1. Pre-flight assertion: fails loudly (changing nothing) if vendors.id is
--    not a text type — guarding the datatype conclusion at apply time.
-- 2. DROPs ONLY the obsolete (uuid, uuid) overload, by its exact argument
--    types. No other function, RLS policy, table or grant is touched.
-- 3. CREATE OR REPLACE the canonical (uuid, text) function with the
--    multi-role body: is_admin() gate, profile-exists check, vendor-exists
--    check, sets/clears ONLY vendor_id, NEVER writes profiles.role
--    (an admin keeps 'admin', a user keeps 'user'), NULL = unassign.
--    SECURITY DEFINER / SET search_path = public preserved.
-- 4. Re-grants EXECUTE to authenticated (idempotent), matching the
--    documented contract.
-- Idempotent: DROP IF EXISTS + CREATE OR REPLACE + GRANT (all re-runnable).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Pre-flight: assert vendors.id is a text type before touching anything.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_type text;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'vendors'
    AND column_name  = 'id';

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'pre-flight failed: public.vendors.id does not exist';
  END IF;

  IF v_type NOT IN ('text', 'character varying', 'character') THEN
    RAISE EXCEPTION
      'pre-flight failed: public.vendors.id is %, expected a text type — refusing to change assign_user_to_vendor signature', v_type;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Drop ONLY the ambiguous (uuid, uuid) overload added by 20260922.
--    Exact argument types => no other function can be affected.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.assign_user_to_vendor(target_user_id uuid, target_vendor_id uuid);

-- ------------------------------------------------------------
-- 3. Ensure the ONE canonical (uuid, text) function exists with the
--    multi-role body (replaces the 20260822 body that wrote role).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_user_to_vendor(
  target_user_id   uuid,
  target_vendor_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Admin-only: reuse the existing (untouched) is_admin() SECURITY DEFINER helper.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  -- The target must have a profile row.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Target user has no profile';
  END IF;

  -- Unassign: NULL clears the vendor capability. Role is NEVER modified —
  -- an admin keeps 'admin', a user keeps 'user'.
  IF target_vendor_id IS NULL THEN
    UPDATE public.profiles
    SET vendor_id = NULL
    WHERE id = target_user_id;
    RETURN;
  END IF;

  -- The vendor account must exist.
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = target_vendor_id) THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  -- Assign: link the vendor account ONLY. profiles.role is never written —
  -- multi-role capable (Admin+Vendor, Vendor+Rider, etc. are preserved).
  UPDATE public.profiles
  SET vendor_id = target_vendor_id
  WHERE id = target_user_id;
END
$fn$;

-- ------------------------------------------------------------
-- 4. EXECUTE permission on the canonical signature (idempotent).
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.assign_user_to_vendor(uuid, text) TO authenticated;
