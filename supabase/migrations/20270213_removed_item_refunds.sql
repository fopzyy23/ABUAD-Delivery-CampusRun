-- Create item-level refund obligations only when rider confirmation proves the
-- order continues.  The all-items-removed path is handled by 20270212's full
-- cancellation/reimbursement flow and must not create these rows.

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS source_order_item_id uuid REFERENCES public.order_items(id),
  ADD COLUMN IF NOT EXISTS adjustment_kind text;

ALTER TABLE public.refunds
  DROP CONSTRAINT IF EXISTS refunds_adjustment_kind_check;
ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_adjustment_kind_check
  CHECK (adjustment_kind IS NULL OR adjustment_kind IN ('removed_item','cheaper_replacement'));

CREATE INDEX IF NOT EXISTS idx_refunds_adjustment_source
  ON public.refunds(order_id, source_order_item_id, adjustment_kind);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_active_item_adjustment
  ON public.refunds(order_id, source_order_item_id, adjustment_kind)
  WHERE refund_kind='replacement_adjustment'
    AND source_order_item_id IS NOT NULL
    AND adjustment_kind IS NOT NULL
    AND status NOT IN ('failed','rejected');

CREATE OR REPLACE FUNCTION public.ensure_order_item_refund_obligations(p_order_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  paid public.payments%ROWTYPE;
  item public.order_items%ROWTYPE;
  refund_amount numeric;
  v_adjustment_kind text;
  existing uuid;
  total_adjustment numeric:=0;
BEGIN
  SELECT p.* INTO paid
  FROM public.payments p
  WHERE p.order_id=p_order_id
    AND p.payment_type='product'
    AND p.status='success'
  ORDER BY p.created_at DESC
  LIMIT 1 FOR UPDATE;

  FOR item IN
    SELECT oi.* FROM public.order_items oi
    WHERE oi.order_id=p_order_id
      AND (
        (oi.final_removed=true AND oi.final_resolution='removed')
        OR (oi.final_resolution='replaced'
            AND oi.final_price IS NOT NULL
            AND oi.final_price < oi.price)
      )
    ORDER BY oi.id
  LOOP
    IF paid.id IS NULL THEN
      RAISE EXCEPTION 'successful product payment is required for item refund obligations';
    END IF;
    IF item.final_removed=true AND item.final_resolution='removed' THEN
      refund_amount := item.price * item.qty;
      v_adjustment_kind := 'removed_item';
      IF refund_amount<=0 THEN CONTINUE; END IF;
    ELSE
      refund_amount := (item.price-item.final_price) * item.qty;
      v_adjustment_kind := 'cheaper_replacement';
      IF refund_amount<=0 THEN CONTINUE; END IF;
    END IF;

    SELECT r.id INTO existing
    FROM public.refunds r
    WHERE r.order_id=p_order_id
      AND r.source_order_item_id=item.id
      AND r.adjustment_kind=v_adjustment_kind
      AND r.refund_kind='replacement_adjustment'
      AND r.status NOT IN ('failed','rejected')
    LIMIT 1;
    IF existing IS NULL THEN
      INSERT INTO public.refunds(
        payment_id,order_id,amount,status,reason,refund_kind,
        source_order_item_id,adjustment_kind
      ) VALUES (
        paid.id,p_order_id,refund_amount,'approved',
        CASE WHEN v_adjustment_kind='removed_item'
          THEN 'Removed unavailable item:'||item.id::text
          ELSE 'Replacement price adjustment:'||item.id::text END,
        'replacement_adjustment',item.id,v_adjustment_kind
      ) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(r.amount),0) INTO total_adjustment
  FROM public.refunds r
  WHERE r.order_id=p_order_id
    AND r.refund_kind='replacement_adjustment'
    AND r.status NOT IN ('failed','rejected');
  RETURN total_adjustment;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_order_item_refund_obligations(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_order_item_refund_obligations(uuid) TO service_role;

-- Cheaper replacements retain their existing timing and Paystack path, but
-- now carry explicit source linkage and cannot deduplicate another item on the
-- same order/payment.
CREATE OR REPLACE FUNCTION public.create_replacement_partial_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid public.payments%ROWTYPE; refund_amount numeric; existing uuid;
BEGIN
  IF NEW.final_resolution='replaced' AND NEW.final_price IS NOT NULL AND NEW.final_price < OLD.price THEN
    refund_amount := (OLD.price-NEW.final_price) * NEW.qty;
    SELECT p.* INTO paid FROM public.payments p
    WHERE p.order_id=NEW.order_id AND p.payment_type='product' AND p.status='success'
    ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND AND refund_amount > 0 THEN
      SELECT r.id INTO existing FROM public.refunds r
      WHERE r.order_id=NEW.order_id
        AND r.source_order_item_id=NEW.id
        AND r.adjustment_kind='cheaper_replacement'
        AND r.refund_kind='replacement_adjustment'
        AND r.status NOT IN ('rejected','failed')
      LIMIT 1;
      IF existing IS NULL THEN
        INSERT INTO public.refunds(
          payment_id,order_id,amount,status,reason,refund_kind,
          source_order_item_id,adjustment_kind
        ) VALUES(
          paid.id,NEW.order_id,refund_amount,'approved',
          'Replacement partial refund:'||NEW.id::text,
          'replacement_adjustment',NEW.id,'cheaper_replacement'
        ) ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- The effective confirmation function is replaced below after the helper is
-- installed, so removed-item obligations are created atomically with the
-- final-basket decision and before purchase funding.
CREATE OR REPLACE FUNCTION public.confirm_order_products(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  rid uuid;
  fid uuid;
  n integer;
  item_count integer;
  bad integer;
  pending integer;
  all_items_removed boolean;
  final_food_amount numeric;
  packaging_amount numeric;
  restaurant_purchase_amount numeric;
  adjustment_amount numeric;
BEGIN
  SELECT r.id INTO rid FROM public.riders r
   WHERE r.user_id=auth.uid() AND r.status='approved';
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.rider_id IS DISTINCT FROM rid THEN
    RAISE EXCEPTION 'order is not assigned to this rider';
  END IF;
  IF o.cancellation_stage<>'none'
     OR EXISTS(SELECT 1 FROM public.cancellations WHERE order_id=p_order_id) THEN
    IF o.status='Cancelled'
       AND EXISTS(SELECT 1 FROM public.cancellations c
                  WHERE c.order_id=p_order_id AND c.reason='All items unavailable') THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'order cancellation is active';
  END IF;
  IF o.purchase_funding_status='authorized' THEN
    SELECT id INTO fid FROM public.purchase_funding
     WHERE order_id=p_order_id AND rider_id=rid;
    IF fid IS NOT NULL THEN RETURN fid; END IF;
  END IF;
  IF o.payment_status IS DISTINCT FROM 'success'
     OR o.status NOT IN ('Rider assigned','Picked up','On the Way')
     OR o.purchase_funding_status NOT IN ('not_required','pending') THEN
    RAISE EXCEPTION 'order is not eligible for confirmation';
  END IF;

  SELECT count(*) INTO item_count FROM public.order_items WHERE order_id=p_order_id;
  SELECT count(*) INTO n FROM public.order_items oi
   WHERE oi.order_id=p_order_id
     AND NOT EXISTS (
       SELECT 1 FROM public.product_availability_check pc
        WHERE pc.order_item_id=oi.id AND pc.order_id=p_order_id
     );
  IF n>0 THEN RAISE EXCEPTION 'every order item must be checked'; END IF;

  SELECT item_count > 0 AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id=p_order_id
      AND (oi.final_removed IS DISTINCT FROM true
           OR oi.final_resolution IS DISTINCT FROM 'removed')
  ) INTO all_items_removed;
  IF all_items_removed THEN
    -- Full cancellation/reimbursement owns the whole reversal. No item-level
    -- rows are created, preventing a later double refund.
    PERFORM public.resolve_all_items_unavailable(p_order_id);
    RETURN NULL;
  END IF;

  SELECT count(*) INTO bad FROM public.order_items
   WHERE order_id=p_order_id AND NOT final_removed
     AND COALESCE(final_resolution,'available') NOT IN ('available','replaced');
  SELECT count(*) INTO pending FROM public.order_replacements
   WHERE order_id=p_order_id AND status='pending';
  IF bad>0 OR pending>0
     OR o.final_financial_status='additional_payment_required' THEN
    RAISE EXCEPTION 'final order is not financially resolved';
  END IF;

  adjustment_amount := public.ensure_order_item_refund_obligations(p_order_id);
  IF o.final_financial_status='overpaid_pending_resolution'
     AND adjustment_amount + 0.01 < COALESCE(o.overpaid_amount,0) THEN
    RAISE EXCEPTION 'final overpayment has no complete item refund obligation';
  END IF;

  SELECT COALESCE(SUM(CASE WHEN NOT oi.final_removed
                           THEN COALESCE(oi.final_price,oi.price)*oi.qty
                           ELSE 0 END),0)
    INTO final_food_amount
    FROM public.order_items oi WHERE oi.order_id=p_order_id;
  IF final_food_amount<=0 THEN
    RAISE EXCEPTION 'all items must be resolved as removed before cancelling';
  END IF;

  packaging_amount := GREATEST(COALESCE(o.packaging_amount,0),0);
  restaurant_purchase_amount := final_food_amount + packaging_amount;
  INSERT INTO public.purchase_funding(
    order_id,rider_id,amount,food_amount,packaging_amount,
    restaurant_purchase_amount,status,authorized_at,created_by,updated_by
  ) VALUES (
    p_order_id,rid,restaurant_purchase_amount,final_food_amount,packaging_amount,
    restaurant_purchase_amount,'authorized',now(),auth.uid(),auth.uid()
  ) ON CONFLICT(order_id) DO NOTHING RETURNING id INTO fid;
  IF fid IS NULL THEN
    SELECT id INTO fid FROM public.purchase_funding WHERE order_id=p_order_id;
  END IF;
  UPDATE public.orders
     SET product_availability_status='confirmed',
         purchase_funding_status='authorized',
         products_confirmed_at=COALESCE(products_confirmed_at,now())
   WHERE id=p_order_id;
  RETURN fid;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_order_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_products(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remaining_product_refund_amount(p_payment_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT GREATEST(
    p.amount - COALESCE((
      SELECT SUM(r.amount) FROM public.refunds r
      WHERE r.payment_id=p.id
        AND r.refund_kind='replacement_adjustment'
        AND r.status='processed'
    ),0),0)
  FROM public.payments p WHERE p.id=p_payment_id;
$$;
REVOKE ALL ON FUNCTION public.remaining_product_refund_amount(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.remaining_product_refund_amount(uuid) TO service_role;

-- Full-order customer refunds use only the remaining refundable cash after
-- completed item adjustments. Pending/processing item adjustments block a
-- competing full refund until their outcome is known.
CREATE OR REPLACE FUNCTION public.request_refund(
  p_order_id uuid, p_payment_type text, p_reason text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_refund public.refunds%ROWTYPE;
  v_amount numeric;
BEGIN
  IF p_payment_type NOT IN ('product','vendor_delivery') THEN RAISE EXCEPTION 'invalid payment type'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> auth.uid() THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  SELECT p.* INTO v_payment FROM public.payments p
  WHERE p.order_id=p_order_id AND p.payment_type=p_payment_type AND p.status='success'
    AND ((p_payment_type='product' AND v_order.payment_status='success')
      OR (p_payment_type='vendor_delivery' AND v_order.delivery_payment_status='success'))
  ORDER BY p.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected payment is not refundable'; END IF;
  SELECT * INTO v_refund FROM public.refunds
  WHERE payment_id=v_payment.id AND refund_kind='full_order'
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN json_build_object('refund_id',v_refund.id,'payment_id',v_payment.id,
      'order_id',p_order_id,'amount',v_refund.amount,'status',v_refund.status,'already_existed',true);
  END IF;
  IF p_payment_type='product' AND EXISTS(
    SELECT 1 FROM public.refunds r
    WHERE r.payment_id=v_payment.id AND r.refund_kind='replacement_adjustment'
      AND r.status IN ('approved','processing')
  ) THEN
    RAISE EXCEPTION 'item adjustment refund is still processing';
  END IF;
  v_amount := CASE WHEN p_payment_type='product'
    THEN public.remaining_product_refund_amount(v_payment.id)
    ELSE v_payment.amount END;
  IF v_amount<=0 THEN RAISE EXCEPTION 'no remaining refundable amount'; END IF;
  INSERT INTO public.refunds(payment_id,order_id,amount,status,reason,refund_kind)
  VALUES(v_payment.id,p_order_id,v_amount,'requested',p_reason,'full_order')
  RETURNING * INTO v_refund;
  RETURN json_build_object('refund_id',v_refund.id,'payment_id',v_payment.id,
    'order_id',p_order_id,'amount',v_refund.amount,'status',v_refund.status,'already_existed',false);
END; $$;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid,text,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_refund(uuid,text,text) FROM anon,PUBLIC;

CREATE OR REPLACE FUNCTION public.request_refund(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_type text; v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  SELECT p.payment_type INTO v_type FROM public.payments p
  WHERE p.order_id=p_order_id AND p.status='success'
    AND ((p.payment_type='vendor_delivery' AND v_order.delivery_payment_status='success')
      OR (p.payment_type='product' AND v_order.payment_status='success'))
  ORDER BY CASE WHEN p.payment_type='vendor_delivery' THEN 1 ELSE 2 END,p.created_at DESC LIMIT 1;
  IF v_type IS NULL THEN RAISE EXCEPTION 'Order has no successful payment — cannot request refund'; END IF;
  RETURN public.request_refund(p_order_id,v_type,p_reason);
END; $$;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_refund(uuid,text) FROM anon,PUBLIC;

-- Cancellation reimbursement also refunds actual successful cash less only
-- completed item adjustments. Failed/rejected adjustments remain refundable.
CREATE OR REPLACE FUNCTION public.request_customer_cancellation(p_order_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  c public.cancellations%ROWTYPE;
  f public.purchase_funding%ROWTYPE;
  t public.transfers%ROWTYPE;
  paid numeric;
  adjusted numeric;
  amount numeric;
  stage text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  IF o.status IN ('Delivered','Rated','Cancelled') THEN RAISE EXCEPTION 'order is not cancellable'; END IF;
  SELECT * INTO c FROM public.cancellations WHERE order_id=o.id FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('cancellation_id',c.id,'stage',c.stage,'reimbursement_amount',c.reimbursement_amount,'already_exists',true); END IF;
  SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
  SELECT * INTO t FROM public.transfers WHERE purchase_funding_id=f.id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND t.status IN ('processing','success') THEN stage:='admin_resolution_required';
  ELSE stage:='eligible_for_reimbursement'; END IF;
  IF EXISTS (SELECT 1 FROM public.refunds r WHERE r.order_id=o.id AND r.refund_kind='replacement_adjustment' AND r.status IN ('approved','processing')) THEN
    stage:='admin_resolution_required';
  END IF;
  SELECT COALESCE(SUM(p.amount),0) INTO paid FROM public.payments p
  WHERE p.order_id=o.id AND p.status='success' AND p.payment_type IN ('product','replacement');
  SELECT COALESCE(SUM(r.amount),0) INTO adjusted FROM public.refunds r
  WHERE r.order_id=o.id AND r.refund_kind='replacement_adjustment' AND r.status='processed';
  amount:=GREATEST(paid-adjusted,0);
  IF amount<=0 AND stage='eligible_for_reimbursement' THEN stage:='resolved'; END IF;
  INSERT INTO public.cancellations(order_id,initiated_by,reason,stage,reimbursement_amount)
  VALUES(o.id,auth.uid(),COALESCE(NULLIF(trim(p_reason),''),'Customer cancellation'),stage,NULLIF(amount,0))
  RETURNING * INTO c;
  PERFORM set_config('request.jwt.claim.sub',o.user_id::text,true);
  UPDATE public.orders SET status='Cancelled',cancellation_stage=stage,cancellation_requested_at=now(),final_financial_status='cancelled' WHERE id=o.id;
  RETURN jsonb_build_object('cancellation_id',c.id,'stage',stage,'reimbursement_amount',c.reimbursement_amount,'already_exists',false);
END; $$;
GRANT EXECUTE ON FUNCTION public.request_customer_cancellation(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_customer_cancellation(uuid,text) FROM anon,PUBLIC;

-- A product payment remains locally refundable while only part of it has been
-- returned.  This lets multiple item adjustments on the same Paystack charge
-- execute independently; the payment becomes refunded only once the processed
-- refund total reaches the original payment amount.
CREATE OR REPLACE FUNCTION public.apply_refund_result(
  p_refund_id uuid, p_success boolean, p_gateway_refund_id text DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_processed numeric;
BEGIN
  SELECT * INTO v_refund FROM public.refunds WHERE id=p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund % not found',p_refund_id; END IF;
  IF v_refund.status IN ('processed','rejected') THEN
    RETURN json_build_object('refund_id',v_refund.id,'status',v_refund.status,'terminal',true);
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id=v_refund.payment_id FOR UPDATE;
  SELECT * INTO v_order FROM public.orders WHERE id=v_refund.order_id FOR UPDATE;
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
  SELECT COALESCE(SUM(r.amount),0) INTO v_processed
  FROM public.refunds r WHERE r.payment_id=v_payment.id AND r.status='processed';
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

-- Promotion restoration must validate the actual cash event after any item-level
-- adjustment refunds.  A full-order refund is the remaining product payment,
-- not necessarily the original charge amount.
CREATE OR REPLACE FUNCTION public.restore_order_promotion_after_full_refund(
  p_order_id uuid, p_source_type text, p_source_id uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  r public.promotion_reservations%ROWTYPE;
  f public.refunds%ROWTYPE;
  p public.payments%ROWTYPE;
  c public.cancellations%ROWTYPE;
  t public.transfers%ROWTYPE;
  a record;
  expected numeric;
  restored numeric:=0;
  inserted_id uuid;
  all_removed boolean;
BEGIN
  IF p_source_type NOT IN ('refund','reimbursement') THEN
    RETURN json_build_object('restored',false,'reason','invalid_source');
  END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('restored',false,'reason','order_not_found'); END IF;
  SELECT count(*) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id=o.id
      AND (oi.final_removed IS DISTINCT FROM true
           OR oi.final_resolution IS DISTINCT FROM 'removed')
  ) INTO all_removed;
  SELECT * INTO r FROM public.promotion_reservations
    WHERE order_id=o.id AND status='finalized'
    ORDER BY finalized_at DESC NULLS LAST, created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('restored',false,'reason','no_finalized_promotion'); END IF;

  IF p_source_type='refund' THEN
    SELECT * INTO f FROM public.refunds WHERE id=p_source_id AND order_id=o.id FOR UPDATE;
    IF NOT FOUND OR f.status<>'processed' OR f.refund_kind<>'full_order' THEN
      RETURN json_build_object('restored',false,'reason','refund_not_full_order');
    END IF;
    SELECT * INTO p FROM public.payments WHERE id=f.payment_id AND order_id=o.id FOR UPDATE;
    IF NOT FOUND OR p.payment_type NOT IN ('product','vendor_delivery')
       OR p.status NOT IN ('success','refunded') THEN
      RETURN json_build_object('restored',false,'reason','payment_not_authoritative');
    END IF;
    IF p.payment_type='vendor_delivery' THEN
      expected:=COALESCE(o.customer_delivery_charge,o.base_delivery_fee,o.fee);
    ELSE
      expected:=p.amount-COALESCE((
        SELECT SUM(r2.amount) FROM public.refunds r2
        WHERE r2.payment_id=p.id
          AND r2.refund_kind='replacement_adjustment'
          AND r2.status='processed'
          AND r2.id IS DISTINCT FROM f.id
      ),0);
    END IF;
    IF expected IS NULL OR expected<0 OR ABS(f.amount-expected)>0.01 THEN
      RETURN json_build_object('restored',false,'reason','refund_not_full_amount');
    END IF;
  ELSE
    SELECT * INTO c FROM public.cancellations
     WHERE id=p_source_id AND order_id=o.id AND stage='reimbursed' FOR UPDATE;
    IF NOT FOUND THEN RETURN json_build_object('restored',false,'reason','reimbursement_not_complete'); END IF;
    SELECT * INTO t FROM public.transfers
     WHERE cancellation_id=c.id AND transfer_kind='customer_reimbursement' AND status='success'
     ORDER BY attempt_no DESC NULLS LAST, created_at DESC LIMIT 1 FOR UPDATE;
    SELECT COALESCE(SUM(p2.amount),0) INTO expected
    FROM public.payments p2
    WHERE p2.order_id=o.id AND p2.status IN ('success','refunded')
      AND p2.payment_type IN ('product','replacement');
    expected:=expected-COALESCE((
      SELECT SUM(r2.amount) FROM public.refunds r2
      WHERE r2.order_id=o.id AND r2.refund_kind='replacement_adjustment' AND r2.status='processed'
    ),0);
    IF NOT FOUND OR expected IS NULL OR expected<0 OR c.reimbursement_amount IS NULL
       OR ABS(c.reimbursement_amount-expected)>0.01 OR ABS(t.amount-expected)>0.01 THEN
      RETURN json_build_object('restored',false,'reason','reimbursement_not_full_amount');
    END IF;
  END IF;

  INSERT INTO public.promotion_restorations
    (order_id,promotion_reservation_id,promotion_type,amount_restored,source_type,source_id,reason)
  VALUES (o.id,r.id,r.promotion_type,r.discount_amount,p_source_type,p_source_id,
          CASE WHEN p_source_type='refund' THEN 'Full order refund completed' ELSE 'Full cancellation reimbursement completed' END)
  ON CONFLICT DO NOTHING RETURNING id INTO inserted_id;
  IF inserted_id IS NULL THEN RETURN json_build_object('restored',false,'already_restored',true); END IF;
  IF r.promotion_type='credit' THEN
    FOR a IN SELECT * FROM public.credit_reservation_allocations
      WHERE reservation_id=r.id ORDER BY ledger_id FOR UPDATE LOOP
      UPDATE public.customer_credit_ledger
      SET remaining_amount=COALESCE(remaining_amount,0)+a.amount,
          status=CASE WHEN expires_at IS NOT NULL AND expires_at<=now() THEN 'expired' ELSE 'available' END
      WHERE id=a.ledger_id;
      restored:=restored+a.amount;
    END LOOP;
    IF restored<=0 THEN RAISE EXCEPTION 'finalized credit promotion has no allocations'; END IF;
    INSERT INTO public.notifications(user_id,title,message,type)
    VALUES(o.user_id,'Dropzyy credit restored',
      'â‚¦'||to_char(restored,'FM999999990.00')||' promotional credit from your refunded order has been restored. Expired portions remain unavailable.','info');
  ELSE
    UPDATE public.coupon_redemptions SET status='reversed'
     WHERE coupon_id=r.source_id AND order_id=o.id AND status='finalized';
    IF NOT FOUND THEN RAISE EXCEPTION 'finalized coupon promotion has no redemption'; END IF;
    INSERT INTO public.notifications(user_id,title,message,type)
    VALUES(o.user_id,'Coupon restored','Your coupon use on the refunded order has been reversed.','info');
    restored:=r.discount_amount;
  END IF;
  RETURN json_build_object('restored',true,'amount',restored,'promotion_type',r.promotion_type);
END; $$;
REVOKE ALL ON FUNCTION public.restore_order_promotion_after_full_refund(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_promotion_after_full_refund(uuid,text,uuid) TO service_role;
