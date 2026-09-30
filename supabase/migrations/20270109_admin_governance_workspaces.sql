-- Read access for governance workspaces and audited platform-hours updates.
DROP POLICY IF EXISTS admin_action_audit_select_admin ON public.admin_action_audit;
CREATE POLICY admin_action_audit_select_admin ON public.admin_action_audit
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON public.admin_action_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_site_settings(
  p_maintenance_mode boolean,
  p_weekday_start time,
  p_weekday_end time,
  p_weekend_start time,
  p_weekend_end time,
  p_timezone text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.site_settings%ROWTYPE; v_new public.site_settings%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  IF p_weekday_start >= p_weekday_end OR p_weekend_start >= p_weekend_end THEN RAISE EXCEPTION 'delivery hours are invalid'; END IF;
  IF NULLIF(btrim(p_timezone), '') IS NULL THEN RAISE EXCEPTION 'timezone is required'; END IF;
  PERFORM pg_timezone_names.name FROM pg_timezone_names WHERE name = p_timezone;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid timezone'; END IF;
  SELECT * INTO v_old FROM public.site_settings WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'site settings not found'; END IF;
  UPDATE public.site_settings SET maintenance_mode=p_maintenance_mode, weekday_delivery_start=p_weekday_start,
    weekday_delivery_end=p_weekday_end, weekend_delivery_start=p_weekend_start, weekend_delivery_end=p_weekend_end,
    timezone=btrim(p_timezone), updated_at=now() WHERE id=1 RETURNING * INTO v_new;
  PERFORM public._admin_audit('update','site_settings','1',to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.admin_update_site_settings(boolean,time,time,time,time,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_site_settings(boolean,time,time,time,time,text) TO authenticated;
