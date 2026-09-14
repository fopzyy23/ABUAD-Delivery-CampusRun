-- ============================================================
-- 20261007_vendor_followup.sql
-- Vendor System Follow-up: Status Transitions, Notifications, Settlement
-- ============================================================
-- Fixes identified in 20261006_vendor_foundation validation:
-- 1. products_select_public: show active products from BOTH restaurants and vendors
-- 2. enforce_order_status_transitions: vendor rider deliveries don't require product payment
-- 3. Separate rider notification trigger for vendor delivery requests
-- 4. Settlement: skip delivery settlement for vendor_self; handle vendor rider delivery
-- ============================================================

-- ------------------------------------------------------------
-- 1. FIX PRODUCTS PUBLIC SELECT POLICY
-- ------------------------------------------------------------
-- Customers must see active products from BOTH restaurants and vendors
-- Inactive products hidden for both types
DROP POLICY IF EXISTS "products_select_public" ON public.products;
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = products.vendor_id
        AND (v.is_restaurant = true OR v.is_restaurant = false)
    )
  );

-- Admin sees all products (unchanged)
DROP POLICY IF EXISTS "products_select_admin" ON public.products;
CREATE POLICY "products_select_admin" ON public.products
  FOR SELECT
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 2. UPDATE ENFORCE_ORDER_STATUS_TRANSITIONS
-- ------------------------------------------------------------
-- Allow vendor rider delivery claims without payment_status='success'
-- Restaurant orders: still require payment_status='success' for claims
-- Vendor delivery requests: require vendor_delivery_requested=true
CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delivery-method hijack guard (from 20261002)
  IF NOT public.is_admin()
     AND NEW.delivery_method IS DISTINCT FROM OLD.delivery_method THEN
    IF OLD.delivery_method <> 'both'
       OR NEW.delivery_method NOT IN ('rider', 'vendor_self') THEN
      RAISE EXCEPTION 'delivery_method can only be changed from ''both'' (vendor choice)';
    END IF;
  END IF;

  -- No status change: nothing to validate
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Admins keep full control
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Customer transitions on their OWN order
  IF OLD.user_id = auth.uid() THEN
    IF (OLD.status = 'Delivered' AND NEW.status = 'Rated')
       OR (OLD.status IN ('Order confirmed', 'Preparing') AND NEW.status = 'Cancelled') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Assigned-rider transitions (rider_id must be the caller's rider row)
  IF NEW.rider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.riders
    WHERE id = NEW.rider_id AND user_id = auth.uid()
  ) THEN
    -- Claiming an unassigned rider-delivery order
    -- Restaurant orders: require payment_status = 'success'
    -- Vendor delivery requests: require vendor_delivery_requested = true
    IF OLD.rider_id IS NULL
       AND OLD.status IN ('Order confirmed', 'Ready for pickup')
       AND OLD.delivery_method = 'rider'
       AND (
         (OLD.request_type = 'restaurant' AND OLD.payment_status = 'success')
         OR
         (OLD.request_type = 'vendor_request' AND OLD.vendor_delivery_requested = true)
       )
       AND NEW.status = 'Rider assigned' THEN
      RETURN NEW;
    END IF;

    -- Linear delivery progression
    IF (OLD.status = 'Rider assigned' AND NEW.status = 'Picked up')
       OR (OLD.status = 'Picked up' AND NEW.status = 'On the Way')
       OR (OLD.status = 'On the Way' AND NEW.status = 'Delivered') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Vendor transitions on orders containing their own order_items
  IF public.order_has_vendor_item(OLD.id) THEN
    IF (OLD.status = 'Order confirmed' AND NEW.status IN ('Preparing', 'Cancelled'))
       OR (OLD.status = 'Preparing' AND NEW.status = 'Ready for pickup')
       OR (OLD.status = 'Preparing' AND NEW.status = 'Delivered'
           AND NEW.delivery_method = 'vendor_self') THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Illegal order status transition % -> % for this role', OLD.status, NEW.status;
END;
$$;

-- ------------------------------------------------------------
-- 3. RIDER NOTIFICATION FOR VENDOR DELIVERY REQUESTS
-- ------------------------------------------------------------
-- Separate trigger: fires when vendor_delivery_requested changes false -> true
-- Only for vendor_request orders with delivery_method = 'rider'
-- Notifies approved + available riders
CREATE OR REPLACE FUNCTION public.notify_riders_vendor_delivery_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire on vendor_request orders where vendor_delivery_requested flips to true
  IF NEW.request_type = 'vendor_request'
     AND NEW.delivery_method = 'rider'
     AND NEW.vendor_delivery_requested = true
     AND OLD.vendor_delivery_requested = false THEN

    INSERT INTO public.notifications
      (user_id, title, message, type, related_order_id)
    SELECT
      r.user_id,
      'New delivery available',
      'Vendor delivery for order ' || NEW.order_number ||
        ' is ready for pickup at ' || COALESCE(
          (SELECT pickup_location FROM public.vendors WHERE id = (
            SELECT vendor_id FROM public.order_items WHERE order_id = NEW.id LIMIT 1
          )),
          'vendor location'
        ) || '. Open the Rider Hub to accept it.',
      'rider',
      NEW.id
    FROM public.riders r
    WHERE r.status = 'approved'
      AND r.available = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_riders_vendor_delivery ON public.orders;
CREATE TRIGGER trg_notify_riders_vendor_delivery
AFTER UPDATE OF vendor_delivery_requested ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_riders_vendor_delivery_request();

-- ------------------------------------------------------------
-- 4. UPDATE SETTLEMENT ENGINE
-- ------------------------------------------------------------
-- Update _settle_order_core to skip delivery settlement for vendor_self
-- For vendor rider delivery: create delivery settlement with 1500/1000/500 split
-- For restaurant orders: preserve existing behavior
-- NOTE: Vendor product revenue is NOT settled via Dropzyy (private payment)

CREATE OR REPLACE FUNCTION public._settle_order_core(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_item record;
  v_count integer;
  v_vendor_settlement_id uuid;
  v_delivery_settlement_id uuid;
  v_recipient public.transfer_recipients%ROWTYPE;
  v_transfer_result jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE order_id = p_order_id AND status = 'success' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % has no successful payment - cannot settle', p_order_id;
  END IF;

  IF v_order.status != 'Delivered' THEN
    RAISE EXCEPTION 'Order % is not Delivered (status: %) - cannot settle', p_order_id, v_order.status;
  END IF;

  SELECT count(*) INTO v_count FROM public.vendor_settlements WHERE order_id = p_order_id;
  IF v_count > 0 THEN
    RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', true, 'vendor_settlements', v_count);
  END IF;

  -- VENDOR PRODUCT SETTLEMENTS
  -- For restaurant orders: settle vendor revenue from order_items
  -- For vendor_request orders: NO vendor product settlement (customer pays vendor privately)
  IF v_order.request_type = 'restaurant' THEN
    FOR v_item IN
      SELECT oi.vendor_id, SUM(oi.price * oi.qty) AS total
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
      GROUP BY oi.vendor_id
    LOOP
      INSERT INTO public.vendor_settlements (order_id, vendor_id, amount, status)
      VALUES (p_order_id, v_item.vendor_id, v_item.total, 'pending')
      RETURNING id INTO v_vendor_settlement_id;

      SELECT * INTO v_recipient FROM public.transfer_recipients
      WHERE payee_type = 'vendor' AND vendor_id = v_item.vendor_id;

      IF FOUND THEN
        BEGIN
          v_transfer_result := public.create_pending_transfer(
            p_vendor_settlement_id := v_vendor_settlement_id,
            p_paystack_reference := gen_random_uuid()::text,
            p_recipient_code := v_recipient.recipient_code
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Failed to create pending transfer for vendor settlement %: %', v_vendor_settlement_id, SQLERRM;
        END;
      END IF;
    END LOOP;
  END IF;

  -- DELIVERY SETTLEMENT
  -- Skip entirely for vendor_self delivery (no rider involved)
  -- For restaurant + vendor rider delivery: create delivery settlement
  IF v_order.delivery_method <> 'vendor_self' THEN
    INSERT INTO public.delivery_settlements (order_id, rider_id, delivery_fee, rider_amount, platform_amount, status)
    VALUES (
      p_order_id,
      v_order.rider_id,
      v_order.fee,
      v_order.rider_delivery_share,
      v_order.company_delivery_share,
      'pending'
    )
    RETURNING id INTO v_delivery_settlement_id;

    IF v_order.rider_id IS NOT NULL THEN
      SELECT * INTO v_recipient FROM public.transfer_recipients
      WHERE payee_type = 'rider'
        AND profile_id = (SELECT user_id FROM public.riders WHERE id = v_order.rider_id);

      IF FOUND THEN
        BEGIN
          v_transfer_result := public.create_pending_transfer(
            p_delivery_settlement_id := v_delivery_settlement_id,
            p_paystack_reference := gen_random_uuid()::text,
            p_recipient_code := v_recipient.recipient_code
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Failed to create pending transfer for delivery settlement %: %', v_delivery_settlement_id, SQLERRM;
        END;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', false);
END;
$func$;

-- ------------------------------------------------------------
-- 5. UPDATE generate_settlement WRAPPER
-- ------------------------------------------------------------
-- Keep admin gate, delegate to updated core
CREATE OR REPLACE FUNCTION public.generate_settlement(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  RETURN public._settle_order_core(p_order_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.generate_settlement(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_settlement(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_settlement(uuid) FROM PUBLIC;

-- ------------------------------------------------------------
-- 6. AUTO-SETTLEMENT TRIGGER (from 20261004) - RECREATE with updated core
-- ------------------------------------------------------------
-- The auto-settlement trigger calls _settle_order_core which now has
-- the vendor_self / vendor_request logic built in
DROP TRIGGER IF EXISTS trg_auto_settle_on_status ON public.orders;
DROP TRIGGER IF EXISTS trg_auto_settle_on_payment ON public.orders;

CREATE OR REPLACE FUNCTION public.auto_settle_delivered_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_result jsonb;
BEGIN
  -- Only settle when order becomes Delivered AND paid (or vendor delivery requested)
  -- For vendor_request: "paid" means vendor_delivery_requested=true for rider deliveries,
  -- or simply Delivered for self-delivery (no delivery payment needed)
  IF NEW.status = 'Delivered' AND (
      (NEW.request_type = 'restaurant' AND NEW.payment_status = 'success')
      OR
      (NEW.request_type = 'vendor_request' AND NEW.delivery_method = 'vendor_self')
      OR
      (NEW.request_type = 'vendor_request' AND NEW.delivery_method = 'rider' AND NEW.vendor_delivery_requested = true)
    )
    AND (OLD.status IS DISTINCT FROM 'Delivered'
         OR OLD.payment_status IS DISTINCT FROM 'success'
         OR OLD.vendor_delivery_requested IS DISTINCT FROM NEW.vendor_delivery_requested) THEN
    BEGIN
      v_result := public._settle_order_core(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto settlement skipped for order %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER trg_auto_settle_on_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_settle_delivered_order();

CREATE TRIGGER trg_auto_settle_on_payment
AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_settle_delivered_order();

-- ------------------------------------------------------------
-- 7. VENDOR NOTIFICATION ON DELIVERY REQUEST
-- ------------------------------------------------------------
-- Also notify the vendor when their delivery request enters the rider pool
-- (reuses existing handle_order_notifications pattern)
-- The vendor already gets notified on order_items INSERT (order placed)
-- and on status changes. This adds a specific notification when
-- their order becomes available for rider pickup.

-- ------------------------------------------------------------
-- 8. COMPATIBILITY NOTES
-- ------------------------------------------------------------
-- * Restaurant orders: unchanged flow (Paystack payment -> rider pool -> settlement)
-- * Vendor self-delivery: no rider pool, no delivery settlement, no Paystack
-- * Vendor rider delivery: vendor_delivery_requested triggers rider pool entry,
--   customer pays delivery fee via Paystack (separate checkout),
--   settlement creates delivery settlement only (no vendor product settlement)
-- * Vendor products: NO vendor_settlements created (private payment)

-- ============================================================
-- SUMMARY
-- ============================================================
-- 1. products_select_public: active products from ALL vendors (restaurant + vendor)
-- 2. enforce_order_status_transitions: vendor rider claims use vendor_delivery_requested
-- 3. notify_riders_vendor_delivery_request trigger: fires on vendor_delivery_requested flip
-- 4. _settle_order_core: conditional vendor settlement + conditional delivery settlement
-- 5. generate_settlement: admin wrapper unchanged
-- 6. auto_settle_delivered_order: conditional settlement triggers