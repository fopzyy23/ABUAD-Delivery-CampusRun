-- Phase 4: authorize and execute purchase funding. No replacement,
-- reimbursement, withdrawal, or settlement behavior is changed.

CREATE OR REPLACE FUNCTION public.confirm_order_products(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_rider uuid; v_id uuid; v_unchecked integer; v_unavailable integer; v_pending_replacements integer;
BEGIN
  SELECT r.id INTO v_rider FROM public.riders r WHERE r.user_id=auth.uid() AND r.status='approved';
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.rider_id IS DISTINCT FROM v_rider THEN RAISE EXCEPTION 'order is not assigned to this rider'; END IF;
  IF v_order.cancellation_stage IS DISTINCT FROM 'none' OR EXISTS (SELECT 1 FROM public.cancellations WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'order cancellation already won the state transition'; END IF;
  IF v_order.purchase_funding_status='authorized' THEN
    SELECT id INTO v_id FROM public.purchase_funding WHERE order_id=p_order_id AND rider_id=v_rider;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF v_order.payment_status IS DISTINCT FROM 'success' OR v_order.status NOT IN ('Rider assigned','Picked up','On the Way')
     OR v_order.purchase_funding_status NOT IN ('not_required','pending') THEN RAISE EXCEPTION 'order is not eligible for confirmation'; END IF;
  SELECT count(*) INTO v_unchecked FROM public.order_items oi WHERE oi.order_id=p_order_id
    AND NOT EXISTS (SELECT 1 FROM public.product_availability_check pc WHERE pc.order_item_id=oi.id AND pc.order_id=p_order_id);
  IF v_unchecked > 0 THEN RAISE EXCEPTION 'every order item must be checked'; END IF;
  SELECT count(*) INTO v_unavailable FROM public.order_items oi WHERE oi.order_id=p_order_id AND oi.availability_state <> 'available';
  SELECT count(*) INTO v_pending_replacements FROM public.order_replacements r WHERE r.order_id=p_order_id AND r.status='pending';
  IF v_unavailable > 0 OR v_pending_replacements > 0 THEN
    UPDATE public.orders SET product_availability_status='needs_customer_decision' WHERE id=p_order_id;
    RAISE EXCEPTION 'unavailable products require customer decision';
  END IF;
  INSERT INTO public.purchase_funding(order_id,rider_id,amount,status,authorized_at,created_by,updated_by)
  SELECT p_order_id,v_rider,SUM(oi.price*oi.qty),'authorized',now(),auth.uid(),auth.uid() FROM public.order_items oi WHERE oi.order_id=p_order_id
  ON CONFLICT (order_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.purchase_funding WHERE order_id=p_order_id; END IF;
  UPDATE public.orders SET product_availability_status='confirmed',purchase_funding_status='authorized',products_confirmed_at=COALESCE(products_confirmed_at,now()) WHERE id=p_order_id;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=p_order_id AND type='order_status' AND title='Products confirmed') THEN
    INSERT INTO public.notifications(user_id,title,message,type,related_order_id) VALUES(v_order.user_id,'Products confirmed','The rider confirmed all products. Purchase funding is being prepared.','order_status',p_order_id);
  END IF;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.apply_transfer_webhook_event(p_reference text,p_transfer_code text,p_event_status text,p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transfers%ROWTYPE; ns text; f public.purchase_funding%ROWTYPE; c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; rider_user uuid;
BEGIN
 IF p_event_status NOT IN ('success','failed','reversed') THEN RAISE EXCEPTION 'unsupported transfer status'; END IF;
 SELECT * INTO t FROM public.transfers WHERE paystack_reference=p_reference FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'no transfer for reference'; END IF;
 IF NULLIF(p_transfer_code,'') IS NOT NULL AND t.transfer_code IS NOT NULL AND p_transfer_code<>t.transfer_code THEN RAISE EXCEPTION 'transfer code mismatch'; END IF;
 IF t.status IN ('success','reversed') OR (t.status='failed' AND p_event_status='failed') THEN RETURN t.status; END IF;
 IF t.status='pending' AND p_event_status<>'success' THEN RETURN t.status; END IF;
 ns:=p_event_status; PERFORM set_config('app.transfer_server_update','on',true);
 UPDATE public.transfers SET status=ns,transfer_code=COALESCE(transfer_code,NULLIF(p_transfer_code,'')),raw_payload=COALESCE(p_payload,raw_payload) WHERE id=t.id;
 IF t.transfer_kind='purchase_funding' THEN
   SELECT * INTO f FROM public.purchase_funding WHERE id=t.purchase_funding_id FOR UPDATE;
   UPDATE public.purchase_funding SET status=CASE ns WHEN 'success' THEN 'transferred' WHEN 'reversed' THEN 'reversed' ELSE 'failed' END,transferred_at=CASE WHEN ns='success' THEN COALESCE(transferred_at,now()) ELSE transferred_at END,failure_reason=CASE WHEN ns<>'success' THEN COALESCE(p_payload->>'message','Purchase funding transfer was not successful') ELSE failure_reason END,updated_at=now() WHERE id=t.purchase_funding_id;
   UPDATE public.orders SET purchase_funding_status=CASE ns WHEN 'success' THEN 'transferred' WHEN 'reversed' THEN 'reversed' ELSE 'failed' END WHERE id=f.order_id;
   SELECT r.user_id INTO rider_user FROM public.riders r WHERE r.id=f.rider_id;
   IF rider_user IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=f.order_id AND type='rider' AND title=CASE ns WHEN 'success' THEN 'Purchase funds released' WHEN 'failed' THEN 'Purchase funding failed' ELSE 'Purchase funding reversed' END) THEN
     INSERT INTO public.notifications(user_id,title,message,type,related_order_id) VALUES(rider_user,CASE ns WHEN 'success' THEN 'Purchase funds released' WHEN 'failed' THEN 'Purchase funding failed' ELSE 'Purchase funding reversed' END,CASE ns WHEN 'success' THEN 'Purchase funds are available for the confirmed products.' WHEN 'failed' THEN 'Purchase funding could not be released. This order requires recovery.' ELSE 'Purchase funding was reversed. Do not purchase products until recovery is complete.' END,'rider',f.order_id);
   END IF;
 ELSIF t.transfer_kind='customer_reimbursement' THEN
   SELECT * INTO c FROM public.cancellations WHERE id=t.cancellation_id FOR UPDATE; SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
   UPDATE public.cancellations SET stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END,reimbursement_transfer_id=CASE WHEN ns='success' THEN t.id ELSE reimbursement_transfer_id END,resolved_at=COALESCE(resolved_at,now()),updated_at=now() WHERE id=t.cancellation_id;
   UPDATE public.orders SET cancellation_stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END WHERE id=c.order_id;
 ELSIF t.withdrawal_request_id IS NOT NULL AND ns='success' THEN
   UPDATE public.withdrawal_requests SET status='paid',reviewed_at=COALESCE(reviewed_at,now()) WHERE id=t.withdrawal_request_id AND status<>'paid';
 END IF;
 RETURN ns;
END; $$;

REVOKE ALL ON FUNCTION public.confirm_order_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_products(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_transfer_webhook_event(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transfer_webhook_event(text,text,text,jsonb) TO service_role;
