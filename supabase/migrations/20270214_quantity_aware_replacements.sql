-- Quantity-aware unavailable-item resolution. The original order_items.qty
-- remains the immutable purchased snapshot; final_quantity is the resolved
-- quantity used for totals, funding, and customer/rider presentation.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS final_quantity integer;

ALTER TABLE public.order_items
  DROP CONSTRAINT IF EXISTS order_items_final_quantity_check;
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_final_quantity_check
  CHECK (final_quantity IS NULL OR (final_quantity >= 0 AND final_quantity <= qty));

ALTER TABLE public.order_replacements
  ADD COLUMN IF NOT EXISTS replacement_quantity integer;

ALTER TABLE public.order_replacements
  DROP CONSTRAINT IF EXISTS order_replacements_replacement_quantity_check;
ALTER TABLE public.order_replacements
  ADD CONSTRAINT order_replacements_replacement_quantity_check
  CHECK (replacement_quantity IS NULL OR replacement_quantity >= 0);

-- Preserve already-resolved historical rows without overwriting a valid value.
-- Legacy replacements used the complete original quantity, so that is the
-- only quantity that can be safely inferred for those rows.
UPDATE public.order_items
   SET final_quantity = CASE
     WHEN final_resolution = 'removed' OR final_removed = true THEN 0
     WHEN final_resolution IN ('available','replaced') THEN qty
     ELSE final_quantity
   END
 WHERE final_quantity IS NULL
   AND (final_resolution IN ('available','replaced','removed') OR final_removed = true);

UPDATE public.order_replacements r
   SET replacement_quantity = CASE
     WHEN r.customer_decision = 'removed' THEN 0
     ELSE oi.qty
   END
  FROM public.order_items oi
 WHERE oi.id = r.order_item_id
   AND r.replacement_quantity IS NULL
   AND r.customer_decision IN ('accepted','removed');

CREATE OR REPLACE FUNCTION public.recalculate_final_order_financials(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_product numeric;
  v_original_paid numeric;
  v_total_paid numeric;
  v_final numeric;
  v_due numeric;
  v_over numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  SELECT COALESCE(SUM(CASE WHEN NOT oi.final_removed
                           THEN COALESCE(oi.final_price,oi.price)
                                * COALESCE(oi.final_quantity,oi.qty)
                           ELSE 0 END),0)
    INTO v_product
    FROM public.order_items oi WHERE oi.order_id=p_order_id;
  SELECT COALESCE(SUM(amount) FILTER (WHERE payment_type='product'),0),
         COALESCE(SUM(amount),0)
    INTO v_original_paid,v_total_paid
    FROM public.payments
   WHERE order_id=p_order_id
     AND payment_type IN ('product','replacement')
     AND status='success';
  SELECT v_product+COALESCE(v_order.packaging_amount,0)+COALESCE(v_order.fee,0),
         GREATEST(v_product+COALESCE(v_order.packaging_amount,0)+COALESCE(v_order.fee,0)-v_total_paid,0),
         GREATEST(v_total_paid-(v_product+COALESCE(v_order.packaging_amount,0)+COALESCE(v_order.fee,0)),0)
    INTO v_final,v_due,v_over;
  UPDATE public.orders
     SET original_paid_amount=v_original_paid,
         final_product_total=v_product,
         final_order_total=v_final,
         additional_amount_due=v_due,
         overpaid_amount=v_over,
         final_financial_status=CASE
           WHEN v_due>0 THEN 'additional_payment_required'
           WHEN v_over>0 THEN 'overpaid_pending_resolution'
           ELSE 'settled'
         END
   WHERE id=p_order_id;
END; $$;
REVOKE ALL ON FUNCTION public.recalculate_final_order_financials(uuid) FROM PUBLIC,anon,authenticated;

-- Replace the old two-argument entry point so callers must provide an explicit
-- quantity. A replacement may cover only part of the unavailable original line.
DROP FUNCTION IF EXISTS public.customer_replace_unavailable_item(uuid,text);
CREATE OR REPLACE FUNCTION public.customer_replace_unavailable_item(
  p_order_item_id uuid,
  p_replacement_product_id text,
  p_replacement_quantity integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  oi public.order_items%ROWTYPE;
  o public.orders%ROWTYPE;
  p public.products%ROWTYPE;
  r public.order_replacements%ROWTYPE;
  diff numeric;
  due numeric;
  replacement_product_id bigint;
  replacement_exists boolean := false;
BEGIN
  SELECT * INTO oi FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order item not found'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=oi.order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'order item is not owned by caller'; END IF;
  IF o.cancellation_stage <> 'none' OR o.purchase_funding_status NOT IN ('not_required','pending') THEN
    RAISE EXCEPTION 'order is not accepting replacement decisions';
  END IF;
  IF oi.availability_state <> 'unavailable' THEN RAISE EXCEPTION 'item is not unavailable'; END IF;
  IF p_replacement_quantity IS NULL OR p_replacement_quantity < 1 OR p_replacement_quantity > oi.qty THEN
    RAISE EXCEPTION 'replacement quantity must be between 1 and the unavailable quantity';
  END IF;
  IF p_replacement_product_id IS NULL OR p_replacement_product_id !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'replacement product id must be a positive integer';
  END IF;
  replacement_product_id := p_replacement_product_id::bigint;
  SELECT * INTO p FROM public.products WHERE id=replacement_product_id AND active=true FOR SHARE;
  IF NOT FOUND OR p.vendor_id IS DISTINCT FROM oi.vendor_id THEN
    RAISE EXCEPTION 'replacement must be an active product from the same vendor';
  END IF;
  -- Compare the complete original line with the resolved replacement portion;
  -- any unselected original units are removed from the final composition.
  diff := (p.price * p_replacement_quantity) - (oi.price * oi.qty);
  SELECT * INTO r FROM public.order_replacements WHERE order_item_id=oi.id FOR UPDATE;
  replacement_exists := FOUND;
  IF replacement_exists AND r.status='paid' THEN RAISE EXCEPTION 'replacement already resolved'; END IF;

  -- A not-yet-paid replacement obligation is stale as soon as the customer
  -- changes the selected product or quantity. Successful payments are never
  -- changed here; their amount remains part of the authoritative ledger.
  UPDATE public.payments
     SET status='failed', updated_at=now()
   WHERE order_id=o.id AND payment_type='replacement'
     AND replacement_obligation_id=o.id AND status='pending';

  IF replacement_exists THEN
    UPDATE public.order_replacements
       SET replacement_product_id=p.id,
           replacement_quantity=p_replacement_quantity,
           price_difference=diff,
           customer_decision='accepted',
           status='pending',
           updated_at=now()
     WHERE id=r.id;
  ELSE
    INSERT INTO public.order_replacements(
      order_id,order_item_id,original_product_id,replacement_product_id,
      replacement_quantity,price_difference,customer_decision,status
    ) VALUES (
      o.id,oi.id,oi.product_id,p.id,p_replacement_quantity,diff,'accepted','pending'
    );
  END IF;

  UPDATE public.order_items
     SET final_product_id=p.id,
         final_price=p.price,
         final_quantity=p_replacement_quantity,
         final_removed=false,
         final_resolution='replaced',
         final_resolved_at=CASE WHEN diff<=0 THEN now() ELSE NULL END
   WHERE id=oi.id;
  PERFORM public.recalculate_final_order_financials(o.id);
  SELECT additional_amount_due INTO due FROM public.orders WHERE id=o.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
     WHERE related_order_id=o.id
       AND user_id=(SELECT rider_row.user_id FROM public.riders rider_row WHERE rider_row.id=o.rider_id)
       AND title='Customer decision received'
  ) THEN
    INSERT INTO public.notifications(user_id,title,message,type,related_order_id)
    SELECT rider_row.user_id,'Customer decision received',
      CASE WHEN diff>0 THEN 'A replacement was selected. The order is waiting for additional customer payment.'
           ELSE 'A replacement was selected. The order is ready for final confirmation.' END,
      'rider',o.id
      FROM public.riders rider_row WHERE rider_row.id=o.rider_id;
  END IF;
  IF diff<=0 THEN
    UPDATE public.order_replacements SET status='paid',updated_at=now() WHERE order_item_id=oi.id;
    UPDATE public.order_items SET availability_state='replaced' WHERE id=oi.id;
  END IF;
  RETURN jsonb_build_object(
    'order_id',o.id,'order_item_id',oi.id,'replacement_quantity',p_replacement_quantity,
    'unreplaced_quantity',oi.qty-p_replacement_quantity,'price_difference',diff,
    'additional_amount_due',due,'requires_payment',diff>0
  );
END; $$;
REVOKE ALL ON FUNCTION public.customer_replace_unavailable_item(uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_replace_unavailable_item(uuid,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_remove_unavailable_item(p_order_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE oi public.order_items%ROWTYPE; o public.orders%ROWTYPE; r public.order_replacements%ROWTYPE; due numeric; replacement_exists boolean := false;
BEGIN
 SELECT * INTO oi FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order item not found'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=oi.order_id FOR UPDATE;
 IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'order item is not owned by caller'; END IF;
 IF o.cancellation_stage <> 'none' OR o.purchase_funding_status NOT IN ('not_required','pending') OR oi.availability_state <> 'unavailable' THEN
   RAISE EXCEPTION 'item is not eligible for removal';
 END IF;
 SELECT * INTO r FROM public.order_replacements WHERE order_item_id=oi.id FOR UPDATE;
 replacement_exists := FOUND;
 IF replacement_exists AND r.status='paid' THEN RAISE EXCEPTION 'item already resolved'; END IF;
 UPDATE public.payments SET status='failed',updated_at=now()
  WHERE order_id=o.id AND payment_type='replacement' AND replacement_obligation_id=o.id AND status='pending';
 IF replacement_exists THEN
   UPDATE public.order_replacements SET customer_decision='removed',replacement_quantity=0,status='paid',price_difference=-(oi.price*oi.qty),updated_at=now() WHERE id=r.id;
 ELSE
   INSERT INTO public.order_replacements(order_id,order_item_id,original_product_id,replacement_product_id,replacement_quantity,price_difference,customer_decision,status)
   VALUES(o.id,oi.id,oi.product_id,NULL,0,-(oi.price*oi.qty),'removed','paid');
 END IF;
 UPDATE public.order_items SET final_product_id=NULL,final_price=0,final_quantity=0,final_removed=true,final_resolution='removed',final_resolved_at=now(),availability_state='available' WHERE id=oi.id;
 PERFORM public.recalculate_final_order_financials(o.id); SELECT additional_amount_due INTO due FROM public.orders WHERE id=o.id;
 IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE related_order_id=o.id AND user_id=(SELECT rider_row.user_id FROM public.riders rider_row WHERE rider_row.id=o.rider_id) AND title='Customer decision received') THEN
   INSERT INTO public.notifications(user_id,title,message,type,related_order_id) SELECT rider_row.user_id,'Customer decision received','The unavailable item was removed. The order is ready for final confirmation.','rider',o.id FROM public.riders rider_row WHERE rider_row.id=o.rider_id;
 END IF;
 RETURN jsonb_build_object('order_id',o.id,'order_item_id',oi.id,'additional_amount_due',due);
END; $$;
REVOKE ALL ON FUNCTION public.customer_remove_unavailable_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_remove_unavailable_item(uuid) TO authenticated;

-- Item-level refund obligations use the exact original line value minus the
-- resolved replacement portion. This includes any original units left out.
CREATE OR REPLACE FUNCTION public.ensure_order_item_refund_obligations(p_order_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid public.payments%ROWTYPE; item public.order_items%ROWTYPE; refund_amount numeric; existing uuid; total_adjustment numeric:=0;
BEGIN
 SELECT p.* INTO paid FROM public.payments p WHERE p.order_id=p_order_id AND p.payment_type='product' AND p.status='success' ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;
 FOR item IN SELECT oi.* FROM public.order_items oi WHERE oi.order_id=p_order_id AND ((oi.final_removed=true AND oi.final_resolution='removed') OR (oi.final_resolution='replaced' AND oi.final_price IS NOT NULL AND oi.final_quantity IS NOT NULL AND (oi.final_price*oi.final_quantity) < (oi.price*oi.qty))) ORDER BY oi.id LOOP
   IF paid.id IS NULL THEN RAISE EXCEPTION 'successful product payment is required for item refund obligations'; END IF;
   refund_amount := (item.price*item.qty) - CASE WHEN item.final_removed=true OR item.final_resolution='removed' THEN 0 ELSE item.final_price*item.final_quantity END;
   IF refund_amount<=0 THEN CONTINUE; END IF;
   SELECT r.id INTO existing FROM public.refunds r WHERE r.order_id=p_order_id AND r.source_order_item_id=item.id AND r.adjustment_kind=CASE WHEN item.final_resolution='removed' THEN 'removed_item' ELSE 'cheaper_replacement' END AND r.refund_kind='replacement_adjustment' AND r.status NOT IN ('failed','rejected') LIMIT 1;
   IF existing IS NULL THEN
     INSERT INTO public.refunds(payment_id,order_id,amount,status,reason,refund_kind,source_order_item_id,adjustment_kind)
     VALUES(paid.id,p_order_id,refund_amount,'approved',CASE WHEN item.final_resolution='removed' THEN 'Removed unavailable item:'||item.id::text ELSE 'Replacement price adjustment:'||item.id::text END,'replacement_adjustment',item.id,CASE WHEN item.final_resolution='removed' THEN 'removed_item' ELSE 'cheaper_replacement' END) ON CONFLICT DO NOTHING;
   END IF;
 END LOOP;
 SELECT COALESCE(SUM(r.amount),0) INTO total_adjustment FROM public.refunds r WHERE r.order_id=p_order_id AND r.refund_kind='replacement_adjustment' AND r.status NOT IN ('failed','rejected');
 RETURN total_adjustment;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_order_item_refund_obligations(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_order_item_refund_obligations(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.create_replacement_partial_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid public.payments%ROWTYPE; refund_amount numeric; existing uuid;
BEGIN
 IF NEW.final_resolution='replaced' AND NEW.final_price IS NOT NULL AND NEW.final_quantity IS NOT NULL THEN
   refund_amount := (OLD.price*OLD.qty) - (NEW.final_price*NEW.final_quantity);
   SELECT p.* INTO paid FROM public.payments p WHERE p.order_id=NEW.order_id AND p.payment_type='product' AND p.status='success' ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;
   IF FOUND AND refund_amount>0 THEN
     SELECT r.id INTO existing FROM public.refunds r WHERE r.order_id=NEW.order_id AND r.source_order_item_id=NEW.id AND r.adjustment_kind='cheaper_replacement' AND r.refund_kind='replacement_adjustment' AND r.status NOT IN ('rejected','failed') LIMIT 1;
     IF existing IS NULL THEN
       INSERT INTO public.refunds(payment_id,order_id,amount,status,reason,refund_kind,source_order_item_id,adjustment_kind)
       VALUES(paid.id,NEW.order_id,refund_amount,'approved','Replacement partial refund:'||NEW.id::text,'replacement_adjustment',NEW.id,'cheaper_replacement') ON CONFLICT DO NOTHING;
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_create_replacement_partial_refund ON public.order_items;
CREATE TRIGGER trg_create_replacement_partial_refund
AFTER UPDATE OF final_product_id,final_price,final_quantity,final_resolution ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.create_replacement_partial_refund();

-- Final rider purchase funding must use the resolved quantity and must never
-- create a packaging-only funding row.
CREATE OR REPLACE FUNCTION public.confirm_order_products(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; rid uuid; fid uuid; n integer; item_count integer; bad integer; pending integer; all_items_removed boolean; final_food_amount numeric; packaging_amount numeric; restaurant_purchase_amount numeric; adjustment_amount numeric;
BEGIN
 SELECT r.id INTO rid FROM public.riders r WHERE r.user_id=auth.uid() AND r.status='approved';
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.rider_id IS DISTINCT FROM rid THEN RAISE EXCEPTION 'order is not assigned to this rider'; END IF;
 IF o.cancellation_stage<>'none' OR EXISTS(SELECT 1 FROM public.cancellations WHERE order_id=p_order_id) THEN
   IF o.status='Cancelled' AND EXISTS(SELECT 1 FROM public.cancellations c WHERE c.order_id=p_order_id AND c.reason='All items unavailable') THEN RETURN NULL; END IF;
   RAISE EXCEPTION 'order cancellation is active';
 END IF;
 IF o.purchase_funding_status='authorized' THEN SELECT id INTO fid FROM public.purchase_funding WHERE order_id=p_order_id AND rider_id=rid; IF fid IS NOT NULL THEN RETURN fid; END IF; END IF;
 IF o.payment_status IS DISTINCT FROM 'success' OR o.status NOT IN ('Rider assigned','Picked up','On the Way') OR o.purchase_funding_status NOT IN ('not_required','pending') THEN RAISE EXCEPTION 'order is not eligible for confirmation'; END IF;
 SELECT count(*) INTO item_count FROM public.order_items WHERE order_id=p_order_id;
 SELECT count(*) INTO n FROM public.order_items oi WHERE oi.order_id=p_order_id AND NOT EXISTS(SELECT 1 FROM public.product_availability_check pc WHERE pc.order_item_id=oi.id AND pc.order_id=p_order_id);
 IF n>0 THEN RAISE EXCEPTION 'every order item must be checked'; END IF;
 SELECT item_count>0 AND NOT EXISTS(SELECT 1 FROM public.order_items oi WHERE oi.order_id=p_order_id AND (oi.final_removed IS DISTINCT FROM true OR oi.final_resolution IS DISTINCT FROM 'removed')) INTO all_items_removed;
 IF all_items_removed THEN PERFORM public.resolve_all_items_unavailable(p_order_id); RETURN NULL; END IF;
 SELECT count(*) INTO bad FROM public.order_items WHERE order_id=p_order_id AND NOT final_removed AND COALESCE(final_resolution,'available') NOT IN ('available','replaced');
 SELECT count(*) INTO pending FROM public.order_replacements WHERE order_id=p_order_id AND status='pending';
 IF bad>0 OR pending>0 OR o.final_financial_status='additional_payment_required' THEN RAISE EXCEPTION 'final order is not financially resolved'; END IF;
 adjustment_amount:=public.ensure_order_item_refund_obligations(p_order_id);
 IF o.final_financial_status='overpaid_pending_resolution' AND adjustment_amount+0.01<COALESCE(o.overpaid_amount,0) THEN RAISE EXCEPTION 'final overpayment has no complete item refund obligation'; END IF;
 SELECT COALESCE(SUM(CASE WHEN NOT oi.final_removed THEN COALESCE(oi.final_price,oi.price)*COALESCE(oi.final_quantity,oi.qty) ELSE 0 END),0) INTO final_food_amount FROM public.order_items oi WHERE oi.order_id=p_order_id;
 IF final_food_amount<=0 THEN RAISE EXCEPTION 'all items must be resolved as removed before cancelling'; END IF;
 packaging_amount:=GREATEST(COALESCE(o.packaging_amount,0),0); restaurant_purchase_amount:=final_food_amount+packaging_amount;
 INSERT INTO public.purchase_funding(order_id,rider_id,amount,food_amount,packaging_amount,restaurant_purchase_amount,status,authorized_at,created_by,updated_by) VALUES(p_order_id,rid,restaurant_purchase_amount,final_food_amount,packaging_amount,restaurant_purchase_amount,'authorized',now(),auth.uid(),auth.uid()) ON CONFLICT(order_id) DO NOTHING RETURNING id INTO fid;
 IF fid IS NULL THEN SELECT id INTO fid FROM public.purchase_funding WHERE order_id=p_order_id; END IF;
 UPDATE public.orders SET product_availability_status='confirmed',purchase_funding_status='authorized',products_confirmed_at=COALESCE(products_confirmed_at,now()) WHERE id=p_order_id;
 RETURN fid;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_order_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_products(uuid) TO authenticated;

-- A stale replacement checkout cannot be accepted after its pending row was
-- superseded. Successful payments remain immutable and are still accepted only
-- when their amount matches the current authoritative obligation.
CREATE OR REPLACE FUNCTION public.handle_replacement_payment_success(p_reference text,p_transaction_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments%ROWTYPE; o public.orders%ROWTYPE;
BEGIN
 SELECT * INTO p FROM public.payments WHERE reference=p_reference AND payment_type='replacement' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'replacement payment not found'; END IF;
 IF p.status='success' THEN RETURN; END IF;
 IF p.status<>'pending' THEN RAISE EXCEPTION 'replacement payment is no longer active'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p.order_id FOR UPDATE;
 PERFORM public.recalculate_final_order_financials(o.id);
 SELECT * INTO o FROM public.orders WHERE id=o.id FOR UPDATE;
 IF p.amount IS DISTINCT FROM o.additional_amount_due THEN RAISE EXCEPTION 'replacement payment amount no longer matches obligation'; END IF;
 PERFORM set_config('app.order_server_update','on',true);
 UPDATE public.payments SET status='success',transaction_id=p_transaction_id::bigint,updated_at=now() WHERE id=p.id;
 UPDATE public.order_replacements SET status='paid',updated_at=now() WHERE order_id=o.id AND customer_decision='accepted' AND status='pending';
 UPDATE public.order_items SET availability_state='replaced' WHERE order_id=o.id AND final_resolution='replaced';
 PERFORM public.recalculate_final_order_financials(o.id);
 PERFORM set_config('app.order_server_update','off',true);
END; $$;
REVOKE ALL ON FUNCTION public.handle_replacement_payment_success(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_replacement_payment_success(text,text) TO service_role;
