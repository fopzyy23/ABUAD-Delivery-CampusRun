BEGIN;

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_reference text NOT NULL UNIQUE CHECK (error_reference ~ '^ERR-[A-Z0-9]{8}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  affected_user_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_role text,
  route text NOT NULL DEFAULT '/',
  action text NOT NULL,
  category text NOT NULL DEFAULT 'unexpected',
  source text NOT NULL CHECK (source IN ('frontend','auth','database','rpc','edge_function','payment','webhook','order','vendor','rider','admin')),
  severity text NOT NULL CHECK (severity IN ('info','warning','high','critical')),
  sanitized_message text NOT NULL,
  sanitized_details text,
  sanitized_hint text,
  status_code integer,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  vendor_id text REFERENCES public.vendors(id) ON DELETE SET NULL,
  rider_id uuid REFERENCES public.riders(id) ON DELETE SET NULL,
  payment_reference text,
  browser_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  safe_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_notes text,
  CONSTRAINT error_logs_text_limits CHECK (
    length(route) <= 300 AND length(action) <= 120 AND length(category) <= 60
    AND length(sanitized_message) <= 1000
    AND length(coalesce(sanitized_details, '')) <= 4000
    AND length(coalesce(sanitized_hint, '')) <= 1000
    AND length(coalesce(payment_reference, '')) <= 160
    AND length(coalesce(admin_notes, '')) <= 4000
  )
);

CREATE INDEX IF NOT EXISTS error_logs_created_idx ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_user_idx ON public.error_logs (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_severity_resolved_idx ON public.error_logs (severity, resolved, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_order_idx ON public.error_logs (order_id, last_seen_at DESC) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS error_logs_fingerprint_open_idx ON public.error_logs (fingerprint, last_seen_at DESC) WHERE NOT resolved;

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.error_logs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._error_reference()
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_reference text;
BEGIN
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NOT NULL THEN
    EXECUTE 'SELECT ''ERR-'' || upper(substr(encode(extensions.gen_random_bytes(8), ''hex''), 1, 8))' INTO v_reference;
  ELSE
    EXECUTE 'SELECT ''ERR-'' || upper(substr(encode(public.gen_random_bytes(8), ''hex''), 1, 8))' INTO v_reference;
  END IF;
  RETURN v_reference;
END; $$;
REVOKE ALL ON FUNCTION public._error_reference() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_app_error(
  p_reference text,
  p_route text,
  p_action text,
  p_category text,
  p_source text,
  p_severity text,
  p_message text,
  p_details text DEFAULT NULL,
  p_hint text DEFAULT NULL,
  p_status_code integer DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_vendor_id text DEFAULT NULL,
  p_rider_id uuid DEFAULT NULL,
  p_browser_metadata jsonb DEFAULT '{}'::jsonb,
  p_context jsonb DEFAULT '{}'::jsonb,
  p_fingerprint text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_role text; v_vendor text; v_rider uuid;
  v_order uuid; v_reference text; v_fingerprint text; v_existing uuid;
  v_route text; v_message text; v_details text; v_hint text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='42501'; END IF;
  SELECT role, vendor_id INTO v_role, v_vendor FROM public.profiles WHERE id=v_uid;
  SELECT id INTO v_rider FROM public.riders WHERE user_id=v_uid LIMIT 1;
  IF p_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id=p_order_id AND
      (o.user_id=v_uid OR o.rider_id=v_rider OR EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id=o.id AND oi.vendor_id=v_vendor))
  ) THEN v_order := p_order_id; END IF;
  IF p_vendor_id IS DISTINCT FROM v_vendor THEN p_vendor_id := NULL; END IF;
  IF p_rider_id IS DISTINCT FROM v_rider THEN p_rider_id := NULL; END IF;
  v_route := left(regexp_replace(coalesce(p_route,'/'), '([?&#](access_token|refresh_token|token|code|authorization)=[^&#]*)', '', 'gi'),300);
  v_message := left(regexp_replace(coalesce(nullif(trim(p_message),''),'Unexpected application error'), '(Bearer\s+|eyJ)[A-Za-z0-9._~+/-]+', '[REDACTED]', 'gi'),1000);
  v_details := left(regexp_replace(coalesce(p_details,''), '(Bearer\s+|eyJ|sk_(live|test)_)[A-Za-z0-9._~+/-]+', '[REDACTED]', 'gi'),4000);
  v_hint := left(regexp_replace(coalesce(p_hint,''), '(Bearer\s+|eyJ)[A-Za-z0-9._~+/-]+', '[REDACTED]', 'gi'),1000);
  IF nullif(p_fingerprint,'') IS NOT NULL THEN
    v_fingerprint := left(p_fingerprint,64);
  ELSIF to_regprocedure('extensions.digest(bytea,text)') IS NOT NULL THEN
    EXECUTE 'SELECT encode(extensions.digest($1::bytea, $2), ''hex'')' INTO v_fingerprint USING concat_ws('|',p_source,p_action,v_message,v_route), 'sha256';
    v_fingerprint := left(v_fingerprint,64);
  ELSE
    EXECUTE 'SELECT encode(public.digest($1::bytea, $2), ''hex'')' INTO v_fingerprint USING concat_ws('|',p_source,p_action,v_message,v_route), 'sha256';
    v_fingerprint := left(v_fingerprint,64);
  END IF;
  IF p_source NOT IN ('frontend','auth','database','rpc','edge_function','payment','webhook','order','vendor','rider','admin') THEN p_source := 'frontend'; END IF;
  IF p_severity NOT IN ('info','warning','high','critical') THEN p_severity := 'high'; END IF;

  -- Financial/critical reports remain individually traceable. Other unresolved
  -- repeats from the same user/action/route are grouped within 24 hours.
  IF p_source NOT IN ('payment','webhook') AND p_severity <> 'critical' THEN
    SELECT id INTO v_existing FROM public.error_logs
      WHERE fingerprint=v_fingerprint AND NOT resolved
        AND last_seen_at > now()-interval '24 hours' ORDER BY last_seen_at DESC LIMIT 1 FOR UPDATE;
  END IF;
  IF v_existing IS NOT NULL THEN
    UPDATE public.error_logs SET occurrence_count=occurrence_count+1,last_seen_at=now(),updated_at=now(),
      affected_user_ids=(SELECT ARRAY(SELECT DISTINCT x FROM unnest(affected_user_ids || ARRAY[v_uid]) x))
      WHERE id=v_existing RETURNING error_reference INTO v_reference;
    RETURN v_reference;
  END IF;
  v_reference := CASE WHEN p_reference ~ '^ERR-[A-Z0-9]{8}$' THEN p_reference ELSE public._error_reference() END;
  WHILE EXISTS (SELECT 1 FROM public.error_logs WHERE error_reference=v_reference) LOOP v_reference:=public._error_reference(); END LOOP;
  INSERT INTO public.error_logs(error_reference,user_id,user_role,route,action,category,source,severity,
    sanitized_message,sanitized_details,sanitized_hint,status_code,order_id,vendor_id,rider_id,browser_metadata,safe_context,fingerprint,affected_user_ids)
  VALUES(v_reference,v_uid,coalesce(v_role,'user'),v_route,left(coalesce(p_action,'unknown'),120),left(coalesce(p_category,'unexpected'),60),p_source,p_severity,
    v_message,nullif(v_details,''),nullif(v_hint,''),p_status_code,v_order,p_vendor_id,p_rider_id,
    coalesce(p_browser_metadata,'{}'::jsonb) - ARRAY['cookie','authorization','headers','url'],
    coalesce(p_context,'{}'::jsonb) - ARRAY['password','token','access_token','refresh_token','authorization','cookie','headers','card','cvv'],v_fingerprint,ARRAY[v_uid]);
  RETURN v_reference;
END; $$;
REVOKE ALL ON FUNCTION public.report_app_error(text,text,text,text,text,text,text,text,text,integer,uuid,text,uuid,jsonb,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.report_app_error(text,text,text,text,text,text,text,text,text,integer,uuid,text,uuid,jsonb,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_error_logs(p_limit integer DEFAULT 200)
RETURNS SETOF public.error_logs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required' USING ERRCODE='42501'; END IF;
  PERFORM public.require_admin_aal2();
  RETURN QUERY SELECT * FROM public.error_logs ORDER BY last_seen_at DESC LIMIT least(greatest(coalesce(p_limit,200),1),500);
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_error_logs(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_error_logs(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_error_log(p_error_id uuid,p_resolved boolean,p_admin_notes text DEFAULT NULL)
RETURNS public.error_logs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.error_logs%ROWTYPE; v_new public.error_logs%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required' USING ERRCODE='42501'; END IF;
  PERFORM public.require_admin_aal2();
  IF length(coalesce(p_admin_notes,''))>4000 THEN RAISE EXCEPTION 'admin note is too long'; END IF;
  SELECT * INTO v_old FROM public.error_logs WHERE id=p_error_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'error log not found'; END IF;
  UPDATE public.error_logs SET resolved=p_resolved,resolved_at=CASE WHEN p_resolved THEN now() ELSE NULL END,
    resolved_by=CASE WHEN p_resolved THEN auth.uid() ELSE NULL END,admin_notes=nullif(trim(coalesce(p_admin_notes,'')),''),updated_at=now()
    WHERE id=p_error_id RETURNING * INTO v_new;
  PERFORM public._admin_audit(CASE WHEN p_resolved THEN 'resolve' ELSE 'reopen' END,'error_log',p_error_id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN v_new;
END; $$;
REVOKE ALL ON FUNCTION public.admin_update_error_log(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_update_error_log(uuid,boolean,text) TO authenticated;

COMMIT;
