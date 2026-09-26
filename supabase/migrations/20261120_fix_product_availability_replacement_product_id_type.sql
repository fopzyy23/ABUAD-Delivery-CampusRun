-- Fix the replacement product ID parameter type to match the bigint column.
DROP FUNCTION IF EXISTS public.record_product_availability_check(uuid, boolean, text, numeric);

CREATE FUNCTION public.record_product_availability_check(
  p_order_item_id uuid,
  p_available boolean,
  p_replacement_product_id bigint DEFAULT NULL,
  p_replacement_price_diff numeric DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item public.order_items%ROWTYPE; v_order public.orders%ROWTYPE; v_rider uuid; v_id uuid;
BEGIN
  SELECT r.id INTO v_rider FROM public.riders r WHERE r.user_id=auth.uid() AND r.status='approved';
  IF v_rider IS NULL THEN RAISE EXCEPTION 'approved rider required'; END IF;
  SELECT * INTO v_item FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  SELECT * INTO v_order FROM public.orders WHERE id=v_item.order_id FOR UPDATE;
  IF NOT FOUND OR v_order.rider_id IS DISTINCT FROM v_rider THEN RAISE EXCEPTION 'order item is not assigned to this rider'; END IF;
  IF v_order.payment_status IS DISTINCT FROM 'success' OR v_order.cancellation_stage <> 'none'
     OR v_order.status NOT IN ('Rider assigned','Picked up','On the Way')
     OR v_order.purchase_funding_status NOT IN ('not_required','pending') THEN
    RAISE EXCEPTION 'order is not eligible for product availability checks';
  END IF;
  IF p_available AND (p_replacement_product_id IS NOT NULL OR p_replacement_price_diff IS NOT NULL) THEN
    RAISE EXCEPTION 'available item cannot contain replacement data';
  END IF;
  INSERT INTO public.product_availability_check(order_id,rider_id,order_item_id,available,replacement_product_id,replacement_price_diff,created_by)
  VALUES(v_item.order_id,v_rider,v_item.id,p_available,p_replacement_product_id,p_replacement_price_diff,auth.uid()) RETURNING id INTO v_id;
  UPDATE public.order_items SET availability_state=CASE WHEN p_available THEN 'available' ELSE 'unavailable' END, availability_confirmed_at=now() WHERE id=v_item.id;
  UPDATE public.orders SET product_availability_status=CASE WHEN p_available THEN 'in_progress' ELSE 'needs_customer_decision' END WHERE id=v_order.id;
  IF NOT p_available AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=v_order.id AND type='warning' AND title='Product unavailable') THEN
    INSERT INTO public.notifications(user_id,title,message,type,related_order_id) VALUES(v_order.user_id,'Product unavailable','A product requires your decision before the order can proceed.','warning',v_order.id);
  END IF;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.record_product_availability_check(uuid, boolean, bigint, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_product_availability_check(uuid, boolean, bigint, numeric) TO authenticated;
