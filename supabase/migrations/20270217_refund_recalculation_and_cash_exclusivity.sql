-- Forward-only financial-integrity hardening for replacement adjustments and
-- order-level reimbursement.  Existing applied migrations are untouched.

-- One authoritative cash formula for product/replacement customer money.
-- Only successfully completed item adjustments reduce the amount still
-- refundable.  Failed, rejected, and in-flight rows do not reduce it.
CREATE OR REPLACE FUNCTION public.remaining_order_refundable_cash(p_order_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT GREATEST(
    COALESCE((
      SELECT SUM(p.amount)
      FROM public.payments p
      WHERE p.order_id = p_order_id
        AND p.status = 'success'
        AND p.payment_type IN ('product','replacement')
    ), 0)
    - COALESCE((
      SELECT SUM(r.amount)
      FROM public.refunds r
      WHERE r.order_id = p_order_id
        AND r.refund_kind = 'replacement_adjustment'
        AND r.status = 'processed'
    ), 0),
    0
  )
$$;
REVOKE ALL ON FUNCTION public.remaining_order_refundable_cash(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remaining_order_refundable_cash(uuid) TO service_role;

-- Keep the existing payment-id helper aligned with the order-level formula.
CREATE OR REPLACE FUNCTION public.remaining_product_refund_amount(p_payment_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.remaining_order_refundable_cash(p.order_id)
  FROM public.payments p
  WHERE p.id = p_payment_id
$$;
REVOKE ALL ON FUNCTION public.remaining_product_refund_amount(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remaining_product_refund_amount(uuid) TO service_role;

-- Reconcile one replacement adjustment to the current authoritative item
-- resolution.  History is retained: a superseded, unprocessed row is marked
-- rejected rather than deleted.  A provider-in-flight or processed row is
-- immutable; callers must not silently change an amount already submitted or
-- paid out.
CREATE OR REPLACE FUNCTION public.sync_replacement_adjustment_refund(
  p_order_id uuid,
  p_order_item_id uuid,
  p_amount numeric
)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_refund public.refunds%ROWTYPE;
  v_amount numeric := GREATEST(COALESCE(p_amount,0),0);
  v_found boolean := false;
BEGIN
  SELECT p.* INTO v_payment
  FROM public.payments p
  WHERE p.order_id=p_order_id AND p.payment_type='product' AND p.status='success'
  ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'successful product payment is required for item refund adjustments';
  END IF;

  FOR v_refund IN
    SELECT r.*
    FROM public.refunds r
    WHERE r.order_id=p_order_id
      AND r.source_order_item_id=p_order_item_id
      AND r.adjustment_kind='cheaper_replacement'
      AND r.refund_kind='replacement_adjustment'
      AND r.status NOT IN ('failed','rejected')
    ORDER BY r.created_at DESC, r.id DESC
    FOR UPDATE
  LOOP
    v_found := true;
    IF v_refund.status IN ('processed','processing') THEN
      IF v_amount IS DISTINCT FROM v_refund.amount THEN
        RAISE EXCEPTION 'replacement refund is already % and cannot be recalculated', v_refund.status;
      END IF;
      RETURN v_refund.amount;
    END IF;

    IF v_amount <= 0 THEN
      UPDATE public.refunds
         SET status='rejected',
             reason='Replacement adjustment superseded; no refund remains due',
             updated_at=now()
       WHERE id=v_refund.id;
    ELSE
      UPDATE public.refunds
         SET amount=v_amount,
             reason='Replacement price adjustment:'||p_order_item_id::text,
             updated_at=now()
       WHERE id=v_refund.id;
    END IF;
  END LOOP;

  IF v_amount > 0 AND NOT v_found THEN
    INSERT INTO public.refunds(
      payment_id,order_id,amount,status,reason,refund_kind,
      source_order_item_id,adjustment_kind
    ) VALUES (
      v_payment.id,p_order_id,v_amount,'approved',
      'Replacement price adjustment:'||p_order_item_id::text,
      'replacement_adjustment',p_order_item_id,'cheaper_replacement'
    );
  END IF;
  RETURN v_amount;
END; $$;
REVOKE ALL ON FUNCTION public.sync_replacement_adjustment_refund(uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_replacement_adjustment_refund(uuid,uuid,numeric) TO service_role;

-- The trigger is the authoritative recalculation hook for every replacement
-- decision, including a changed product, quantity, cheaper/same-price choice,
-- or more-expensive choice.
CREATE OR REPLACE FUNCTION public.create_replacement_partial_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_amount numeric;
BEGIN
  IF NEW.final_resolution='replaced'
     AND NEW.final_price IS NOT NULL
     AND NEW.final_quantity IS NOT NULL THEN
    v_amount := (OLD.price*OLD.qty) - (NEW.final_price*NEW.final_quantity);
    PERFORM public.sync_replacement_adjustment_refund(NEW.order_id,NEW.id,v_amount);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_create_replacement_partial_refund ON public.order_items;
CREATE TRIGGER trg_create_replacement_partial_refund
AFTER UPDATE OF final_product_id,final_price,final_quantity,final_resolution ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.create_replacement_partial_refund();

-- Allow a customer to revise a not-yet-paid/not-yet-processed replacement.
-- A successful replacement payment, processing refund, or processed refund is
-- immutable and blocks the change instead of risking a double settlement.
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
  v_refund public.refunds%ROWTYPE;
  v_replacement_exists boolean := false;
  diff numeric;
  due numeric;
  replacement_product_id bigint;
BEGIN
  SELECT * INTO oi FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order item not found'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=oi.order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'order item is not owned by caller'; END IF;
  IF o.cancellation_stage <> 'none' OR o.purchase_funding_status NOT IN ('not_required','pending') THEN
    RAISE EXCEPTION 'order is not accepting replacement decisions';
  END IF;
  -- A prior cheaper/same-price choice is still revisable while its item
  -- adjustment has not been processed.  The previous migration marked that
  -- row as `replaced`, so both states are valid decision-edit states here.
  IF oi.availability_state NOT IN ('unavailable','replaced') THEN RAISE EXCEPTION 'item is not unavailable'; END IF;
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

  SELECT * INTO r FROM public.order_replacements WHERE order_item_id=oi.id FOR UPDATE;
  IF FOUND THEN
    v_replacement_exists := true;
    IF EXISTS (
      SELECT 1 FROM public.payments
      WHERE order_id=o.id AND payment_type='replacement'
        AND replacement_obligation_id=o.id AND status='success'
    ) THEN
      RAISE EXCEPTION 'replacement payment is already completed';
    END IF;
    SELECT * INTO v_refund
    FROM public.refunds
    WHERE order_id=o.id AND source_order_item_id=oi.id
      AND adjustment_kind='cheaper_replacement'
      AND refund_kind='replacement_adjustment'
      AND status NOT IN ('failed','rejected')
    ORDER BY created_at DESC, id DESC LIMIT 1
    FOR UPDATE;
    IF FOUND AND v_refund.status IN ('processed','processing') THEN
      RAISE EXCEPTION 'replacement refund is already %', v_refund.status;
    END IF;
  END IF;

  diff := (p.price * p_replacement_quantity) - (oi.price * oi.qty);
  UPDATE public.payments
     SET status='failed',updated_at=now()
   WHERE order_id=o.id AND payment_type='replacement'
     AND replacement_obligation_id=o.id AND status='pending';

  IF v_replacement_exists THEN
    UPDATE public.order_replacements
       SET replacement_product_id=p.id,replacement_quantity=p_replacement_quantity,
           price_difference=diff,customer_decision='accepted',status='pending',updated_at=now()
     WHERE id=r.id;
  ELSE
    INSERT INTO public.order_replacements(
      order_id,order_item_id,original_product_id,replacement_product_id,
      replacement_quantity,price_difference,customer_decision,status
    ) VALUES(o.id,oi.id,oi.product_id,p.id,p_replacement_quantity,diff,'accepted','pending')
    RETURNING * INTO r;
  END IF;

  UPDATE public.order_items
     SET final_product_id=p.id,final_price=p.price,final_quantity=p_replacement_quantity,
         final_removed=false,final_resolution='replaced',
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

-- Keep all-items-unavailable reimbursement on the same formula and prevent it
-- from starting while an item adjustment is already approved or processing.
CREATE OR REPLACE FUNCTION public.resolve_all_items_unavailable(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  existing public.cancellations%ROWTYPE;
  funding public.purchase_funding%ROWTYPE;
  latest_transfer public.transfers%ROWTYPE;
  rider_id uuid;
  reimbursement numeric;
  stage text;
  cancellation_id uuid;
BEGIN
  SELECT r.id INTO rider_id FROM public.riders r
   WHERE r.user_id=auth.uid() AND r.status='approved';
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.rider_id IS DISTINCT FROM rider_id THEN
    RAISE EXCEPTION 'order is not assigned to this rider';
  END IF;
  SELECT * INTO existing FROM public.cancellations WHERE order_id=p_order_id FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('cancelled',existing.stage IN ('eligible_for_reimbursement','reimbursement_pending','reimbursement_processing','reimbursed','resolved'),'already_exists',true,'cancellation_id',existing.id,'stage',existing.stage,'reimbursement_amount',existing.reimbursement_amount);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id=p_order_id)
     OR EXISTS (SELECT 1 FROM public.order_items WHERE order_id=p_order_id AND (final_removed IS DISTINCT FROM true OR final_resolution IS DISTINCT FROM 'removed')) THEN
    RAISE EXCEPTION 'all original food items must be resolved as removed';
  END IF;

  SELECT * INTO funding FROM public.purchase_funding WHERE order_id=p_order_id FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO latest_transfer FROM public.transfers
    WHERE purchase_funding_id=funding.id
    ORDER BY attempt_no DESC NULLS LAST,created_at DESC LIMIT 1 FOR UPDATE;
    IF latest_transfer.status IN ('processing','success') OR funding.status IN ('processing','transferred') THEN
      stage:='admin_resolution_required';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.refunds
             WHERE order_id=p_order_id AND refund_kind='replacement_adjustment'
               AND status IN ('approved','processing','requested','pending')) THEN
    stage:='admin_resolution_required';
  END IF;
  stage:=COALESCE(stage,'eligible_for_reimbursement');
  reimbursement:=public.remaining_order_refundable_cash(p_order_id);
  IF reimbursement<=0 AND stage='eligible_for_reimbursement' THEN stage:='resolved'; END IF;

  INSERT INTO public.cancellations(order_id,initiated_by,reason,stage,reimbursement_amount)
  VALUES(p_order_id,auth.uid(),'All items unavailable',stage,NULLIF(reimbursement,0))
  RETURNING id INTO cancellation_id;
  PERFORM set_config('request.jwt.claim.sub',o.user_id::text,true);
  PERFORM set_config('app.all_items_unavailable_cancel','on',true);
  UPDATE public.orders SET status='Cancelled',product_availability_status='confirmed',purchase_funding_status='not_required',products_confirmed_at=COALESCE(products_confirmed_at,now()),cancellation_stage=stage,cancellation_requested_at=now(),final_financial_status='cancelled' WHERE id=p_order_id;
  PERFORM set_config('app.all_items_unavailable_cancel','off',true);
  RETURN jsonb_build_object('cancelled',true,'already_exists',false,'cancellation_id',cancellation_id,'stage',stage,'reimbursement_amount',NULLIF(reimbursement,0));
END; $$;
REVOKE ALL ON FUNCTION public.resolve_all_items_unavailable(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_all_items_unavailable(uuid) TO authenticated;

-- The existing status trigger intentionally disallows a rider from directly
-- cancelling a delivery.  Permit only this narrowly identified, trusted
-- all-items-removed transition from the resolver above; all normal rider,
-- customer, vendor, and admin transition rules remain unchanged.
CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_active_count integer;
BEGIN
  IF NOT public.is_admin()
     AND NEW.delivery_method IS DISTINCT FROM OLD.delivery_method THEN
    IF OLD.delivery_method <> 'both' OR NEW.delivery_method NOT IN ('rider','vendor_self') THEN
      RAISE EXCEPTION 'delivery_method can only be changed from ''both'' (vendor choice)';
    END IF;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF current_setting('app.all_items_unavailable_cancel',true)='on'
     AND OLD.request_type='restaurant'
     AND NEW.status='Cancelled'
     AND OLD.status IN ('Rider assigned','Picked up','On the Way')
     AND NEW.rider_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.cancellations c
                 WHERE c.order_id=OLD.id
                   AND c.reason='All items unavailable')
     AND NOT EXISTS (
       SELECT 1 FROM public.order_items
       WHERE order_id=OLD.id
         AND (final_removed IS DISTINCT FROM true OR final_resolution IS DISTINCT FROM 'removed')
     ) THEN
    RETURN NEW;
  END IF;
  IF OLD.user_id=auth.uid() THEN
    IF (OLD.status='Delivered' AND NEW.status='Rated')
       OR (OLD.status IN ('Order confirmed','Preparing') AND NEW.status='Cancelled') THEN RETURN NEW; END IF;
  END IF;
  IF NEW.rider_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.riders WHERE id=NEW.rider_id AND user_id=auth.uid()) THEN
    IF OLD.rider_id IS NULL AND OLD.status IN ('Order confirmed','Ready for pickup') AND OLD.delivery_method='rider'
       AND ((OLD.request_type='restaurant' AND OLD.payment_status='success') OR (OLD.request_type='vendor_request' AND OLD.vendor_delivery_requested=true AND OLD.delivery_payment_status='success'))
       AND NEW.status='Rider assigned' THEN
      PERFORM 1 FROM public.riders WHERE id=NEW.rider_id FOR UPDATE;
      SELECT count(*) INTO v_active_count FROM public.orders WHERE rider_id=NEW.rider_id AND status IN ('Rider assigned','Picked up','On the Way');
      IF v_active_count>=2 THEN RAISE EXCEPTION 'Rider already has % active deliveries (maximum 2)',v_active_count; END IF;
      RETURN NEW;
    END IF;
    IF (OLD.status='Rider assigned' AND NEW.status='Picked up')
       OR (OLD.status='Picked up' AND NEW.status='On the Way')
       OR (OLD.status='On the Way' AND NEW.status='Delivered') THEN RETURN NEW; END IF;
  END IF;
  IF public.order_has_vendor_item(OLD.id) THEN
    IF (OLD.status='Order confirmed' AND NEW.status IN ('Preparing','Cancelled'))
       OR (OLD.status='Preparing' AND NEW.status='Ready for pickup')
       OR (OLD.status='Preparing' AND NEW.status='Delivered' AND NEW.delivery_method='vendor_self') THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Illegal order status transition % -> % for this role',OLD.status,NEW.status;
END; $$;

-- Normal customer cancellation uses the same remaining-cash helper.
CREATE OR REPLACE FUNCTION public.request_customer_cancellation(p_order_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; c public.cancellations%ROWTYPE; f public.purchase_funding%ROWTYPE; t public.transfers%ROWTYPE; amount numeric; stage text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  IF o.status IN ('Delivered','Rated','Cancelled') THEN RAISE EXCEPTION 'order is not cancellable'; END IF;
  SELECT * INTO c FROM public.cancellations WHERE order_id=o.id FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('cancellation_id',c.id,'stage',c.stage,'reimbursement_amount',c.reimbursement_amount,'already_exists',true); END IF;
  SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
  SELECT * INTO t FROM public.transfers WHERE purchase_funding_id=f.id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND t.status IN ('processing','success') THEN stage:='admin_resolution_required'; ELSE stage:='eligible_for_reimbursement'; END IF;
  IF EXISTS (SELECT 1 FROM public.refunds WHERE order_id=o.id AND refund_kind='replacement_adjustment' AND status IN ('approved','processing','requested','pending')) THEN stage:='admin_resolution_required'; END IF;
  amount:=public.remaining_order_refundable_cash(o.id);
  IF amount<=0 AND stage='eligible_for_reimbursement' THEN stage:='resolved'; END IF;
  INSERT INTO public.cancellations(order_id,initiated_by,reason,stage,reimbursement_amount)
  VALUES(o.id,auth.uid(),COALESCE(NULLIF(trim(p_reason),''),'Customer cancellation'),stage,NULLIF(amount,0)) RETURNING * INTO c;
  PERFORM set_config('request.jwt.claim.sub',o.user_id::text,true);
  UPDATE public.orders SET status='Cancelled',cancellation_stage=stage,cancellation_requested_at=now(),final_financial_status='cancelled' WHERE id=o.id;
  RETURN jsonb_build_object('cancellation_id',c.id,'stage',c.stage,'reimbursement_amount',c.reimbursement_amount,'already_exists',false);
END; $$;
GRANT EXECUTE ON FUNCTION public.request_customer_cancellation(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_customer_cancellation(uuid,text) FROM anon,PUBLIC;

-- Lock order before refund execution. This gives replacement changes,
-- cancellation, partial refund completion, and duplicate webhook attempts one
-- consistent order-level serialization point.
CREATE OR REPLACE FUNCTION public.claim_refund_for_execution(p_refund_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.refunds%ROWTYPE; p public.payments%ROWTYPE; v_order_id uuid;
BEGIN
  SELECT order_id INTO v_order_id FROM public.refunds WHERE id=p_refund_id;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Refund % not found',p_refund_id; END IF;
  PERFORM 1 FROM public.orders WHERE id=v_order_id FOR UPDATE;
  SELECT * INTO r FROM public.refunds WHERE id=p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund % not found',p_refund_id; END IF;
  SELECT * INTO p FROM public.payments WHERE id=r.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment for refund % not found',p_refund_id; END IF;
  IF r.status='processing' THEN RETURN json_build_object('refund_id',r.id,'status','processing','claim',false); END IF;
  IF r.status<>'approved' THEN RAISE EXCEPTION 'Refund % has status % — only approved refunds can be claimed',p_refund_id,r.status; END IF;
  PERFORM public.reserve_financial_resolution(r.order_id,'refund',r.payment_id,r.id,NULL);
  UPDATE public.refunds SET status='processing',updated_at=now() WHERE id=r.id;
  RETURN json_build_object('refund_id',r.id,'status','processing','claim',true,'previous_status','approved');
END; $$;
REVOKE ALL ON FUNCTION public.claim_refund_for_execution(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_refund_for_execution(uuid) TO service_role;

-- Apply provider outcomes under the same order lock. The financial accounting
-- remains the existing partial/full payment state machine.
CREATE OR REPLACE FUNCTION public.apply_refund_result(
  p_refund_id uuid,p_success boolean,p_gateway_refund_id text DEFAULT NULL,p_reason text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_refund public.refunds%ROWTYPE; v_payment public.payments%ROWTYPE; v_order public.orders%ROWTYPE; v_order_id uuid; v_processed numeric;
BEGIN
  SELECT order_id INTO v_order_id FROM public.refunds WHERE id=p_refund_id;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Refund % not found',p_refund_id; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=v_order_id FOR UPDATE;
  SELECT * INTO v_refund FROM public.refunds WHERE id=p_refund_id FOR UPDATE;
  IF v_refund.status IN ('processed','rejected') THEN RETURN json_build_object('refund_id',v_refund.id,'status',v_refund.status,'terminal',true); END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id=v_refund.payment_id FOR UPDATE;
  IF NOT p_success THEN
    UPDATE public.refunds SET status='failed',reason=COALESCE(p_reason,reason),updated_at=now() WHERE id=p_refund_id;
    RETURN json_build_object('refund_id',v_refund.id,'status','failed','payment_refunded',false);
  END IF;
  UPDATE public.refunds SET status='processed',gateway_refund_id=COALESCE(p_gateway_refund_id,gateway_refund_id),updated_at=now() WHERE id=p_refund_id;
  IF v_payment.payment_type='vendor_delivery' THEN
    PERFORM set_config('app.order_server_update','on',true);
    UPDATE public.payments SET status='refunded',updated_at=now() WHERE id=v_payment.id AND status='success';
    UPDATE public.orders SET delivery_payment_status='refunded' WHERE id=v_order.id AND delivery_payment_status='success';
    PERFORM set_config('app.order_server_update','off',true);
    RETURN json_build_object('refund_id',v_refund.id,'status','processed','payment_refunded',true,'order_delivery_payment_refunded',true);
  END IF;
  SELECT COALESCE(SUM(r.amount),0) INTO v_processed FROM public.refunds r WHERE r.payment_id=v_payment.id AND r.status='processed';
  PERFORM set_config('app.order_server_update','on',true);
  IF v_processed + 0.01 < v_payment.amount THEN
    UPDATE public.payments SET status='success',updated_at=now() WHERE id=v_payment.id;
    UPDATE public.orders SET payment_status='success' WHERE id=v_order.id AND payment_status='refunded';
    PERFORM set_config('app.order_server_update','off',true);
    RETURN json_build_object('refund_id',v_refund.id,'status','processed','payment_refunded',false,'partial_refund',true);
  END IF;
  UPDATE public.payments SET status='refunded',updated_at=now() WHERE id=v_payment.id AND status='success';
  UPDATE public.orders SET payment_status='refunded' WHERE id=v_order.id AND payment_status='success';
  PERFORM set_config('app.order_server_update','off',true);
  RETURN json_build_object('refund_id',v_refund.id,'status','processed','payment_refunded',true,'order_refunded',true);
END; $$;
REVOKE ALL ON FUNCTION public.apply_refund_result(uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_refund_result(uuid,boolean,text,text) TO service_role;
