-- Avoid PL/pgSQL row-variable/SQL-alias collision in replacement decisions.
-- The previous functions declared r as order_replacements%ROWTYPE and later
-- used r.user_id as a riders alias, which resolves to the row variable.

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
 IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=o.id AND user_id=(SELECT rider_row.user_id FROM public.riders rider_row WHERE rider_row.id=o.rider_id) AND title='Customer decision received') THEN
   INSERT INTO public.notifications(user_id,title,message,type,related_order_id) SELECT rider_row.user_id,'Customer decision received',CASE WHEN diff>0 THEN 'A replacement was selected. The order is waiting for additional customer payment.' ELSE 'A replacement was selected. The order is ready for final confirmation.' END,'rider',o.id FROM public.riders rider_row WHERE rider_row.id=o.rider_id;
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
 IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=o.id AND user_id=(SELECT rider_row.user_id FROM public.riders rider_row WHERE rider_row.id=o.rider_id) AND title='Customer decision received') THEN
   INSERT INTO public.notifications(user_id,title,message,type,related_order_id) SELECT rider_row.user_id,'Customer decision received','The unavailable item was removed. The order is ready for final confirmation.','rider',o.id FROM public.riders rider_row WHERE rider_row.id=o.rider_id;
 END IF;
 RETURN jsonb_build_object('order_id',o.id,'order_item_id',oi.id,'additional_amount_due',due);
END; $$;
