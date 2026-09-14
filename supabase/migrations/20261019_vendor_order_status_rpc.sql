-- Server-authoritative vendor order status transitions.
CREATE OR REPLACE FUNCTION public.vendor_update_order_status(
  p_order_id uuid,
  p_status text
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_status NOT IN ('Preparing', 'Ready for pickup', 'Delivered', 'Cancelled') THEN
    RAISE EXCEPTION 'invalid vendor order status';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  SELECT vendor_id INTO v_vendor_id FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_vendor_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = p_order_id AND vendor_id = v_vendor_id) THEN
    RAISE EXCEPTION 'order not found or not owned by vendor';
  END IF;
  IF v_order.request_type <> 'vendor_request' THEN
    RAISE EXCEPTION 'this is not a vendor order request';
  END IF;

  IF (v_order.status = 'Order confirmed' AND p_status NOT IN ('Preparing', 'Cancelled'))
     OR (v_order.status = 'Preparing' AND p_status NOT IN ('Ready for pickup', 'Delivered'))
     OR (v_order.status NOT IN ('Order confirmed', 'Preparing')) THEN
    RAISE EXCEPTION 'invalid vendor order status transition';
  END IF;
  IF p_status = 'Delivered' AND v_order.delivery_method <> 'vendor_self' THEN
    RAISE EXCEPTION 'only vendor_self orders can be delivered by vendor';
  END IF;

  UPDATE public.orders SET status = p_status WHERE id = p_order_id;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  RETURN jsonb_build_object('id', v_order.id, 'status', v_order.status);
END;
$$;

REVOKE ALL ON FUNCTION public.vendor_update_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_update_order_status(uuid, text) TO authenticated;
