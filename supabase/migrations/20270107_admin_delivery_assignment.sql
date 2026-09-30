-- Phase 3: safe admin rider assignment. Does not alter rider claim rules.
CREATE OR REPLACE FUNCTION public.admin_assign_delivery_rider(p_order_id uuid, p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; r public.riders%ROWTYPE; old_r uuid; active_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.status IN ('Delivered','Rated','Cancelled') THEN RAISE EXCEPTION 'completed or cancelled orders cannot be assigned'; END IF;
  IF o.delivery_method NOT IN ('rider','both') OR o.payment_status <> 'success' THEN RAISE EXCEPTION 'order is not eligible for rider delivery'; END IF;
  SELECT * INTO r FROM public.riders WHERE id=p_rider_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'approved' OR NOT r.available THEN RAISE EXCEPTION 'rider is not eligible'; END IF;
  SELECT count(*) INTO active_count FROM public.orders WHERE rider_id=p_rider_id AND status IN ('Rider assigned','Picked up','On the Way') AND id<>p_order_id;
  IF active_count >= 2 THEN RAISE EXCEPTION 'rider active-delivery limit reached'; END IF;
  old_r := o.rider_id;
  UPDATE public.orders SET rider_id=p_rider_id, status=CASE WHEN status='Order confirmed' THEN 'Rider assigned' ELSE status END WHERE id=p_order_id RETURNING * INTO o;
  PERFORM public._admin_audit(CASE WHEN old_r IS NULL THEN 'assign_rider' ELSE 'reassign_rider' END,'delivery',p_order_id::text,jsonb_build_object('rider_id',old_r),jsonb_build_object('rider_id',o.rider_id,'status',o.status));
  RETURN jsonb_build_object('order_id',p_order_id,'rider_id',p_rider_id,'status',o.status);
END; $$;
REVOKE ALL ON FUNCTION public.admin_assign_delivery_rider(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_delivery_rider(uuid,uuid) TO authenticated;
