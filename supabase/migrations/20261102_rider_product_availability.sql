-- Phase 3: rider product-availability flow. No money movement or transfer creation.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_availability_status text NOT NULL DEFAULT 'not_started'
    CHECK (product_availability_status IN ('not_started','in_progress','needs_customer_decision','confirmed'));
CREATE INDEX IF NOT EXISTS idx_orders_product_availability_status
  ON public.orders(product_availability_status, rider_id);

CREATE OR REPLACE FUNCTION public.record_product_availability_check(
  p_order_item_id uuid, p_available boolean,
  p_replacement_product_id text DEFAULT NULL,
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

CREATE OR REPLACE FUNCTION public.confirm_order_products(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_rider uuid; v_id uuid; v_unchecked integer; v_unavailable integer; v_pending_replacements integer;
BEGIN
  SELECT r.id INTO v_rider FROM public.riders r WHERE r.user_id=auth.uid() AND r.status='approved';
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.rider_id IS DISTINCT FROM v_rider THEN RAISE EXCEPTION 'order is not assigned to this rider'; END IF;
  IF v_order.payment_status IS DISTINCT FROM 'success' OR v_order.cancellation_stage <> 'none'
     OR v_order.status NOT IN ('Rider assigned','Picked up','On the Way')
     OR v_order.purchase_funding_status NOT IN ('not_required','pending') THEN RAISE EXCEPTION 'order is not eligible for confirmation'; END IF;
  IF EXISTS (SELECT 1 FROM public.cancellations WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'order cancellation already won the state transition'; END IF;
  SELECT count(*) INTO v_unchecked FROM public.order_items oi
  WHERE oi.order_id=p_order_id AND NOT EXISTS (SELECT 1 FROM public.product_availability_check pc WHERE pc.order_item_id=oi.id AND pc.order_id=p_order_id);
  IF v_unchecked > 0 THEN RAISE EXCEPTION 'every order item must be checked'; END IF;
  SELECT count(*) INTO v_unavailable FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.availability_state='unavailable';
  SELECT count(*) INTO v_pending_replacements FROM public.order_replacements r WHERE r.order_id=p_order_id AND r.status='pending';
  IF v_unavailable > 0 OR v_pending_replacements > 0 THEN
    UPDATE public.orders SET product_availability_status='needs_customer_decision' WHERE id=p_order_id;
    RAISE EXCEPTION 'unavailable products require customer decision';
  END IF;
  INSERT INTO public.purchase_funding(order_id,rider_id,amount,status,authorized_at,created_by,updated_by)
  SELECT p_order_id,v_rider,COALESCE(SUM(oi.price*oi.qty),0),'authorized',now(),auth.uid(),auth.uid()
  FROM public.order_items oi WHERE oi.order_id=p_order_id
  ON CONFLICT (order_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.purchase_funding WHERE order_id=p_order_id; END IF;
  UPDATE public.orders SET product_availability_status='confirmed', purchase_funding_status='authorized', products_confirmed_at=COALESCE(products_confirmed_at,now()) WHERE id=p_order_id;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=p_order_id AND type='order_status' AND title='Products confirmed') THEN
    INSERT INTO public.notifications(user_id,title,message,type,related_order_id) VALUES(v_order.user_id,'Products confirmed','The rider confirmed all products. Your order is proceeding.','order_status',p_order_id);
  END IF;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.record_product_availability_check(uuid,boolean,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_product_availability_check(uuid,boolean,text,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.confirm_order_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_products(uuid) TO authenticated;
