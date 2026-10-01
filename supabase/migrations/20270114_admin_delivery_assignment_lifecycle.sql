BEGIN;
CREATE OR REPLACE FUNCTION public.admin_assign_delivery_rider(p_order_id uuid,p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; r public.riders%ROWTYPE; old_r uuid; old_status text; active_count integer; next_status text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.status NOT IN ('Order confirmed','Ready for pickup','Rider assigned','Picked up','On the Way') THEN
    RAISE EXCEPTION 'order cannot be assigned from status %',o.status;
  END IF;
  IF o.delivery_method<>'rider' OR NOT (
    (o.request_type='restaurant' AND o.payment_status='success') OR
    (o.request_type='vendor_request' AND o.vendor_delivery_requested AND o.delivery_payment_status='success')) THEN
    RAISE EXCEPTION 'order is not eligible for rider delivery';
  END IF;
  SELECT * INTO r FROM public.riders WHERE id=p_rider_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'approved' OR NOT r.available THEN RAISE EXCEPTION 'rider is not eligible'; END IF;
  SELECT count(*) INTO active_count FROM public.orders
    WHERE rider_id=p_rider_id AND id<>p_order_id AND status IN ('Rider assigned','Picked up','On the Way');
  IF active_count>=2 THEN RAISE EXCEPTION 'rider active-delivery limit reached'; END IF;
  old_r:=o.rider_id; old_status:=o.status;
  next_status:=CASE WHEN o.status IN ('Order confirmed','Ready for pickup') THEN 'Rider assigned' ELSE o.status END;
  UPDATE public.orders SET rider_id=p_rider_id,status=next_status WHERE id=p_order_id RETURNING * INTO o;
  PERFORM public._admin_audit(CASE WHEN old_r IS NULL THEN 'assign_rider' ELSE 'reassign_rider' END,
    'delivery',p_order_id::text,jsonb_build_object('rider_id',old_r,'status',old_status),
    jsonb_build_object('rider_id',o.rider_id,'status',next_status));
  RETURN jsonb_build_object('order_id',p_order_id,'rider_id',p_rider_id,'status',next_status);
END; $$;
REVOKE ALL ON FUNCTION public.admin_assign_delivery_rider(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_delivery_rider(uuid,uuid) TO authenticated;
COMMIT;
