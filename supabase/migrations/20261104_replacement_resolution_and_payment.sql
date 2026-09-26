-- Phase 5: customer resolution of unavailable products and additional payment.
-- Original order-item snapshot columns are never overwritten.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS final_product_id bigint REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS final_price numeric CHECK (final_price >= 0),
  ADD COLUMN IF NOT EXISTS final_removed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_resolution text CHECK (final_resolution IN ('available','replaced','removed')),
  ADD COLUMN IF NOT EXISTS final_resolved_at timestamptz;

ALTER TABLE public.order_replacements DROP CONSTRAINT IF EXISTS order_replacements_replacement_product_id_not_null;
ALTER TABLE public.order_replacements ALTER COLUMN replacement_product_id DROP NOT NULL;
ALTER TABLE public.order_replacements DROP CONSTRAINT IF EXISTS order_replacements_customer_decision_check;
ALTER TABLE public.order_replacements ADD CONSTRAINT order_replacements_customer_decision_check CHECK (customer_decision IN ('pending','accepted','declined','removed'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS original_paid_amount numeric NOT NULL DEFAULT 0 CHECK (original_paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS final_product_total numeric CHECK (final_product_total >= 0),
  ADD COLUMN IF NOT EXISTS final_order_total numeric CHECK (final_order_total >= 0),
  ADD COLUMN IF NOT EXISTS additional_amount_due numeric NOT NULL DEFAULT 0 CHECK (additional_amount_due >= 0),
  ADD COLUMN IF NOT EXISTS overpaid_amount numeric NOT NULL DEFAULT 0 CHECK (overpaid_amount >= 0),
  ADD COLUMN IF NOT EXISTS final_financial_status text NOT NULL DEFAULT 'original_paid'
    CHECK (final_financial_status IN ('original_paid','additional_payment_required','settled','overpaid_pending_resolution','cancelled'));

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS replacement_obligation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_replacement_payment_active
  ON public.payments(replacement_obligation_id) WHERE replacement_obligation_id IS NOT NULL AND status IN ('pending','success');
CREATE INDEX IF NOT EXISTS idx_order_items_final_order ON public.order_items(order_id, final_removed);

CREATE OR REPLACE FUNCTION public.recalculate_final_order_financials(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_order public.orders%ROWTYPE; v_product numeric; v_paid numeric; v_final numeric; v_due numeric; v_over numeric;
BEGIN
 SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
 SELECT COALESCE(SUM(CASE WHEN NOT oi.final_removed THEN COALESCE(oi.final_price,oi.price)*oi.qty ELSE 0 END),0) INTO v_product FROM public.order_items oi WHERE oi.order_id=p_order_id;
 SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.payments WHERE order_id=p_order_id AND payment_type='product' AND status='success';
 SELECT v_product+COALESCE(v_order.fee,0), GREATEST(v_product+COALESCE(v_order.fee,0)-v_paid,0), GREATEST(v_paid-(v_product+COALESCE(v_order.fee,0)),0) INTO v_final,v_due,v_over;
 UPDATE public.orders SET original_paid_amount=v_paid,final_product_total=v_product,final_order_total=v_final,additional_amount_due=v_due,overpaid_amount=v_over,final_financial_status=CASE WHEN v_due>0 THEN 'additional_payment_required' WHEN v_over>0 THEN 'overpaid_pending_resolution' ELSE 'settled' END WHERE id=p_order_id;
END; $$;

REVOKE ALL ON FUNCTION public.recalculate_final_order_financials(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.customer_replace_unavailable_item(p_order_item_id uuid,p_replacement_product_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE oi public.order_items%ROWTYPE; o public.orders%ROWTYPE; p public.products%ROWTYPE; r public.order_replacements%ROWTYPE; diff numeric; due numeric; replacement_product_id bigint;
BEGIN
 SELECT * INTO oi FROM public.order_items WHERE id=p_order_item_id FOR UPDATE; SELECT * INTO o FROM public.orders WHERE id=oi.order_id FOR UPDATE;
 IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'order item is not owned by caller'; END IF;
 IF o.cancellation_stage <> 'none' OR o.purchase_funding_status NOT IN ('not_required','pending') THEN RAISE EXCEPTION 'order is not accepting replacement decisions'; END IF;
 IF oi.availability_state <> 'unavailable' THEN RAISE EXCEPTION 'item is not unavailable'; END IF;
 IF p_replacement_product_id IS NULL OR p_replacement_product_id !~ '^[0-9]+$' THEN RAISE EXCEPTION 'replacement product id must be a positive integer'; END IF;
 replacement_product_id := p_replacement_product_id::bigint;
 SELECT * INTO p FROM public.products WHERE id=replacement_product_id AND active=true FOR SHARE;
 IF NOT FOUND OR p.vendor_id IS DISTINCT FROM oi.vendor_id THEN RAISE EXCEPTION 'replacement must be an active product from the same vendor'; END IF;
 diff := (p.price-oi.price)*oi.qty;
 SELECT * INTO r FROM public.order_replacements WHERE order_item_id=oi.id FOR UPDATE;
 IF FOUND AND r.status='paid' THEN RAISE EXCEPTION 'replacement already resolved'; END IF;
 IF FOUND THEN UPDATE public.order_replacements SET replacement_product_id=p.id,price_difference=diff,customer_decision='accepted',updated_at=now() WHERE id=r.id;
 ELSE INSERT INTO public.order_replacements(order_id,order_item_id,original_product_id,replacement_product_id,price_difference,customer_decision,status) VALUES(o.id,oi.id,oi.product_id,p.id,diff,'accepted','pending'); END IF;
 UPDATE public.order_items SET final_product_id=p.id,final_price=p.price,final_removed=false,final_resolution='replaced',final_resolved_at=CASE WHEN diff<=0 THEN now() ELSE NULL END WHERE id=oi.id;
 PERFORM public.recalculate_final_order_financials(o.id); SELECT additional_amount_due INTO due FROM public.orders WHERE id=o.id;
 IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=o.id AND user_id=(SELECT user_id FROM public.riders WHERE id=o.rider_id) AND title='Customer decision received') THEN
   INSERT INTO public.notifications(user_id,title,message,type,related_order_id) SELECT r.user_id,'Customer decision received',CASE WHEN diff>0 THEN 'A replacement was selected. The order is waiting for additional customer payment.' ELSE 'A replacement was selected. The order is ready for final confirmation.' END,'rider',o.id FROM public.riders r WHERE r.id=o.rider_id;
 END IF;
 IF diff<=0 THEN UPDATE public.order_replacements SET status='paid',updated_at=now() WHERE order_item_id=oi.id; UPDATE public.order_items SET availability_state='replaced' WHERE id=oi.id; END IF;
 RETURN jsonb_build_object('order_id',o.id,'order_item_id',oi.id,'price_difference',diff,'additional_amount_due',due,'requires_payment',diff>0);
END; $$;

CREATE OR REPLACE FUNCTION public.customer_remove_unavailable_item(p_order_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE oi public.order_items%ROWTYPE; o public.orders%ROWTYPE; r public.order_replacements%ROWTYPE; due numeric;
BEGIN
 SELECT * INTO oi FROM public.order_items WHERE id=p_order_item_id FOR UPDATE; SELECT * INTO o FROM public.orders WHERE id=oi.order_id FOR UPDATE;
 IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'order item is not owned by caller'; END IF;
 IF o.cancellation_stage <> 'none' OR o.purchase_funding_status NOT IN ('not_required','pending') OR oi.availability_state <> 'unavailable' THEN RAISE EXCEPTION 'item is not eligible for removal'; END IF;
 SELECT * INTO r FROM public.order_replacements WHERE order_item_id=oi.id FOR UPDATE;
 IF FOUND AND r.status='paid' THEN RAISE EXCEPTION 'item already resolved'; END IF;
 IF FOUND THEN UPDATE public.order_replacements SET customer_decision='removed',status='paid',updated_at=now() WHERE id=r.id;
 ELSE INSERT INTO public.order_replacements(order_id,order_item_id,original_product_id,replacement_product_id,price_difference,customer_decision,status) VALUES(o.id,oi.id,oi.product_id,NULL,-(oi.price*oi.qty),'removed','paid'); END IF;
 UPDATE public.order_items SET final_product_id=NULL,final_price=0,final_removed=true,final_resolution='removed',final_resolved_at=now(),availability_state='available' WHERE id=oi.id;
 PERFORM public.recalculate_final_order_financials(o.id); SELECT additional_amount_due INTO due FROM public.orders WHERE id=o.id;
 IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=o.id AND user_id=(SELECT user_id FROM public.riders WHERE id=o.rider_id) AND title='Customer decision received') THEN
   INSERT INTO public.notifications(user_id,title,message,type,related_order_id) SELECT r.user_id,'Customer decision received','The unavailable item was removed. The order is ready for final confirmation.','rider',o.id FROM public.riders r WHERE r.id=o.rider_id;
 END IF;
 RETURN jsonb_build_object('order_id',o.id,'order_item_id',oi.id,'additional_amount_due',due);
END; $$;

CREATE OR REPLACE FUNCTION public.create_replacement_payment_obligation(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; p public.payments%ROWTYPE; rid uuid; ref text;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
 PERFORM public.recalculate_final_order_financials(o.id); SELECT * INTO o FROM public.orders WHERE id=o.id FOR UPDATE;
 IF o.additional_amount_due<=0 THEN RAISE EXCEPTION 'no additional payment is required'; END IF;
 SELECT * INTO p FROM public.payments WHERE replacement_obligation_id=o.id AND status IN ('pending','success') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN RETURN jsonb_build_object('payment_id',p.id,'reference',p.reference,'amount',p.amount,'status',p.status); END IF;
 ref:='dropzyy-replacement-'||o.id::text||'-'||gen_random_uuid()::text;
 INSERT INTO public.payments(order_id,reference,amount,currency,status,payment_type,replacement_obligation_id) VALUES(o.id,ref,o.additional_amount_due,'NGN','pending','replacement',o.id) RETURNING id INTO rid;
 RETURN jsonb_build_object('payment_id',rid,'reference',ref,'amount',o.additional_amount_due,'status','pending');
END; $$;

CREATE OR REPLACE FUNCTION public.handle_replacement_payment_success(p_reference text,p_transaction_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments%ROWTYPE; o public.orders%ROWTYPE; r public.order_replacements%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.payments WHERE reference=p_reference AND payment_type='replacement' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'replacement payment not found'; END IF;
 IF p.status='success' THEN RETURN; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p.order_id FOR UPDATE;
 IF p.amount IS DISTINCT FROM o.additional_amount_due THEN RAISE EXCEPTION 'replacement payment amount no longer matches obligation'; END IF;
 PERFORM set_config('app.order_server_update','on',true);
 UPDATE public.payments SET status='success',transaction_id=p_transaction_id::bigint,updated_at=now() WHERE id=p.id;
 UPDATE public.order_replacements SET status='paid',updated_at=now() WHERE order_id=o.id AND customer_decision='accepted' AND status='pending';
 UPDATE public.order_items SET availability_state='replaced' WHERE order_id=o.id AND final_resolution='replaced';
 PERFORM public.recalculate_final_order_financials(o.id);
END; $$;

REVOKE ALL ON FUNCTION public.customer_replace_unavailable_item(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_replace_unavailable_item(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.customer_remove_unavailable_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_remove_unavailable_item(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_replacement_payment_obligation(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_replacement_payment_obligation(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.handle_replacement_payment_success(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_replacement_payment_success(text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.handle_replacement_payment_failed(p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.payments SET status='failed',updated_at=now() WHERE reference=p_reference AND payment_type='replacement' AND status<>'success';
END; $$;
REVOKE ALL ON FUNCTION public.handle_replacement_payment_failed(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_replacement_payment_failed(text) TO service_role;
CREATE OR REPLACE FUNCTION public.store_replacement_payment_checkout(p_order_id uuid,p_reference text,p_amount numeric,p_authorization_url text,p_access_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid; o public.orders%ROWTYPE; p public.payments%ROWTYPE;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.additional_amount_due IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'replacement amount mismatch'; END IF;
 SELECT * INTO p FROM public.payments WHERE reference=p_reference FOR UPDATE;
 IF FOUND THEN RETURN p.id; END IF;
 INSERT INTO public.payments(order_id,reference,amount,currency,status,payment_type,replacement_obligation_id,authorization_url,access_code) VALUES(p_order_id,p_reference,p_amount,'NGN','pending','replacement',p_order_id,p_authorization_url,p_access_code) RETURNING payments.id INTO id;
 RETURN id;
END; $$;
REVOKE ALL ON FUNCTION public.store_replacement_payment_checkout(uuid,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_replacement_payment_checkout(uuid,text,numeric,text,text) TO service_role;

-- Re-assert Phase 4 confirmation using the final resolved composition.
CREATE OR REPLACE FUNCTION public.confirm_order_products(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; rid uuid; fid uuid; n integer; bad integer; pending integer;
BEGIN
 SELECT r.id INTO rid FROM public.riders r WHERE r.user_id=auth.uid() AND r.status='approved';
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.rider_id IS DISTINCT FROM rid THEN RAISE EXCEPTION 'order is not assigned to this rider'; END IF;
 IF o.cancellation_stage<>'none' OR EXISTS(SELECT 1 FROM public.cancellations WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'order cancellation is active'; END IF;
 IF o.purchase_funding_status='authorized' THEN SELECT id INTO fid FROM public.purchase_funding WHERE order_id=p_order_id AND rider_id=rid; IF fid IS NOT NULL THEN RETURN fid; END IF; END IF;
 IF o.payment_status IS DISTINCT FROM 'success' OR o.status NOT IN ('Rider assigned','Picked up','On the Way') OR o.purchase_funding_status NOT IN ('not_required','pending') THEN RAISE EXCEPTION 'order is not eligible for confirmation'; END IF;
 SELECT count(*) INTO n FROM public.order_items oi WHERE oi.order_id=p_order_id AND NOT EXISTS(SELECT 1 FROM public.product_availability_check pc WHERE pc.order_item_id=oi.id AND pc.order_id=p_order_id);
 IF n>0 THEN RAISE EXCEPTION 'every order item must be checked'; END IF;
 SELECT count(*) INTO bad FROM public.order_items WHERE order_id=p_order_id AND NOT final_removed AND COALESCE(final_resolution,'available') NOT IN ('available','replaced');
 SELECT count(*) INTO pending FROM public.order_replacements WHERE order_id=p_order_id AND status='pending';
 IF bad>0 OR pending>0 OR o.final_financial_status IN ('additional_payment_required','overpaid_pending_resolution') THEN RAISE EXCEPTION 'final order is not financially resolved'; END IF;
 INSERT INTO public.purchase_funding(order_id,rider_id,amount,status,authorized_at,created_by,updated_by)
 SELECT p_order_id,rid,SUM(CASE WHEN NOT oi.final_removed THEN COALESCE(oi.final_price,oi.price)*oi.qty ELSE 0 END),'authorized',now(),auth.uid(),auth.uid() FROM public.order_items oi WHERE oi.order_id=p_order_id ON CONFLICT(order_id) DO NOTHING RETURNING id INTO fid;
 IF fid IS NULL THEN SELECT id INTO fid FROM public.purchase_funding WHERE order_id=p_order_id; END IF;
 IF (SELECT amount FROM public.purchase_funding WHERE id=fid)<=0 THEN RAISE EXCEPTION 'purchase funding amount must be positive'; END IF;
 UPDATE public.orders SET product_availability_status='confirmed',purchase_funding_status='authorized',products_confirmed_at=COALESCE(products_confirmed_at,now()) WHERE id=p_order_id;
 RETURN fid;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_order_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_products(uuid) TO authenticated;
