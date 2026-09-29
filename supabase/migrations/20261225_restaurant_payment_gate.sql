-- 20261225_restaurant_payment_gate.sql
-- Prevent restaurant preparation until the product payment is successful.

CREATE OR REPLACE FUNCTION public.restaurant_vendor_update_order_status(p_order_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_vendor_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_status NOT IN ('Preparing','Ready for pickup','Delivered','Cancelled') THEN RAISE EXCEPTION 'invalid vendor order status'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  SELECT vendor_id INTO v_vendor_id FROM public.profiles WHERE id=auth.uid();
  IF NOT FOUND OR v_vendor_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id=p_order_id AND vendor_id=v_vendor_id) THEN RAISE EXCEPTION 'order not found or not owned by vendor'; END IF;
  IF v_order.request_type <> 'restaurant' THEN RAISE EXCEPTION 'this is not a restaurant order'; END IF;
  IF p_status='Preparing' AND v_order.payment_status IS DISTINCT FROM 'success' THEN RAISE EXCEPTION 'restaurant order payment is not successful'; END IF;
  IF (v_order.status='Order confirmed' AND p_status NOT IN ('Preparing','Cancelled')) OR (v_order.status='Preparing' AND p_status NOT IN ('Ready for pickup','Delivered')) OR v_order.status NOT IN ('Order confirmed','Preparing') THEN RAISE EXCEPTION 'invalid vendor order status transition'; END IF;
  IF p_status='Delivered' AND v_order.delivery_method <> 'vendor_self' THEN RAISE EXCEPTION 'only vendor_self orders can be delivered by vendor'; END IF;
  UPDATE public.orders SET status=p_status WHERE id=p_order_id;
  RETURN jsonb_build_object('id',p_order_id,'status',p_status);
END; $$;
REVOKE ALL ON FUNCTION public.restaurant_vendor_update_order_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restaurant_vendor_update_order_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_restaurant_preparing_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.request_type='restaurant' AND OLD.status='Order confirmed' AND NEW.status='Preparing'
     AND NEW.payment_status IS DISTINCT FROM 'success' THEN
    RAISE EXCEPTION 'restaurant order payment is not successful';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_restaurant_preparing_payment ON public.orders;
CREATE TRIGGER trg_guard_restaurant_preparing_payment BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_restaurant_preparing_payment();
