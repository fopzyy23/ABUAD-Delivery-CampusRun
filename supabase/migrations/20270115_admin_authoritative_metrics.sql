BEGIN;
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  SELECT jsonb_build_object(
    'total_orders',count(*),
    'active_orders',count(*) FILTER (WHERE status NOT IN ('Delivered','Rated','Cancelled')),
    'completed_orders',count(*) FILTER (WHERE status IN ('Delivered','Rated')),
    'cancelled_orders',count(*) FILTER (WHERE status='Cancelled'),
    'order_value',COALESCE(sum(total),0)
  ) INTO result FROM public.orders;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_get_dashboard_metrics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_metrics() TO authenticated;
COMMIT;
