-- Admin support workspaces: audited report review and read-only notification access.
-- No notification write path is introduced; system notifications remain server-generated.

CREATE OR REPLACE FUNCTION public.admin_review_issue_report(
  p_report_id uuid,
  p_status text,
  p_admin_response text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_report public.issue_reports%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_admin_aal2();
  IF p_status NOT IN ('Open', 'In Review', 'Resolved', 'Closed') THEN
    RAISE EXCEPTION 'Invalid report status';
  END IF;
  IF length(coalesce(p_admin_response, '')) > 4000 THEN
    RAISE EXCEPTION 'Admin response is too long';
  END IF;

  SELECT * INTO v_report FROM public.issue_reports WHERE id = p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report.status IN ('Resolved', 'Closed') AND p_status NOT IN (v_report.status, 'Closed') THEN
    RAISE EXCEPTION 'Invalid report state transition';
  END IF;

  v_before := jsonb_build_object('status', v_report.status, 'admin_response', v_report.admin_response,
                                 'admin_reviewed_at', v_report.admin_reviewed_at, 'admin_reviewed_by', v_report.admin_reviewed_by);
  UPDATE public.issue_reports
  SET status = p_status,
      admin_response = nullif(trim(coalesce(p_admin_response, '')), ''),
      admin_reviewed_at = now(),
      admin_reviewed_by = auth.uid()
  WHERE id = p_report_id;
  v_after := jsonb_build_object('status', p_status, 'admin_response', nullif(trim(coalesce(p_admin_response, '')), ''),
                                'admin_reviewed_at', now(), 'admin_reviewed_by', auth.uid());
  PERFORM public._admin_audit('review', 'issue_report', p_report_id, v_before, v_after);
  RETURN v_after || jsonb_build_object('id', p_report_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_issue_report(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_issue_report(uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS notifications_select_admin ON public.notifications;
CREATE POLICY notifications_select_admin ON public.notifications
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON public.notifications FROM PUBLIC, anon;
GRANT SELECT ON public.notifications TO authenticated;
