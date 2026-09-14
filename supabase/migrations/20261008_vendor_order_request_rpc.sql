-- ============================================================
-- 20261008_vendor_order_request_rpc.sql
-- Stage 2: Vendor Order Request RPC
-- ============================================================
-- Dedicated secure RPC for creating Vendor order requests.
-- Separate from restaurant place_order() flow.
-- ============================================================

-- ------------------------------------------------------------
-- Vendor Order Request RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_vendor_order_request(
  p_items jsonb,
  p_spot text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user                uuid := auth.uid();
  v_item                jsonb;
  v_qty_text            text;
  v_qty                 integer;
  v_expected            integer;
  v_matched             integer;
  v_subtotal            numeric(12,2);
  v_total               numeric(12,2);
  v_order_number        text;
  v_attempt             integer := 0;
  v_order               public.orders%ROWTYPE;
  v_first_vendor_id     text;
BEGIN
  -- 0. Authenticated customers only
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 1. The cart must be a non-empty JSON array (max 50 lines)
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;
  v_expected := jsonb_array_length(p_items);
  IF v_expected > 50 THEN
    RAISE EXCEPTION 'too many cart lines (max 50)';
  END IF;

  -- 2. Validate each line: an id and a whole-number quantity 1..99
  --    NOTE: the client never sends prices - any such field is ignored
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF v_item->>'id' IS NULL OR btrim(v_item->>'id') = '' THEN
      RAISE EXCEPTION 'cart line is missing a product id';
    END IF;
    v_qty_text := v_item->>'qty';
    IF v_qty_text IS NULL OR v_qty_text !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid quantity for product %', v_item->>'id';
    END IF;
    v_qty := v_qty_text::integer;
    IF v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'quantity for product % must be between 1 and 99', v_item->>'id';
    END IF;
  END LOOP;

  -- 3. A non-empty delivery spot is required
  IF p_spot IS NULL OR btrim(p_spot) = '' OR length(p_spot) > 200 THEN
    RAISE EXCEPTION 'a delivery location is required';
  END IF;

  -- 4. Verify EVERY product exists, is active, and belongs to a Vendor (not restaurant)
  --    Also capture the first vendor_id to ensure all items are from same vendor
  SELECT count(*), MAX(p.vendor_id) INTO v_matched, v_first_vendor_id
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p ON p.id::text = li->>'id' AND p.active = true
  JOIN public.vendors v ON v.id = p.vendor_id AND v.is_restaurant = false;

  IF v_matched IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'one or more products are unavailable, no longer exist, or belong to a restaurant';
  END IF;

  -- 5. Ensure all products belong to the SAME vendor
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS li
    JOIN public.products p ON p.id::text = li->>'id'
    WHERE p.vendor_id IS DISTINCT FROM v_first_vendor_id
  ) THEN
    RAISE EXCEPTION 'all products in a vendor order request must belong to the same vendor';
  END IF;

  -- 6. Compute the subtotal from authoritative products table
  SELECT COALESCE(SUM(p.price * (li->>'qty')::integer), 0) INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p ON p.id::text = li->>'id' AND p.active = true;

  -- Vendor request: fee = 0, total = subtotal only
  v_total := v_subtotal;

  -- 7. Insert the order with vendor_request type
  LOOP
    v_attempt := v_attempt + 1;
    v_order_number := 'VR-' || upper(substr(md5(clock_timestamp()::text || random()::text || v_attempt::text), 1, 12));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number);
    IF v_attempt > 10 THEN
      RAISE EXCEPTION 'could not allocate a unique order number, please retry';
    END IF;
  END LOOP;

  INSERT INTO public.orders (
    order_number, user_id, subtotal, fee,
    rider_delivery_share, company_delivery_share,
    total, status, payment_status, spot,
    delivery_method, request_type, vendor_delivery_requested, created_at
  ) VALUES (
    v_order_number, v_user, v_subtotal, 0,  -- fee = 0 for vendor request
    0, 0,  -- no delivery shares
    v_total, 'Order confirmed', 'pending_vendor', p_spot,
    'both', 'vendor_request', false, now()  -- delivery_method='both' so vendor can choose
  )
  RETURNING * INTO v_order;

  -- 8. Insert the order lines with authoritative prices/names/vendors
  INSERT INTO public.order_items (order_id, product_id, qty, price, name, icon, vendor_id)
  SELECT
    v_order.id,
    p.id,
    (li->>'qty')::integer,
    p.price,
    p.name,
    COALESCE(p.icon, li->>'icon', ''),
    p.vendor_id
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  -- 9. Return the authoritative order + items
  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', (
      SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb)
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_vendor_order_request(jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_vendor_order_request(jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_vendor_order_request(jsonb, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- Vendor Accept/Decline RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vendor_respond_to_request(
  p_order_id uuid,
  p_action text  -- 'accept' or 'decline'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_vendor_id text;
BEGIN
  -- 1. Must be authenticated vendor
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 2. Get vendor_id from caller's profile
  SELECT vendor_id INTO v_vendor_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'you are not linked to a vendor account';
  END IF;

  -- 3. Lock and fetch the order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- 4. Verify this order belongs to the calling vendor
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.vendor_id = v_vendor_id
  ) THEN
    RAISE EXCEPTION 'this order does not belong to your vendor account';
  END IF;

  -- 5. Verify order is in a state that can be responded to
  IF v_order.request_type <> 'vendor_request' THEN
    RAISE EXCEPTION 'this is not a vendor order request';
  END IF;
  IF v_order.status <> 'Order confirmed' THEN
    RAISE EXCEPTION 'order is not in a pending state (current: %)', v_order.status;
  END IF;

  -- 6. Process the action
  IF p_action = 'accept' THEN
    UPDATE public.orders
    SET status = 'Preparing',
        vendor_decision_at = now()
    WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'action', 'accept', 'status', 'Preparing');

  ELSIF p_action = 'decline' THEN
    UPDATE public.orders
    SET status = 'Cancelled',
        vendor_decision_at = now()
    WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'action', 'decline', 'status', 'Cancelled');

  ELSE
    RAISE EXCEPTION 'invalid action: % (must be accept or decline)', p_action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vendor_respond_to_request(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.vendor_respond_to_request(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vendor_respond_to_request(uuid, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- SUMMARY
-- ------------------------------------------------------------
-- * create_vendor_order_request: creates vendor_request order with pending_vendor payment
-- * vendor_respond_to_request: secure accept/decline by vendor owner
-- * Both are SECURITY DEFINER, EXECUTE granted to authenticated only
-- * No Paystack integration, no payment rows created
-- * Vendor delivery choice deferred (delivery_method='both')