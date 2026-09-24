-- Enforce the configured Africa/Lagos delivery window at order creation.

CREATE OR REPLACE FUNCTION public.place_order(p_items jsonb, p_spot text, p_attempt_id uuid, p_request_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid(); v_item jsonb; v_qty_text text; v_qty integer;
  v_expected integer; v_matched integer; v_subtotal numeric(12,2);
  v_fee numeric(12,2); v_rider_share numeric(12,2); v_company_share numeric(12,2);
  v_delivery_method text; v_total numeric(12,2); v_order_number text;
  v_attempt integer := 0; v_order public.orders%ROWTYPE; v_existing_order_id uuid;
  v_timezone text; v_now timestamp; v_start time; v_end time;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF COALESCE((SELECT maintenance_mode FROM public.site_settings WHERE id = 1), false) THEN RAISE EXCEPTION 'Dropzyy is currently under maintenance'; END IF;
  SELECT timezone, CURRENT_TIMESTAMP AT TIME ZONE timezone,
         CASE WHEN EXTRACT(ISODOW FROM CURRENT_TIMESTAMP AT TIME ZONE timezone) BETWEEN 1 AND 5 THEN weekday_delivery_start ELSE weekend_delivery_start END,
         CASE WHEN EXTRACT(ISODOW FROM CURRENT_TIMESTAMP AT TIME ZONE timezone) BETWEEN 1 AND 5 THEN weekday_delivery_end ELSE weekend_delivery_end END
    INTO v_timezone, v_now, v_start, v_end
    FROM public.site_settings WHERE id = 1;
  IF v_timezone IS NULL OR v_now::time < v_start OR v_now::time >= v_end THEN
    RAISE EXCEPTION 'Dropzyy delivery is currently closed. Weekday delivery is 3:00 PM to 8:00 PM; Saturday and Sunday delivery is 8:00 AM to 8:00 PM.';
  END IF;
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
  SELECT CASE WHEN bool_and(COALESCE(v.delivery_method,'rider')='vendor_self') THEN 'vendor_self' ELSE 'rider' END INTO v_delivery_method FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true JOIN public.vendors v ON v.id=p.vendor_id;
  IF v_delivery_method='vendor_self' THEN v_fee:=0; v_rider_share:=0; v_company_share:=0; ELSE v_fee:=1500; v_rider_share:=1000; v_company_share:=500; END IF;
  SELECT COALESCE(SUM(p.price*(li->>'qty')::integer),0) INTO v_subtotal FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true;
  v_total:=v_subtotal+v_fee;
  IF NOT public.validate_order_admission('place_order', p_attempt_id, p_request_fingerprint) THEN RAISE EXCEPTION 'valid order admission required'; END IF;
  SELECT order_id INTO v_existing_order_id FROM public.order_creation_attempts WHERE id = p_attempt_id AND user_id = v_user AND operation = 'place_order' FOR UPDATE;
  IF v_existing_order_id IS NOT NULL THEN SELECT * INTO v_order FROM public.orders WHERE id = v_existing_order_id AND user_id = v_user; IF FOUND THEN RETURN jsonb_build_object('order', to_jsonb(v_order), 'items', (SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb) FROM public.order_items oi WHERE oi.order_id = v_order.id)); END IF; END IF;
  LOOP v_order_number:='CR-'||upper(substr(md5(clock_timestamp()::text||random()::text||v_attempt::text),1,12)); EXIT WHEN NOT EXISTS(SELECT 1 FROM public.orders WHERE order_number=v_order_number); v_attempt:=v_attempt+1; IF v_attempt>10 THEN RAISE EXCEPTION 'could not allocate a unique order number, please retry'; END IF; END LOOP;
  INSERT INTO public.orders(order_number,user_id,subtotal,fee,rider_delivery_share,company_delivery_share,total,status,payment_status,spot,delivery_method,created_at) VALUES(v_order_number,v_user,v_subtotal,v_fee,v_rider_share,v_company_share,v_total,'Order confirmed','pending',p_spot,v_delivery_method,now()) RETURNING * INTO v_order;
  INSERT INTO public.order_items(order_id,product_id,qty,price,name,icon,vendor_id) SELECT v_order.id,p.id,(li->>'qty')::integer,p.price,p.name,COALESCE(p.icon,li->>'icon',''),p.vendor_id FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true;
  UPDATE public.order_creation_attempts SET order_id = v_order.id, completed_at = clock_timestamp() WHERE id = p_attempt_id AND order_id IS NULL;
  RETURN jsonb_build_object('order',to_jsonb(v_order),'items',(SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id),'[]'::jsonb) FROM public.order_items oi WHERE oi.order_id=v_order.id));
END; $$;

CREATE OR REPLACE FUNCTION public.create_vendor_order_request(p_items jsonb, p_spot text, p_attempt_id uuid, p_request_fingerprint text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid:=auth.uid(); v_item jsonb; v_qty_text text; v_qty integer; v_expected integer; v_matched integer;
  v_subtotal numeric(12,2); v_total numeric(12,2); v_order_number text; v_attempt integer:=0; v_order public.orders%ROWTYPE; v_first_vendor_id text; v_existing_order_id uuid;
  v_timezone text; v_now timestamp; v_start time; v_end time;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF COALESCE((SELECT maintenance_mode FROM public.site_settings WHERE id = 1), false) THEN RAISE EXCEPTION 'Dropzyy is currently under maintenance'; END IF;
  SELECT timezone, CURRENT_TIMESTAMP AT TIME ZONE timezone,
         CASE WHEN EXTRACT(ISODOW FROM CURRENT_TIMESTAMP AT TIME ZONE timezone) BETWEEN 1 AND 5 THEN weekday_delivery_start ELSE weekend_delivery_start END,
         CASE WHEN EXTRACT(ISODOW FROM CURRENT_TIMESTAMP AT TIME ZONE timezone) BETWEEN 1 AND 5 THEN weekday_delivery_end ELSE weekend_delivery_end END
    INTO v_timezone, v_now, v_start, v_end FROM public.site_settings WHERE id = 1;
  IF v_timezone IS NULL OR v_now::time < v_start OR v_now::time >= v_end THEN
    RAISE EXCEPTION 'Dropzyy delivery is currently closed. Weekday delivery is 3:00 PM to 8:00 PM; Saturday and Sunday delivery is 8:00 AM to 8:00 PM.';
  END IF;
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
  IF v_existing_order_id IS NOT NULL THEN SELECT * INTO v_order FROM public.orders WHERE id = v_existing_order_id AND user_id = v_user; IF FOUND THEN RETURN jsonb_build_object('order', to_jsonb(v_order), 'items', (SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb) FROM public.order_items oi WHERE oi.order_id = v_order.id)); END IF; END IF;
  LOOP v_attempt:=v_attempt+1; v_order_number:='VR-'||upper(substr(md5(clock_timestamp()::text||random()::text||v_attempt::text),1,12)); EXIT WHEN NOT EXISTS(SELECT 1 FROM public.orders WHERE order_number=v_order_number); IF v_attempt>10 THEN RAISE EXCEPTION 'could not allocate a unique order number, please retry'; END IF; END LOOP;
  INSERT INTO public.orders(order_number,user_id,subtotal,fee,rider_delivery_share,company_delivery_share,total,status,payment_status,spot,delivery_method,request_type,vendor_delivery_requested,created_at) VALUES(v_order_number,v_user,v_subtotal,0,0,0,v_total,'Order confirmed','pending_vendor',p_spot,'both','vendor_request',false,now()) RETURNING * INTO v_order;
  INSERT INTO public.order_items(order_id,product_id,qty,price,name,icon,vendor_id) SELECT v_order.id,p.id,(li->>'qty')::integer,p.price,p.name,COALESCE(p.icon,li->>'icon',''),p.vendor_id FROM jsonb_array_elements(p_items) li JOIN public.products p ON p.id::text=li->>'id' AND p.active=true;
  UPDATE public.order_creation_attempts SET order_id = v_order.id, completed_at = clock_timestamp() WHERE id = p_attempt_id AND order_id IS NULL;
  RETURN jsonb_build_object('order',to_jsonb(v_order),'items',(SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id),'[]'::jsonb) FROM public.order_items oi WHERE oi.order_id=v_order.id));
END; $$;

