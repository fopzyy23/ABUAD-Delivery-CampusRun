-- Require confirmed purchase funding before restaurant riders can pick up.
-- Vendor-request rider deliveries intentionally keep their existing status
-- transition because they do not use Dropzyy restaurant purchase funding.

CREATE OR REPLACE FUNCTION public.guard_pickup_requires_final_products()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='Picked up'
     AND OLD.status='Rider assigned'
     AND OLD.request_type='restaurant'
     AND OLD.delivery_method='rider'
     AND (OLD.product_availability_status IS DISTINCT FROM 'confirmed'
       OR OLD.purchase_funding_status NOT IN ('authorized','processing','transferred')) THEN
    RAISE EXCEPTION 'final products and purchase funding are required before pickup';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_pickup_requires_final_products ON public.orders;
CREATE TRIGGER trg_guard_pickup_requires_final_products
BEFORE UPDATE OF status ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.guard_pickup_requires_final_products();

CREATE OR REPLACE FUNCTION public.update_rider_order_status(p_order_id uuid, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider public.riders%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_order_json jsonb;
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

  IF v_order.request_type = 'restaurant'
     AND v_order.delivery_method = 'rider'
     AND v_order.status = 'Rider assigned'
     AND p_status = 'Picked up' THEN
    IF v_order.product_availability_status IS DISTINCT FROM 'confirmed' THEN
      RAISE EXCEPTION 'products must be confirmed before pickup' USING ERRCODE = 'P0001';
    END IF;
    IF v_order.purchase_funding_status IS DISTINCT FROM 'transferred' THEN
      RAISE EXCEPTION 'purchase funding must be transferred before pickup' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Only status is writable here. Existing BEFORE/AFTER order triggers remain
  -- authoritative, including delivery settlement and rating behavior.
  UPDATE public.orders SET status = p_status WHERE id = p_order_id;
  SELECT to_jsonb(o) INTO v_order_json
  FROM public.orders o
  WHERE o.id = p_order_id;
  RETURN jsonb_build_object('order', v_order_json, 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION public.update_rider_order_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_rider_order_status(uuid, text) TO authenticated;
