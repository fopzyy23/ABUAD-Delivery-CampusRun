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
  v_result jsonb;
BEGIN
  -- Verify caller is an approved, available rider
  SELECT * INTO v_rider
  FROM public.riders
  WHERE user_id = auth.uid()
    AND status = 'approved'
    AND available = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rider not found, not approved, or not available' USING ERRCODE = '42501';
  END IF;

  -- Lock the order row for update
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = '404';
  END IF;

  -- Validate claim eligibility (mirrors orders_update_claim policy)
  IF v_order.rider_id IS NOT NULL THEN
    RAISE EXCEPTION 'Order already has a rider assigned' USING ERRCODE = '409';
  END IF;

  IF v_order.delivery_method <> 'rider' THEN
    RAISE EXCEPTION 'Order is not a rider delivery' USING ERRCODE = '409';
  END IF;

  IF v_order.status NOT IN ('Order confirmed', 'Ready for pickup') THEN
    RAISE EXCEPTION 'Order cannot be claimed in status %' USING ERRCODE = '409', v_order.status;
  END IF;

  -- Payment eligibility
  IF v_order.request_type = 'restaurant' THEN
    IF v_order.payment_status <> 'success' THEN
      RAISE EXCEPTION 'Order payment not successful' USING ERRCODE = '409';
    END IF;
  ELSIF v_order.request_type = 'vendor_request' THEN
    IF v_order.vendor_delivery_requested IS DISTINCT FROM true
       OR v_order.delivery_payment_status <> 'success' THEN
      RAISE EXCEPTION 'Vendor delivery payment not successful' USING ERRCODE = '409';
    END IF;
  END IF;

  -- Perform the claim
  UPDATE public.orders
  SET status = 'Rider assigned',
      rider_id = v_rider.id,
      updated_at = now()
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
  v_profile RECORD;
BEGIN
  -- Verify the caller is authorized to see rider details for each order
  -- A caller can see rider details if:
  -- 1. They are the customer who placed the order (user_id = auth.uid())
  -- 2. They are the assigned rider (rider.user_id = auth.uid())
  -- 3. They are a vendor with items on the order
  -- 4. They are an admin
  IF p_order_ids IS NULL OR array_length(p_order_ids, 1) = 0 THEN
    RETURN;
  END IF;

  FOR v_order_id IN SELECT * FROM unnest(p_order_ids) LOOP
    -- Check authorization for this order
    IF NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = v_order_id
        AND (
          o.user_id = auth.uid()                           -- Customer owns order
          OR o.rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid()) -- Rider assigned
          OR o.id IN (                                     -- Vendor has items on order
            SELECT order_id FROM public.order_items
            WHERE vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
          )
          OR public.is_admin()                             -- Admin
        )
    ) THEN
      -- Silently skip unauthorized orders (privacy-safe)
      CONTINUE;
    END IF;

    -- Fetch rider details for this order
    SELECT r.id, r.user_id, r.full_name, r.phone, r.matric_number, r.rating_avg, r.rating_count
    INTO v_rider_record
    FROM public.riders r
    JOIN public.orders o ON o.rider_id = r.id
    WHERE o.id = v_order_id
    LIMIT 1;

    IF FOUND THEN
      -- Get profile for additional details if needed
      SELECT full_name, phone INTO v_profile
      FROM public.profiles
      WHERE id = v_rider_record.user_id;

      RETURN NEXT jsonb_build_object(
        'order_id', v_order_id,
        'rider_id', v_rider_record.id,
        'full_name', COALESCE(v_profile.full_name, v_rider_record.full_name),
        'phone', COALESCE(v_profile.phone, v_rider_record.phone),
        'matric_number', v_rider_record.matric_number,
        'rating_avg', v_rider_record.rating_avg,
        'rating_count', v_rider_record.rating_count
      );
    ELSE
      -- No rider assigned yet
      RETURN NEXT jsonb_build_object(
        'order_id', v_order_id,
        'rider_id', NULL,
        'full_name', NULL,
        'phone', NULL,
        'matric_number', NULL,
        'rating_avg', NULL,
        'rating_count', NULL
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_rider_details_for_orders(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rider_details_for_orders(uuid[]) TO authenticated;