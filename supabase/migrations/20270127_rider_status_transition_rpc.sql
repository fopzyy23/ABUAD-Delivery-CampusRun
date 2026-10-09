-- Server-authoritative rider delivery status transitions.
-- The browser must not PATCH orders: admin accounts are intentionally blocked
-- by trg_reject_direct_admin_mutation, and status changes need one narrow path.
CREATE OR REPLACE FUNCTION public.update_rider_order_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider public.riders%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_expected text;
BEGIN
  SELECT r.* INTO v_rider
  FROM public.riders r
  WHERE r.user_id = auth.uid() AND r.status = 'approved'
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approved rider required' USING ERRCODE = '42501';
  END IF;

  SELECT o.* INTO v_order
  FROM public.orders o
  WHERE o.id = p_order_id AND o.rider_id = v_rider.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order is not assigned to this rider' USING ERRCODE = '42501';
  END IF;

  v_expected := CASE v_order.status
    WHEN 'Rider assigned' THEN 'Picked up'
    WHEN 'Picked up' THEN 'On the Way'
    WHEN 'On the Way' THEN 'Delivered'
    ELSE NULL
  END;
  IF p_status IS NULL OR p_status IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'invalid rider status transition % -> %', v_order.status, p_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Only status is writable here. Existing BEFORE/AFTER order triggers remain
  -- authoritative, including delivery settlement and rating behavior.
  UPDATE public.orders SET status = p_status WHERE id = p_order_id;
  SELECT to_jsonb(o) INTO v_order FROM public.orders o WHERE o.id = p_order_id;
  RETURN jsonb_build_object('order', to_jsonb(v_order), 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.update_rider_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_rider_order_status(uuid, text) TO authenticated;
