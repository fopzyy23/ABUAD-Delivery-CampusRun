-- ============================================================
-- 20261012_h2_h3_production_readiness.sql
-- ROOT-CAUSE FIX for "Order failed: Could not save to Supabase".
--
-- Migration 20260927 re-declared place_order with a broken
-- order_items insert: it cast the product id to text
-- ((li->>'id')::text) while order_items.product_id carries the
-- native products.id type. Postgres has no implicit
-- text -> uuid/int assignment cast, so EVERY checkout aborted
-- with a type error inside the RPC before any row was written.
-- It also dropped the 'items' payload from the RPC result that
-- the checkout UI uses to display exactly what was persisted.
--
-- This migration restores the proven 20260906/20260908 function
-- body (native p.id insert + full result shape + 12-hex order
-- numbers) and keeps the 20260927 business rules:
--   delivery_fee           = 1500
--   rider_delivery_share   = 1000
--   company_delivery_share = 500
--   total = subtotal + 1500
-- The client still cannot influence any money value; all prices
-- come exclusively from the products table.
-- ============================================================

CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_spot  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user          uuid := auth.uid();
  v_item          jsonb;
  v_qty_text      text;
  v_qty           integer;
  v_expected      integer;
  v_matched       integer;
  v_subtotal      numeric(12,2);
  v_fee           numeric(12,2);
  v_rider_share   numeric(12,2);
  v_company_share numeric(12,2);
  v_delivery_method text;
  v_total         numeric(12,2);
  v_order_number  text;
  v_attempt       integer := 0;
  v_order         public.orders%ROWTYPE;
BEGIN
  -- 0. Authenticated customers only.
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 1. The cart must be a non-empty JSON array (max 50 lines).
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;
  v_expected := jsonb_array_length(p_items);
  IF v_expected > 50 THEN
    RAISE EXCEPTION 'too many cart lines (max 50)';
  END IF;

  -- 2. Validate each line: an id and a whole-number quantity 1..99.
  --    NOTE: the client never sends prices — any such field is ignored.
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

  -- 3. A non-empty delivery spot is required (blocked from later edits by
  --    the existing prevent_order_unauthorized_changes trigger).
  IF p_spot IS NULL OR btrim(p_spot) = '' OR length(p_spot) > 200 THEN
    RAISE EXCEPTION 'a delivery location is required';
  END IF;

  -- 4. Verify EVERY product exists AND is active, using the authoritative
  --    products table. The id is compared as text so this works whatever
  --    the underlying products.id type is. If any product is missing or
  --    inactive the count below will not match and the RPC aborts.
  SELECT count(*) INTO v_matched
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  IF v_matched IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'one or more products are unavailable or no longer exist';
  END IF;

  -- Delivery capability is authoritative.  The browser supplies no delivery
  -- method.  A cart containing any rider-capable vendor uses the rider path;
  -- only an all-vendor_self cart is self-delivery.  `both` is safely launched
  -- on the rider path and can never be placed in the rider pool as `both`.
  SELECT CASE
    WHEN bool_and(COALESCE(v.delivery_method, 'rider') = 'vendor_self') THEN 'vendor_self'
    ELSE 'rider'
  END INTO v_delivery_method
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p ON p.id::text = li->>'id' AND p.active = true
  JOIN public.vendors v ON v.id = p.vendor_id;

  IF v_delivery_method = 'vendor_self' THEN
    v_fee := 0; v_rider_share := 0; v_company_share := 0;
  ELSE
    v_fee := 1500; v_rider_share := 1000; v_company_share := 500;
  END IF;

  -- 5. Compute the subtotal from the SAME authoritative join. Prices come
  --    exclusively from products.price — never from the client.
  SELECT COALESCE(SUM(p.price * (li->>'qty')::integer), 0) INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  v_total := v_subtotal + v_fee;
  -- 6. Insert the order (server-side money values + a COLLISION-SAFE
  --    server-generated order number), carrying the 20260927 split:
  --    fee = 1500, rider share = 1000, company share = 500.
  LOOP
    v_order_number := 'CR-' || upper(substr(md5(clock_timestamp()::text || random()::text || v_attempt::text), 1, 12));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders WHERE order_number = v_order_number
    );
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      RAISE EXCEPTION 'could not allocate a unique order number, please retry';
    END IF;
  END LOOP;

  INSERT INTO public.orders (
    order_number, user_id, subtotal, fee,
    rider_delivery_share, company_delivery_share,
    total, status, payment_status, spot, delivery_method, created_at
  ) VALUES (
    v_order_number, v_user, v_subtotal, v_fee,
    v_rider_share, v_company_share,
    v_total, 'Order confirmed', 'pending', p_spot, v_delivery_method, now()
  )
  RETURNING * INTO v_order;

  -- 7. Insert the order lines with authoritative prices/names/vendors.
  --    FIX (20260928): use the NATIVE p.id for product_id — the 20260927
  --    re-declaration cast (li->>'id')::text which has no implicit cast to
  --    the underlying product_id column type and aborted every checkout.
  --    trg_enforce_order_item_pricing re-derives them again (defense in
  --    depth) and trg_order_items_notify_vendor notifies the vendor(s).
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

  -- 8. Return the authoritative order + items so the client can display
  --    exactly what was persisted (the 20260927 version dropped 'items').
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

-- Keep the existing grant model exactly as-is: only authenticated
-- users may call the checkout RPC.
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM PUBLIC;

-- Admin-only visibility and settlement preparation.  Amounts remain in the
-- settlement/transfer ledgers; this wrapper accepts only an order id.
DROP POLICY IF EXISTS "admins_read_all_vendor_settlements" ON public.vendor_settlements;
CREATE POLICY "admins_read_all_vendor_settlements" ON public.vendor_settlements
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "admins_read_all_delivery_settlements" ON public.delivery_settlements;
CREATE POLICY "admins_read_all_delivery_settlements" ON public.delivery_settlements
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.admin_generate_settlement(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  RETURN public.generate_settlement(p_order_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_generate_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_settlement(uuid) TO authenticated;
