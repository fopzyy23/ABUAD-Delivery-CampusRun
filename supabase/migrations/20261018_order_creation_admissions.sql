-- 20261018_order_creation_admissions.sql
-- Durable order-creation admission gate. Replaces the un-deployed local
-- 20261017 order limiter integration; 20261016 remains unchanged.

CREATE TABLE IF NOT EXISTS public.rate_limit_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action = 'order_creation'),
  operation text NOT NULL CHECK (operation IN ('place_order', 'create_vendor_order_request')),
  subject_hash text,
  nonce text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  claimed_attempt_id uuid,
  order_claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rate_limit_admissions_expiry_chk CHECK (expires_at > created_at),
  CONSTRAINT rate_limit_admissions_subject_chk CHECK (subject_hash IS NULL OR length(subject_hash) BETWEEN 1 AND 256)
);

CREATE INDEX IF NOT EXISTS rate_limit_admissions_user_action_idx
  ON public.rate_limit_admissions (user_id, action, expires_at);
CREATE INDEX IF NOT EXISTS rate_limit_admissions_expiry_idx
  ON public.rate_limit_admissions (expires_at);
CREATE TABLE IF NOT EXISTS public.order_creation_attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('place_order', 'create_vendor_order_request')),
  admission_id uuid NOT NULL UNIQUE REFERENCES public.rate_limit_admissions(id),
  request_key_hash text NOT NULL,
  request_fingerprint text NOT NULL,
  order_id uuid REFERENCES public.orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, operation, request_key_hash)
);
CREATE INDEX IF NOT EXISTS order_creation_attempts_order_idx ON public.order_creation_attempts(order_id);
ALTER TABLE public.rate_limit_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_creation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_admissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.order_creation_attempts FROM PUBLIC, anon, authenticated;

-- Called only by the trusted order-admission Edge Function through a
-- service-role client carrying the caller's original JWT in Authorization.
-- auth.uid(), not a request parameter, binds the admission to the caller.
CREATE OR REPLACE FUNCTION public.create_order_admission(p_user_id uuid, p_operation text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := p_user_id;
  v_allowed boolean;
  v_retry integer;
  v_token text;
  v_expires timestamptz;
BEGIN
  IF v_user IS NULL OR p_operation NOT IN ('place_order', 'create_vendor_order_request') THEN RAISE EXCEPTION 'invalid order admission request'; END IF;
  SELECT r.allowed, r.retry_after_seconds INTO v_allowed, v_retry
  FROM public.consume_rate_limit('order_creation', 'user', v_user::text) r;
  IF NOT COALESCE(v_allowed, false) THEN
    RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry);
  END IF;
  v_token := encode(gen_random_bytes(32), 'hex');
  v_expires := clock_timestamp() + interval '5 minutes';
  INSERT INTO public.rate_limit_admissions(user_id, action, operation, nonce, expires_at)
  VALUES (v_user, 'order_creation', p_operation, encode(digest(v_token, 'sha256'), 'hex'), v_expires);
  RETURN jsonb_build_object('allowed', true, 'admission_token', v_token,
                            'expires_at', v_expires);
END;
$$;
REVOKE ALL ON FUNCTION public.create_order_admission(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_admission(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_order_admission(p_user_id uuid, p_operation text, p_admission_token text, p_attempt_id uuid, p_request_key text, p_request_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := p_user_id;
  v_admission public.rate_limit_admissions%ROWTYPE;
  v_key_hash text;
BEGIN
  IF p_user_id IS NULL OR p_operation NOT IN ('place_order', 'create_vendor_order_request') OR p_admission_token IS NULL OR length(p_admission_token) <> 64 OR p_attempt_id IS NULL OR p_request_key IS NULL OR length(p_request_key) < 16 OR length(p_request_key) > 256 OR p_request_fingerprint IS NULL OR length(p_request_fingerprint) <> 64 THEN
    RETURN false;
  END IF;
  v_key_hash := encode(digest(p_request_key, 'sha256'), 'hex');
  SELECT * INTO v_admission
  FROM public.rate_limit_admissions
    WHERE nonce = encode(digest(p_admission_token, 'sha256'), 'hex') AND action = 'order_creation'
    AND operation = p_operation AND user_id = v_user AND used_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR v_admission.expires_at <= clock_timestamp() THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.order_creation_attempts WHERE user_id = p_user_id AND operation = p_operation AND request_key_hash = v_key_hash) THEN
    RETURN false;
  END IF;
  UPDATE public.rate_limit_admissions
     SET used_at = clock_timestamp(), claimed_attempt_id = p_attempt_id, order_claimed_at = clock_timestamp()
   WHERE id = v_admission.id AND used_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.order_creation_attempts(id, user_id, operation, admission_id, request_key_hash, request_fingerprint)
  VALUES (p_attempt_id, p_user_id, p_operation, v_admission.id, v_key_hash, lower(p_request_fingerprint));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_order_admission(uuid, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_admission(uuid, text, text, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_order_creation_attempt(p_user_id uuid, p_operation text, p_request_key text, p_request_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_fp text;
BEGIN
  IF p_user_id IS NULL OR p_operation NOT IN ('place_order', 'create_vendor_order_request') OR p_request_key IS NULL OR p_request_fingerprint IS NULL THEN RETURN jsonb_build_object('status','none'); END IF;
  SELECT id, request_fingerprint INTO v_id, v_fp FROM public.order_creation_attempts
   WHERE user_id = p_user_id AND operation = p_operation
     AND request_key_hash = encode(digest(p_request_key, 'sha256'), 'hex');
  IF v_id IS NULL THEN RETURN jsonb_build_object('status','none'); END IF;
  IF v_fp <> lower(p_request_fingerprint) THEN RETURN jsonb_build_object('status','conflict'); END IF;
  RETURN jsonb_build_object('status','match','attempt_id',v_id);
END;
$$;
REVOKE ALL ON FUNCTION public.get_order_creation_attempt(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_creation_attempt(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_order_admission(p_operation text, p_attempt_id uuid, p_request_fingerprint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR p_operation NOT IN ('place_order', 'create_vendor_order_request') OR p_attempt_id IS NULL OR p_request_fingerprint IS NULL OR length(p_request_fingerprint) <> 64 THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.order_creation_attempts a
    JOIN public.rate_limit_admissions r ON r.id = a.admission_id
    WHERE a.id = p_attempt_id AND a.user_id = v_user AND a.operation = p_operation
      AND a.request_fingerprint = lower(p_request_fingerprint)
      AND r.action = 'order_creation' AND r.operation = p_operation
      AND r.used_at IS NOT NULL AND r.claimed_attempt_id = p_attempt_id
      AND clock_timestamp() < r.expires_at
  );
END;
$$;
REVOKE ALL ON FUNCTION public.validate_order_admission(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_order_admission(text, uuid, text) TO authenticated, service_role;

-- The authoritative normal-order RPC now requires a single-use admission.
CREATE OR REPLACE FUNCTION public.place_order(p_items jsonb, p_spot text, p_attempt_id uuid, p_request_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_item jsonb; v_qty_text text; v_qty integer;
  v_expected integer; v_matched integer; v_subtotal numeric(12,2);
  v_fee numeric(12,2); v_rider_share numeric(12,2); v_company_share numeric(12,2);
  v_delivery_method text; v_total numeric(12,2); v_order_number text;
  v_attempt integer := 0; v_order public.orders%ROWTYPE; v_existing_order_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'cart is empty'; END IF;
  v_expected := jsonb_array_length(p_items); IF v_expected > 50 THEN RAISE EXCEPTION 'too many cart lines (max 50)'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF v_item->>'id' IS NULL OR btrim(v_item->>'id')='' THEN RAISE EXCEPTION 'cart line is missing a product id'; END IF;
    v_qty_text := v_item->>'qty'; IF v_qty_text IS NULL OR v_qty_text !~ '^[0-9]+$' THEN RAISE EXCEPTION 'invalid quantity for product %', v_item->>'id'; END IF;
    v_qty := v_qty_text::integer; IF v_qty < 1 OR v_qty > 99 THEN RAISE EXCEPTION 'quantity for product % must be between 1 and 99', v_item->>'id'; END IF;
  END LOOP;
  IF p_spot IS NULL OR btrim(p_spot)='' OR length(p_spot)>200 THEN RAISE EXCEPTION 'a delivery location is required'; END IF;
  SELECT count(*) INTO v_matched FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true;
  IF v_matched IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'one or more products are unavailable or no longer exist'; END IF;
  SELECT CASE WHEN bool_and(COALESCE(v.delivery_method,'rider')='vendor_self') THEN 'vendor_self' ELSE 'rider' END INTO v_delivery_method
  FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true JOIN public.vendors v ON v.id=p.vendor_id;
  IF v_delivery_method='vendor_self' THEN v_fee:=0; v_rider_share:=0; v_company_share:=0; ELSE v_fee:=1500; v_rider_share:=1000; v_company_share:=500; END IF;
  SELECT COALESCE(SUM(p.price*(li->>'qty')::integer),0) INTO v_subtotal FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true;
  v_total:=v_subtotal+v_fee;
  IF NOT public.validate_order_admission('place_order', p_attempt_id, p_request_fingerprint) THEN RAISE EXCEPTION 'valid order admission required'; END IF;
  SELECT order_id INTO v_existing_order_id FROM public.order_creation_attempts WHERE id = p_attempt_id AND user_id = v_user AND operation = 'place_order' FOR UPDATE;
  IF v_existing_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_existing_order_id AND user_id = v_user;
    IF FOUND THEN RETURN jsonb_build_object('order', to_jsonb(v_order), 'items', (SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb) FROM public.order_items oi WHERE oi.order_id = v_order.id)); END IF;
  END IF;
  LOOP
    v_order_number:='CR-'||upper(substr(md5(clock_timestamp()::text||random()::text||v_attempt::text),1,12));
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.orders WHERE order_number=v_order_number);
    v_attempt:=v_attempt+1; IF v_attempt>10 THEN RAISE EXCEPTION 'could not allocate a unique order number, please retry'; END IF;
  END LOOP;
  INSERT INTO public.orders(order_number,user_id,subtotal,fee,rider_delivery_share,company_delivery_share,total,status,payment_status,spot,delivery_method,created_at)
  VALUES(v_order_number,v_user,v_subtotal,v_fee,v_rider_share,v_company_share,v_total,'Order confirmed','pending',p_spot,v_delivery_method,now()) RETURNING * INTO v_order;
  INSERT INTO public.order_items(order_id,product_id,qty,price,name,icon,vendor_id)
  SELECT v_order.id,p.id,(li->>'qty')::integer,p.price,p.name,COALESCE(p.icon,li->>'icon',''),p.vendor_id FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true;
  UPDATE public.order_creation_attempts SET order_id = v_order.id, completed_at = clock_timestamp() WHERE id = p_attempt_id AND order_id IS NULL;
  RETURN jsonb_build_object('order',to_jsonb(v_order),'items',(SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id),'[]'::jsonb) FROM public.order_items oi WHERE oi.order_id=v_order.id));
END;
$$;
REVOKE ALL ON FUNCTION public.place_order(jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.place_order(jsonb,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb,text,uuid,text) TO authenticated, service_role;

-- The authoritative vendor-request RPC likewise requires the caller-bound,
-- single-use admission while retaining product/vendor validation.
CREATE OR REPLACE FUNCTION public.create_vendor_order_request(p_items jsonb, p_spot text, p_attempt_id uuid, p_request_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid:=auth.uid(); v_item jsonb; v_qty_text text; v_qty integer; v_expected integer; v_matched integer;
  v_subtotal numeric(12,2); v_total numeric(12,2); v_order_number text; v_attempt integer:=0; v_order public.orders%ROWTYPE; v_first_vendor_id text; v_existing_order_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'cart is empty'; END IF;
  v_expected:=jsonb_array_length(p_items); IF v_expected>50 THEN RAISE EXCEPTION 'too many cart lines (max 50)'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF v_item->>'id' IS NULL OR btrim(v_item->>'id')='' THEN RAISE EXCEPTION 'cart line is missing a product id'; END IF;
    v_qty_text:=v_item->>'qty'; IF v_qty_text IS NULL OR v_qty_text !~ '^[0-9]+$' THEN RAISE EXCEPTION 'invalid quantity for product %',v_item->>'id'; END IF;
    v_qty:=v_qty_text::integer; IF v_qty<1 OR v_qty>99 THEN RAISE EXCEPTION 'quantity for product % must be between 1 and 99',v_item->>'id'; END IF;
  END LOOP;
  IF p_spot IS NULL OR btrim(p_spot)='' OR length(p_spot)>200 THEN RAISE EXCEPTION 'a delivery location is required'; END IF;
  SELECT count(*),max(p.vendor_id) INTO v_matched,v_first_vendor_id FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true JOIN public.vendors v ON v.id=p.vendor_id AND v.is_restaurant=false;
  IF v_matched IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'one or more products are unavailable, no longer exist, or belong to a restaurant'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' WHERE p.vendor_id IS DISTINCT FROM v_first_vendor_id) THEN RAISE EXCEPTION 'all products in a vendor order request must belong to the same vendor'; END IF;
  SELECT COALESCE(SUM(p.price*(li->>'qty')::integer),0) INTO v_subtotal FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true; v_total:=v_subtotal;
  IF NOT public.validate_order_admission('create_vendor_order_request', p_attempt_id, p_request_fingerprint) THEN RAISE EXCEPTION 'valid order admission required'; END IF;
  SELECT order_id INTO v_existing_order_id FROM public.order_creation_attempts WHERE id = p_attempt_id AND user_id = v_user AND operation = 'create_vendor_order_request' FOR UPDATE;
  IF v_existing_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_existing_order_id AND user_id = v_user;
    IF FOUND THEN RETURN jsonb_build_object('order', to_jsonb(v_order), 'items', (SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb) FROM public.order_items oi WHERE oi.order_id = v_order.id)); END IF;
  END IF;
  LOOP
    v_attempt:=v_attempt+1; v_order_number:='VR-'||upper(substr(md5(clock_timestamp()::text||random()::text||v_attempt::text),1,12)); EXIT WHEN NOT EXISTS(SELECT 1 FROM public.orders WHERE order_number=v_order_number); IF v_attempt>10 THEN RAISE EXCEPTION 'could not allocate a unique order number, please retry'; END IF;
  END LOOP;
  INSERT INTO public.orders(order_number,user_id,subtotal,fee,rider_delivery_share,company_delivery_share,total,status,payment_status,spot,delivery_method,request_type,vendor_delivery_requested,created_at)
  VALUES(v_order_number,v_user,v_subtotal,0,0,0,v_total,'Order confirmed','pending_vendor',p_spot,'both','vendor_request',false,now()) RETURNING * INTO v_order;
  INSERT INTO public.order_items(order_id,product_id,qty,price,name,icon,vendor_id)
  SELECT v_order.id,p.id,(li->>'qty')::integer,p.price,p.name,COALESCE(p.icon,li->>'icon',''),p.vendor_id FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true;
  UPDATE public.order_creation_attempts SET order_id = v_order.id, completed_at = clock_timestamp() WHERE id = p_attempt_id AND order_id IS NULL;
  RETURN jsonb_build_object('order',to_jsonb(v_order),'items',(SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id),'[]'::jsonb) FROM public.order_items oi WHERE oi.order_id=v_order.id));
END;
$$;
REVOKE ALL ON FUNCTION public.create_vendor_order_request(jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_vendor_order_request(jsonb,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vendor_order_request(jsonb,text,uuid,text) TO authenticated, service_role;
