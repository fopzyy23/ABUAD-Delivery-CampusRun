-- ============================================================
-- 20270116_rider_claim_order_rpc.sql
-- ============================================================
-- Provides an authoritative RPC for riders to claim orders.
-- Replaces the direct PATCH on orders table which is blocked for
-- admin users by trg_reject_direct_admin_mutation.
-- Returns the updated order row so the frontend can patch state
-- without a broad reload.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_order(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_rider public.riders%ROWTYPE;
  v_active_count integer;
  v_result jsonb;
BEGIN
  -- Verify caller is an approved, available rider
  SELECT * INTO v_rider
  FROM public.riders
  WHERE user_id = auth.uid()
    AND status = 'approved'
    AND available = true
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rider not found, not approved, or not available' USING ERRCODE = '42501';
  END IF;

  -- Lock the order row for update
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0001';
  END IF;

  -- Validate claim eligibility (mirrors orders_update_claim policy)
  IF v_order.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Order already has a rider assigned' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.delivery_method <> 'rider' THEN
    RAISE EXCEPTION 'Order is not a rider delivery' USING ERRCODE = 'P0001';
  END IF;

  IF v_order.status NOT IN ('Order confirmed', 'Ready for pickup') THEN
    RAISE EXCEPTION 'Order cannot be claimed in status %', v_order.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Payment eligibility
  IF v_order.request_type = 'restaurant' THEN
    IF v_order.payment_status <> 'success' THEN
      RAISE EXCEPTION 'Order payment not successful' USING ERRCODE = 'P0001';
    END IF;
  ELSIF v_order.request_type = 'vendor_request' THEN
    IF v_order.vendor_delivery_requested IS DISTINCT FROM true
       OR v_order.delivery_payment_status <> 'success' THEN
      RAISE EXCEPTION 'Vendor delivery payment not successful' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'Order is not eligible for rider delivery' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize claims made by the same rider (the rider row is locked above),
  -- then enforce the canonical active states used by the final transition
  -- trigger and the admin assignment RPC.
  SELECT count(*) INTO v_active_count
  FROM public.orders
  WHERE rider_id = v_rider.id
    AND status IN ('Rider assigned', 'Picked up', 'On the Way');

  IF v_active_count >= 2 THEN
    RAISE EXCEPTION 'Rider already has % active deliveries (maximum 2)', v_active_count
      USING ERRCODE = 'P0001';
  END IF;

  -- Perform the claim
  UPDATE public.orders
  SET status = 'Rider assigned',
      rider_id = v_rider.id
  WHERE id = p_order_id;

  -- Return authoritative updated order
  SELECT to_jsonb(o) INTO v_result
  FROM public.orders o
  WHERE o.id = p_order_id;

  RETURN jsonb_build_object(
    'order', v_result,
    'rider_id', v_rider.id,
    'status', 'Rider assigned'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_order(uuid) TO authenticated;

-- ============================================================
-- Batch rider details for multiple orders
-- Replaces N sequential get_rider_details_for_order calls
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_rider_details_for_orders(p_order_ids uuid[])
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_rider_record RECORD;
BEGIN
  -- Verify the caller is authorized to see rider details for each order
  -- Match get_rider_details_for_order(): only the customer who placed an
  -- order may see the assigned approved rider's name and phone number.
  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) = 0 THEN
    RETURN;
  END IF;

  FOR v_order_id IN SELECT * FROM unnest(p_order_ids) LOOP
    -- Check authorization for this order
    IF NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = v_order_id
        AND (
          o.user_id = auth.uid()
        )
    ) THEN
      -- Silently skip unauthorized orders (privacy-safe)
      CONTINUE;
    END IF;

    -- Fetch rider details for this order
    SELECT r.id, p.full_name, r.phone
    INTO v_rider_record
    FROM public.riders r
    JOIN public.orders o ON o.rider_id = r.id
    JOIN public.profiles p ON p.id = r.user_id
    WHERE o.id = v_order_id
      AND r.status = 'approved'
    LIMIT 1;

    IF FOUND THEN
      RETURN NEXT jsonb_build_object(
        'order_id', v_order_id,
        'rider_id', v_rider_record.id,
        'full_name', v_rider_record.full_name,
        'phone', v_rider_record.phone
      );
    ELSE
      -- No rider assigned yet
      RETURN NEXT jsonb_build_object(
        'order_id', v_order_id,
        'rider_id', NULL,
        'full_name', NULL,
        'phone', NULL
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_rider_details_for_orders(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rider_details_for_orders(uuid[]) TO authenticated;
