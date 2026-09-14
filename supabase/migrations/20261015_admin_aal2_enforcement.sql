-- ============================================================
-- 20261015_admin_aal2_enforcement.sql
-- Require Supabase AAL2 for high-impact admin mutations.
-- public.is_admin() remains the role authorization boundary.
-- ============================================================

CREATE OR REPLACE FUNCTION public.require_admin_aal2()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;
  IF COALESCE(auth.jwt() ->> 'aal', '') <> 'aal2' THEN
    RAISE EXCEPTION 'AAL2/MFA is required for this admin operation';
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.require_admin_aal2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.require_admin_aal2() TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_refund(p_refund_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_refund public.refunds%ROWTYPE; v_prev text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'permission denied: admin privileges required'; END IF;
  PERFORM public.require_admin_aal2();
  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund % not found', p_refund_id; END IF;
  IF v_refund.status NOT IN ('requested', 'failed') THEN
    RAISE EXCEPTION 'Refund % has status % — only ''requested'' or ''failed'' refunds can be approved', p_refund_id, v_refund.status;
  END IF;
  v_prev := v_refund.status;
  UPDATE public.refunds SET status = 'approved', updated_at = now() WHERE id = p_refund_id;
  RETURN json_build_object('refund_id', p_refund_id, 'status', 'approved', 'previous_status', v_prev);
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_refund(p_refund_id uuid, p_reason text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_refund public.refunds%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'permission denied: admin privileges required'; END IF;
  PERFORM public.require_admin_aal2();
  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund % not found', p_refund_id; END IF;
  IF v_refund.status != 'requested' THEN
    RAISE EXCEPTION 'Refund % has status % — only ''requested'' refunds can be rejected', p_refund_id, v_refund.status;
  END IF;
  UPDATE public.refunds SET status = 'rejected', reason = COALESCE(p_reason, v_refund.reason), updated_at = now() WHERE id = p_refund_id;
  RETURN json_build_object('refund_id', p_refund_id, 'status', 'rejected', 'previous_status', 'requested', 'reason', COALESCE(p_reason, v_refund.reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_settlement(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'permission denied: admin privileges required'; END IF;
  PERFORM public.require_admin_aal2();
  RETURN public._settle_order_core(p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_generate_settlement(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  RETURN public.generate_settlement(p_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_user_to_vendor(target_user_id uuid, target_vendor_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'permission denied: admin privileges required'; END IF;
  PERFORM public.require_admin_aal2();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN RAISE EXCEPTION 'Target user has no profile'; END IF;
  IF target_vendor_id IS NULL THEN
    UPDATE public.profiles SET vendor_id = NULL WHERE id = target_user_id;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = target_vendor_id) THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  UPDATE public.profiles SET vendor_id = target_vendor_id WHERE id = target_user_id;
END
$fn$;

-- Preserve existing admin RLS conditions and add AAL2 only to admin writes.
DROP POLICY IF EXISTS "withdrawal_requests_update_admin" ON public.withdrawal_requests;
CREATE POLICY "withdrawal_requests_update_admin" ON public.withdrawal_requests
  FOR UPDATE USING (public.is_admin() AND public.require_admin_aal2())
  WITH CHECK (public.is_admin() AND public.require_admin_aal2());

DROP POLICY IF EXISTS "riders_update_admin" ON public.riders;
CREATE POLICY "riders_update_admin" ON public.riders
  FOR UPDATE USING (public.is_admin() AND public.require_admin_aal2())
  WITH CHECK (public.is_admin() AND public.require_admin_aal2());

DROP POLICY IF EXISTS "vendor_applications_update_admin" ON public.vendor_applications;
CREATE POLICY "vendor_applications_update_admin" ON public.vendor_applications
  FOR UPDATE USING (public.is_admin() AND public.require_admin_aal2())
  WITH CHECK (public.is_admin() AND public.require_admin_aal2());

DROP POLICY IF EXISTS "vendors_insert_admin" ON public.vendors;
CREATE POLICY "vendors_insert_admin" ON public.vendors
  FOR INSERT WITH CHECK (public.is_admin() AND public.require_admin_aal2());
DROP POLICY IF EXISTS "vendors_update_admin" ON public.vendors;
CREATE POLICY "vendors_update_admin" ON public.vendors
  FOR UPDATE USING (public.is_admin() AND public.require_admin_aal2())
  WITH CHECK (public.is_admin() AND public.require_admin_aal2());
DROP POLICY IF EXISTS "vendors_delete_admin" ON public.vendors;
CREATE POLICY "vendors_delete_admin" ON public.vendors
  FOR DELETE USING (public.is_admin() AND public.require_admin_aal2());

DROP POLICY IF EXISTS "products_insert_admin" ON public.products;
CREATE POLICY "products_insert_admin" ON public.products
  FOR INSERT WITH CHECK (public.is_admin() AND public.require_admin_aal2());
DROP POLICY IF EXISTS "products_update_admin" ON public.products;
CREATE POLICY "products_update_admin" ON public.products
  FOR UPDATE USING (public.is_admin() AND public.require_admin_aal2())
  WITH CHECK (public.is_admin() AND public.require_admin_aal2());
DROP POLICY IF EXISTS "products_delete_admin" ON public.products;
CREATE POLICY "products_delete_admin" ON public.products
  FOR DELETE USING (public.is_admin() AND public.require_admin_aal2());

-- Keep harmless admin profile edits available at AAL1, but require AAL2
-- whenever a profile mutation changes a privileged capability or role.
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
    PERFORM public.require_admin_aal2();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privileged_aal2 ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privileged_aal2
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privileged_aal2();
