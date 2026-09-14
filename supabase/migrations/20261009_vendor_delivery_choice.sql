-- ============================================================
-- 20261009_vendor_delivery_choice.sql
-- Stage 3: Vendor Delivery Choice RPC + supporting changes
-- ============================================================
-- Secure RPC for vendor to choose delivery method after accepting request.
-- Does NOT create Paystack payment for delivery fee (separate stage).
-- ============================================================

-- ------------------------------------------------------------
-- Vendor Delivery Choice RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_vendor_delivery_method(
  p_order_id uuid,
  p_delivery_method text  -- 'vendor_self' or 'rider'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_vendor_id text;
  v_pickup_location text;
BEGIN
  -- 1. Must be authenticated
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

  -- 3. Validate delivery method
  IF p_delivery_method NOT IN ('vendor_self', 'rider') THEN
    RAISE EXCEPTION 'invalid delivery method: %', p_delivery_method;
  END IF;

  -- 4. Lock and fetch the order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- 5. Verify this order belongs to the calling vendor
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.vendor_id = v_vendor_id
  ) THEN
    RAISE EXCEPTION 'this order does not belong to your vendor account';
  END IF;

  -- 6. Verify order is a vendor request and is accepted
  IF v_order.request_type <> 'vendor_request' THEN
    RAISE EXCEPTION 'this is not a vendor order request';
  END IF;
  IF v_order.status <> 'Preparing' THEN
    RAISE EXCEPTION 'order must be in Preparing state to set delivery method (current: %)', v_order.status;
  END IF;

  -- 7. Prevent switching after rider already claimed
  IF v_order.delivery_method = 'rider' AND v_order.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot change delivery method after rider has been assigned';
  END IF;

  -- 8. Get vendor pickup location (required for rider delivery)
  IF p_delivery_method = 'rider' THEN
    SELECT pickup_location INTO v_pickup_location
    FROM public.vendors
    WHERE id = v_vendor_id;

    IF v_pickup_location IS NULL OR v_pickup_location = '' THEN
      RAISE EXCEPTION 'vendor must have a pickup location set before requesting a rider';
    END IF;

    -- Verify customer drop-off location exists (in orders.spot)
    IF v_order.spot IS NULL OR v_order.spot = '' THEN
      RAISE EXCEPTION 'order must have a delivery location for rider delivery';
    END IF;
  END IF;

  -- 9. Update the order
  IF p_delivery_method = 'rider' THEN
    -- Vendor requests Dropzyy rider
    PERFORM set_config('app.vendor_delivery_server_update', 'on', true);

    UPDATE public.orders
    SET delivery_method = 'rider',
        vendor_delivery_requested = true,
        fee = 1500,
        rider_delivery_share = 1000,
        company_delivery_share = 500,
        vendor_decision_at = now()
    WHERE id = p_order_id;

    PERFORM set_config('app.vendor_delivery_server_update', 'off', true);

    -- Trigger rider notification (existing trigger on vendor_delivery_requested change)
    -- This will notify approved/available riders via trg_notify_riders_vendor_delivery

  ELSE
    -- Vendor self-delivery
    PERFORM set_config('app.vendor_delivery_server_update', 'on', true);

    UPDATE public.orders
    SET delivery_method = 'vendor_self',
        vendor_delivery_requested = false,
        fee = 0,
        rider_delivery_share = 0,
        company_delivery_share = 0,
        vendor_decision_at = now()
    WHERE id = p_order_id;

    PERFORM set_config('app.vendor_delivery_server_update', 'off', true);
  END IF;

  -- 10. Return updated order info
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'delivery_method', v_order.delivery_method,
    'vendor_delivery_requested', v_order.vendor_delivery_requested,
    'fee', v_order.fee,
    'rider_delivery_share', v_order.rider_delivery_share,
    'company_delivery_share', v_order.company_delivery_share,
    'pickup_location', v_pickup_location,
    'drop_off_location', v_order.spot
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_vendor_delivery_method(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_vendor_delivery_method(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_vendor_delivery_method(uuid, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- Index for vendor delivery requests lookup
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_vendor_delivery_pending
  ON public.orders (request_type, delivery_method, vendor_delivery_requested, status)
  WHERE request_type = 'vendor_request' AND delivery_method = 'rider' AND vendor_delivery_requested = true AND status = 'Preparing';

-- ------------------------------------------------------------
-- SUMMARY
-- ------------------------------------------------------------
-- * set_vendor_delivery_method: secure RPC for vendor to choose delivery method
-- * Validates vendor ownership, order state, pickup location
-- * Sets vendor_delivery_requested=true + fee=1500 for rider delivery
-- * Triggers existing rider notification via vendor_delivery_requested change
-- * Prevents changes after rider claimed
-- * NO Paystack payment created - delivery fee payment is separate stage
-- * Product payment_status remains pending_vendor (private payment)
