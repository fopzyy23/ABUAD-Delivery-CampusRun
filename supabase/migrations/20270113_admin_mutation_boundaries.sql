BEGIN;
-- These tables have no legitimate browser UPDATE path. Column grants must be
-- revoked separately from table grants (vendor_applications used both).
REVOKE UPDATE ON public.issue_reports,public.withdrawal_requests,public.vendor_applications,public.site_settings FROM PUBLIC,anon,authenticated;
REVOKE INSERT,DELETE ON public.site_settings FROM PUBLIC,anon,authenticated;
REVOKE UPDATE (status,vendor_id,admin_response,admin_reviewed_at,admin_reviewed_by) ON public.vendor_applications FROM authenticated;
DROP POLICY IF EXISTS issue_reports_update_admin ON public.issue_reports;
DROP POLICY IF EXISTS withdrawal_requests_update_admin ON public.withdrawal_requests;
DROP POLICY IF EXISTS vendor_applications_update_admin ON public.vendor_applications;
DROP POLICY IF EXISTS site_settings_update_admin ON public.site_settings;
DROP POLICY IF EXISTS site_settings_insert_admin ON public.site_settings;

-- Shared-role tables must retain customer/vendor/rider writes. A SECURITY
-- INVOKER trigger distinguishes a direct API role from a trusted definer RPC;
-- it does not trust a client-supplied custom setting or permit an MFA bypass.
CREATE OR REPLACE FUNCTION public.reject_direct_admin_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND public.is_admin() THEN
    RAISE EXCEPTION 'admin mutation requires an audited AAL2 RPC' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.reject_direct_admin_mutation() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['orders','riders','products','vendors','profiles'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_reject_direct_admin_mutation ON public.%I',t);
    EXECUTE format('CREATE TRIGGER trg_reject_direct_admin_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_direct_admin_mutation()',t);
  END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_review_issue_report(p_report_id uuid,p_status text,p_admin_response text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.issue_reports%ROWTYPE; v_new public.issue_reports%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501'; END IF;
  PERFORM public.require_admin_aal2();
  IF p_status IS NULL OR p_status NOT IN ('Open','In Review','Resolved','Closed') THEN RAISE EXCEPTION 'Invalid report status'; END IF;
  IF length(COALESCE(p_admin_response,''))>4000 THEN RAISE EXCEPTION 'Admin response is too long'; END IF;
  SELECT * INTO v_old FROM public.issue_reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_old.status IN ('Resolved','Closed') AND p_status NOT IN (v_old.status,'Closed') THEN RAISE EXCEPTION 'Invalid report state transition'; END IF;
  UPDATE public.issue_reports SET status=p_status,admin_response=NULLIF(trim(COALESCE(p_admin_response,'')),''),
    admin_reviewed_at=now(),admin_reviewed_by=auth.uid() WHERE id=p_report_id RETURNING * INTO v_new;
  PERFORM public._admin_audit('review','issue_report',p_report_id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.admin_review_issue_report(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_review_issue_report(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_user_to_vendor(target_user_id uuid,target_vendor_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.profiles%ROWTYPE; v_new public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  SELECT * INTO v_old FROM public.profiles WHERE id=target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target user has no profile'; END IF;
  IF target_vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id=target_vendor_id) THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  UPDATE public.profiles SET vendor_id=target_vendor_id WHERE id=target_user_id RETURNING * INTO v_new;
  PERFORM public._admin_audit('assign_vendor','profile',target_user_id::text,to_jsonb(v_old),to_jsonb(v_new));
END; $$;
REVOKE ALL ON FUNCTION public.assign_user_to_vendor(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_user_to_vendor(uuid,text) TO authenticated;
COMMIT;
