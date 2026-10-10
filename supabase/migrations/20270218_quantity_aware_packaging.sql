-- Forward-only packaging quantity correction.
-- The previous ten-pack cap silently undercharged larger restaurant carts.

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%packaging_quantity%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_packaging_quantity_limit_check
  CHECK (packaging_quantity >= 0 AND packaging_quantity <= 100);

CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_spot text,
  p_attempt_id uuid,
  p_request_fingerprint text,
  p_packaging_quantity integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_item jsonb;
  v_vendor_count integer;
  v_restaurant_count integer;
  v_unit_price numeric(12,2);
  v_order_id uuid;
  v_result jsonb;
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_packaging_quantity IS NULL OR p_packaging_quantity < 0 OR p_packaging_quantity > 100 THEN
    RAISE EXCEPTION 'packaging quantity must be an integer between 0 and 100';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;

  SELECT count(DISTINCT p.vendor_id), count(DISTINCT p.vendor_id) FILTER (WHERE v.is_restaurant)
    INTO v_vendor_count, v_restaurant_count
    FROM jsonb_array_elements(p_items) li
    JOIN public.products p ON p.id::text=li->>'id' AND p.active=true
    JOIN public.vendors v ON v.id=p.vendor_id;
  IF v_vendor_count IS DISTINCT FROM 1 OR v_restaurant_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'restaurant checkout must contain products from one restaurant';
  END IF;

  SELECT COALESCE(food_packaging_unit_price,200) INTO v_unit_price
    FROM public.site_settings WHERE id=1;
  IF v_unit_price IS NULL THEN v_unit_price := 200; END IF;

  v_result := public.place_order_legacy(p_items,p_spot,p_attempt_id,p_request_fingerprint);
  v_order_id := (v_result->'order'->>'id')::uuid;
  SELECT * INTO v_order FROM public.orders WHERE id=v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order could not be loaded after creation'; END IF;

  PERFORM set_config('app.order_server_update','on',true);
  UPDATE public.orders
     SET packaging_quantity=p_packaging_quantity,
         packaging_unit_price=v_unit_price,
         packaging_amount=p_packaging_quantity*v_unit_price,
         total=total+(p_packaging_quantity*v_unit_price)
   WHERE id=v_order_id;
  SELECT * INTO v_order FROM public.orders WHERE id=v_order_id;

  RETURN jsonb_build_object(
    'order',to_jsonb(v_order),
    'items',(SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id),'[]'::jsonb)
               FROM public.order_items oi WHERE oi.order_id=v_order_id)
  );
END; $$;

REVOKE ALL ON FUNCTION public.place_order(jsonb,text,uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb,text,uuid,text,integer) TO authenticated;
