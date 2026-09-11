-- ============================================================
-- 20260906_secure_order_pricing.sql — ACTION 12
-- ============================================================
-- Security & database hardening: the database no longer trusts
-- browser-supplied money values.
--
-- 1. place_order(p_items jsonb, p_spot text) — SECURITY DEFINER RPC
--    The ONLY supported path for creating orders. It:
--      * requires an authenticated caller (auth.uid());
--      * accepts ONLY product ids + quantities + the delivery spot —
--        never prices, totals or fees;
--      * re-prices EVERY line from the authoritative products table;
--      * rejects inactive or nonexistent products (whole RPC rolls back);
--      * enforces quantity 1..99 per line, max 50 lines;
--      * applies the flat ₦1,500 delivery fee (20260927: fee 1000 -> 1500);
--      * computes subtotal/total SERVER-SIDE and inserts the order and
--        its items in ONE atomic transaction (also fixes the previous
--        non-atomic two-request checkout insert);
--      * generates the order number server-side.
-- 2. Direct client writes to orders/order_items are revoked. Authenticated
--    users can no longer INSERT forged orders/order_items (or UPDATE /
--    DELETE items) through PostgREST at all. Orders UPDATE stays granted —
--    it is still needed for customer cancel/rating, rider progression,
--    vendor workflow and admin, all governed by existing RLS policies and
--    the enforce_order_status_transitions / prevent_order_unauthorized_changes
--    triggers.
-- 3. trg_enforce_order_item_pricing — BEFORE INSERT trigger on order_items.
--    Defense-in-depth: even if the INSERT grant were ever restored, every
--    line is re-priced (price/name/icon/vendor_id) from the products table
--    and inactive/unknown products are rejected. Runs before the existing
--    trg_order_items_notify_vendor AFTER trigger, so vendor notifications
--    always reach the authoritative vendor.
-- 4. orders_update_vendor — vendor may now mark 'Delivered' ONLY on
--    vendor_self deliveries. A rider-delivery ('rider') or undecided
--    ('both') order can NEVER be completed by the vendor; only the
--    assigned rider can progress it. USING is also tightened to
--    pre-transit statuses so vendors cannot resurrect or cancel orders
--    that are already in transit / delivered / cancelled.
-- 5. orders_update_assigned — riders can only act on orders in an active
--    delivery state ('Rider assigned', 'Picked up', 'On the Way'), so a
--    rider can never reopen a Delivered/Rated/Cancelled order.
--    (enforce_order_status_transitions already blocks these jumps; the
--    policy tightening is defense-in-depth.)
-- 6. enforce_order_status_transitions() — vendor branch now requires
--    delivery_method = 'vendor_self' for Preparing → Delivered, closing
--    the same vendor/rider hole at the trigger level.
--
-- NOT changed:
--   * The ₦1,500 delivery fee. No payment-gateway code. No payouts.
--   * RLS is not weakened anywhere (direct-write grants are REMOVED).
--   * No destructive DDL (no DROP TABLE / DROP COLUMN / data changes).
--   * Existing notification, rider, vendor, customer and admin security.
-- ============================================================

-- ============================================================
-- 1. place_order — the secure checkout RPC
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
  v_user         uuid := auth.uid();
  v_item         jsonb;
  v_qty_text     text;
  v_qty          integer;
  v_expected     integer;
  v_matched      integer;
  v_subtotal     numeric(12,2);
  v_fee          numeric(12,2) := 1500;  -- flat campus delivery fee
  v_total        numeric(12,2);
  v_order_number text;
  v_order        public.orders%ROWTYPE;
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

  -- 5. Compute the subtotal from the SAME authoritative join. Prices come
  --    exclusively from products.price — never from the client.
  SELECT COALESCE(SUM(p.price * (li->>'qty')::integer), 0) INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  v_total := v_subtotal + v_fee;

  -- 6. Insert the order (server-side money values + server-generated
  --    order number). Status and payment status are fixed server-side.
  v_order_number := 'CR-' || upper(substr(md5(clock_timestamp()::text || random()::text), 1, 12));

  INSERT INTO public.orders (
    order_number, user_id, subtotal, fee, total,
    status, payment_status, spot, delivery_method
  ) VALUES (
    v_order_number, v_user, v_subtotal, v_fee, v_total,
    'Order confirmed', 'pending', p_spot, 'rider'
  )
  RETURNING * INTO v_order;

  -- 7. Insert the order lines with authoritative prices/names/vendors.
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
  --    exactly what was persisted.
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

-- Only authenticated users may call the checkout RPC.
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM PUBLIC;

-- ============================================================
-- 2. Lock down direct client writes to orders / order_items
-- ============================================================
-- Orders: INSERT revoked — the place_order RPC is the only insert path.
-- (orders_insert_own RLS policy is kept as a second line of defence.)
-- orders UPDATE stays granted for customer cancel/rating, rider
-- progression, vendor workflow and admin — all still governed by RLS
-- policies + the existing triggers.
REVOKE INSERT ON public.orders FROM anon;
REVOKE INSERT ON public.orders FROM authenticated;

-- Order items: no client INSERT/UPDATE/DELETE path at all any more
-- (previously order_items_insert_own allowed a customer to attach lines
-- with self-chosen prices to their own orders).
REVOKE INSERT ON public.order_items FROM anon;
REVOKE INSERT ON public.order_items FROM authenticated;
REVOKE UPDATE ON public.order_items FROM anon;
REVOKE UPDATE ON public.order_items FROM authenticated;
REVOKE DELETE ON public.order_items FROM anon;
REVOKE DELETE ON public.order_items FROM authenticated;

-- ============================================================
-- 3. trg_enforce_order_item_pricing — defense-in-depth pricing floor
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_order_item_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
BEGIN
  IF NEW.qty IS NULL OR NEW.qty < 1 THEN
    RAISE EXCEPTION 'order item quantity must be at least 1';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id::text = NEW.product_id::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product % does not exist', NEW.product_id;
  END IF;
  IF v_product.active IS NOT TRUE THEN
    RAISE EXCEPTION 'product % is no longer available', NEW.product_id;
  END IF;

  -- Authoritative values only: anything client-supplied in these columns
  -- is discarded and re-derived from the products table.
  NEW.price     := v_product.price;
  NEW.vendor_id := v_product.vendor_id;
  NEW.name      := v_product.name;
  NEW.icon      := COALESCE(v_product.icon, NEW.icon, '');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_item_pricing ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_pricing
BEFORE INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_item_pricing();

-- ============================================================
-- 4. Vendor policy: 'Delivered' only for vendor_self deliveries
-- ============================================================
-- BEFORE: WITH CHECK allowed status 'Delivered' for ANY delivery_method,
-- so a vendor could mark a rider-delivery order as Delivered — bypassing
-- the rider workflow entirely. NOW:
--   * vendor_self orders: Order confirmed | Preparing | Delivered | Cancelled
--   * rider / both orders: Order confirmed | Preparing | Ready for pickup | Cancelled
--     ('Delivered' is reachable ONLY through the assigned rider.)
-- USING is tightened to pre-transit statuses so vendors cannot touch
-- orders that are already assigned / in transit / delivered / cancelled.
DROP POLICY IF EXISTS "orders_update_vendor" ON public.orders;
CREATE POLICY "orders_update_vendor" ON public.orders
  FOR UPDATE
  USING (
    public.order_has_vendor_item(orders.id)
    AND status IN ('Order confirmed', 'Preparing', 'Ready for pickup')
  )
  WITH CHECK (
    public.order_has_vendor_item(orders.id)
    AND (
      (delivery_method = 'vendor_self'
        AND status IN ('Order confirmed', 'Preparing', 'Delivered', 'Cancelled'))
      OR
      (delivery_method IN ('rider', 'both')
        AND status IN ('Order confirmed', 'Preparing', 'Ready for pickup', 'Cancelled'))
    )
  );

-- ============================================================
-- 5. Rider policy: only active deliveries may be updated
-- ============================================================
-- BEFORE: USING had no status restriction, so a rider could target ANY
-- order assigned to them (including Delivered / Rated / Cancelled rows)
-- and flip them back to 'Picked up' / 'Delivered'. NOW the caller must
-- own the rider row AND the order must be in an active delivery state.
-- WITH CHECK is unchanged (Picked up / On the Way / Delivered) and the
-- existing enforce_order_status_transitions trigger still enforces the
-- linear progression.
DROP POLICY IF EXISTS "orders_update_assigned" ON public.orders;
CREATE POLICY "orders_update_assigned" ON public.orders
  FOR UPDATE
  USING (
    public.caller_owns_rider(rider_id)
    AND status IN ('Rider assigned', 'Picked up', 'On the Way')
  )
  WITH CHECK (
    public.caller_owns_rider(rider_id)
    AND status IN ('Picked up', 'On the Way', 'Delivered')
  );

-- ============================================================
-- 6. Transition trigger: vendor 'Delivered' requires vendor_self
-- ============================================================
-- Same fix as section 4 at the trigger layer (triggers apply regardless
-- of which permissive RLS policy matched). Only the vendor branch is
-- changed; every other transition rule is preserved exactly as shipped
-- by 20260901_add_on_the_way_status.sql.
CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No status change: nothing to validate here (other triggers/policies
  -- already guard user_id, order_number, total, fee, spot).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Admins keep full control (unchanged behaviour).
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Customer transitions on their OWN order.
  IF OLD.user_id = auth.uid() THEN
    IF (OLD.status = 'Delivered' AND NEW.status = 'Rated')
       OR (OLD.status IN ('Order confirmed', 'Preparing') AND NEW.status = 'Cancelled') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Assigned-rider transitions (rider_id must be the caller's rider row).
  IF NEW.rider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.riders
    WHERE id = NEW.rider_id AND user_id = auth.uid()
  ) THEN
    -- Claiming an unassigned rider-delivery order.
    IF OLD.rider_id IS NULL
       AND OLD.status IN ('Order confirmed', 'Ready for pickup')
       AND NEW.status = 'Rider assigned' THEN
      RETURN NEW;
    END IF;
    -- Linear delivery progression.
    IF (OLD.status = 'Rider assigned' AND NEW.status = 'Picked up')
       OR (OLD.status = 'Picked up' AND NEW.status = 'On the Way')
       OR (OLD.status = 'On the Way' AND NEW.status = 'Delivered') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Vendor transitions on orders containing their own order_items.
  IF EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = OLD.id
      AND oi.vendor_id IN (
        SELECT vendor_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'vendor'
      )
  ) THEN
    IF (OLD.status = 'Order confirmed' AND NEW.status IN ('Preparing', 'Cancelled'))
       OR (OLD.status = 'Preparing' AND NEW.status = 'Ready for pickup')
       -- ACTION 12: a vendor may complete an order ONLY when delivering it
       -- themselves. Rider ('rider') and undecided ('both') orders must be
       -- completed by the assigned rider via the rider workflow.
       OR (OLD.status = 'Preparing' AND NEW.status = 'Delivered'
           AND NEW.delivery_method = 'vendor_self') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Illegal order status transition % -> % for this role', OLD.status, NEW.status;
END;
$$;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * Prices/totals/fees are computed exclusively inside place_order from
--   the products table; the browser can no longer influence them.
-- * Inactive or nonexistent products cannot be ordered (RPC + trigger).
-- * Direct client INSERTs into orders/order_items (and item
--   UPDATE/DELETE) are revoked; RLS is unchanged and not weakened.
-- * Vendor 'Delivered' now requires delivery_method = 'vendor_self'
--   (RLS policy + transition trigger). Rider-delivery orders can only
--   be completed by the assigned rider.
-- * Riders can no longer target delivered/rated/cancelled orders.
-- * The ₦1,500 delivery fee, existing workflows, notifications and all
--   other security model parts are unchanged. No payment code added.
-- ============================================================
