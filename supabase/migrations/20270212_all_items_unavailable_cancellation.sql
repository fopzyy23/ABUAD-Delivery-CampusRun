-- Resolve the all-food-removed outcome through the existing cancellation and
-- reimbursement systems.  No purchase funding or delivery settlement is
-- created for an order with no food left to collect.

CREATE OR REPLACE FUNCTION public.resolve_all_items_unavailable(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  existing public.cancellations%ROWTYPE;
  funding public.purchase_funding%ROWTYPE;
  latest_transfer public.transfers%ROWTYPE;
  rider_id uuid;
  paid numeric;
  stage text;
  reimbursement numeric;
  cancellation_id uuid;
BEGIN
  SELECT r.id INTO rider_id
  FROM public.riders r
  WHERE r.user_id=auth.uid() AND r.status='approved';
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.rider_id IS DISTINCT FROM rider_id THEN
    RAISE EXCEPTION 'order is not assigned to this rider';
  END IF;

  SELECT * INTO existing FROM public.cancellations
  WHERE order_id=p_order_id FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'cancelled', existing.stage IN ('eligible_for_reimbursement','reimbursement_pending','reimbursement_processing','reimbursed','resolved'),
      'already_exists', true,
      'cancellation_id', existing.id,
      'stage', existing.stage,
      'reimbursement_amount', existing.reimbursement_amount
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id=p_order_id)
     OR EXISTS (
       SELECT 1 FROM public.order_items
       WHERE order_id=p_order_id
         AND (final_removed IS DISTINCT FROM true
              OR final_resolution IS DISTINCT FROM 'removed')
     ) THEN
    RAISE EXCEPTION 'all original food items must be resolved as removed';
  END IF;

  SELECT * INTO funding FROM public.purchase_funding
  WHERE order_id=p_order_id FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO latest_transfer FROM public.transfers
    WHERE purchase_funding_id=funding.id
    ORDER BY attempt_no DESC NULLS LAST, created_at DESC
    LIMIT 1 FOR UPDATE;
    IF latest_transfer.status IN ('processing','success')
       OR funding.status IN ('processing','transferred') THEN
      stage := 'admin_resolution_required';
    END IF;
  END IF;
  stage := COALESCE(stage,'eligible_for_reimbursement');

  -- Product payments contain the original customer charge, including the
  -- packaging snapshot and delivery fee.  Promotional credit is not added to
  -- this cash amount; its finalized reservation is restored separately by the
  -- existing promotion-restoration trigger after reimbursement succeeds.
  SELECT COALESCE(SUM(p.amount),0) INTO paid
  FROM public.payments p
  WHERE p.order_id=p_order_id
    AND p.status='success'
    AND p.payment_type IN ('product','replacement');
  reimbursement := GREATEST(
    paid - COALESCE((
      SELECT SUM(t.amount) FROM public.transfers t
      JOIN public.cancellations c ON c.id=t.cancellation_id
      WHERE c.order_id=p_order_id
        AND t.status IN ('success','processing')
    ),0),0
  );
  IF reimbursement<=0 AND stage='eligible_for_reimbursement' THEN
    stage := 'resolved';
  END IF;

  INSERT INTO public.cancellations(
    order_id,initiated_by,reason,stage,reimbursement_amount
  ) VALUES (
    p_order_id,auth.uid(),'All items unavailable',stage,NULLIF(reimbursement,0)
  ) RETURNING id INTO cancellation_id;

  -- Reuse the existing customer-authorized cancellation transition guard for
  -- this trusted server-side resolution, as the automatic cutoff flow does.
  PERFORM set_config('request.jwt.claim.sub',o.user_id::text,true);
  UPDATE public.orders
  SET status='Cancelled',
      product_availability_status='confirmed',
      purchase_funding_status='not_required',
      products_confirmed_at=COALESCE(products_confirmed_at,now()),
      cancellation_stage=stage,
      cancellation_requested_at=now(),
      final_financial_status='cancelled'
  WHERE id=p_order_id;

  RETURN jsonb_build_object(
    'cancelled',true,
    'already_exists',false,
    'cancellation_id',cancellation_id,
    'stage',stage,
    'reimbursement_amount',NULLIF(reimbursement,0)
  );
END; $$;
REVOKE ALL ON FUNCTION public.resolve_all_items_unavailable(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_all_items_unavailable(uuid) TO authenticated;

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
       AND EXISTS(
         SELECT 1 FROM public.cancellations c
         WHERE c.order_id=p_order_id AND c.reason='All items unavailable'
       )
       AND NOT EXISTS(
         SELECT 1 FROM public.order_items oi
         WHERE oi.order_id=p_order_id
           AND (oi.final_removed IS DISTINCT FROM true
                OR oi.final_resolution IS DISTINCT FROM 'removed')
       ) THEN
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
    PERFORM public.resolve_all_items_unavailable(p_order_id);
    RETURN NULL;
  END IF;

  SELECT count(*) INTO bad FROM public.order_items
   WHERE order_id=p_order_id AND NOT final_removed
     AND COALESCE(final_resolution,'available') NOT IN ('available','replaced');
  SELECT count(*) INTO pending FROM public.order_replacements
   WHERE order_id=p_order_id AND status='pending';
  IF bad>0 OR pending>0
     OR o.final_financial_status IN ('additional_payment_required','overpaid_pending_resolution') THEN
    RAISE EXCEPTION 'final order is not financially resolved';
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

-- The all-removed resolution refunds the actual successful customer payment,
-- while final_order_total may contain only the residual delivery snapshot.
-- Let the existing promotion restoration system recognize that reimbursement
-- as the full cancellation reversal without treating promotion value as cash.
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
    expected:=CASE WHEN p.payment_type='vendor_delivery'
      THEN COALESCE(o.customer_delivery_charge,o.base_delivery_fee,o.fee)
      ELSE COALESCE(o.final_order_total,o.total) END;
    IF expected IS NULL OR ABS(f.amount-expected)>0.01 OR ABS(p.amount-expected)>0.01 THEN
      RETURN json_build_object('restored',false,'reason','refund_not_full_amount');
    END IF;
  ELSE
    SELECT * INTO c FROM public.cancellations
     WHERE id=p_source_id AND order_id=o.id AND stage='reimbursed' FOR UPDATE;
    IF NOT FOUND THEN RETURN json_build_object('restored',false,'reason','reimbursement_not_complete'); END IF;
    SELECT * INTO t FROM public.transfers
     WHERE cancellation_id=c.id AND transfer_kind='customer_reimbursement' AND status='success'
     ORDER BY attempt_no DESC NULLS LAST, created_at DESC LIMIT 1 FOR UPDATE;
    expected:=CASE WHEN all_removed THEN c.reimbursement_amount ELSE COALESCE(o.final_order_total,o.total) END;
    IF NOT FOUND OR expected IS NULL OR c.reimbursement_amount IS NULL
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
      '₦'||to_char(restored,'FM999999990.00')||' promotional credit from your refunded order has been restored. Expired portions remain unavailable.','info');
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

-- The reimbursement transfer status is written before the transfer webhook
-- finalizes cancellations.  Run the existing restoration routine again on the
-- authoritative cancellation transition so credit/coupon restoration cannot
-- be skipped because of trigger ordering.  The restoration table's unique
-- keys keep this retry idempotent.
CREATE OR REPLACE FUNCTION public.trg_restore_promotion_after_reimbursement_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.stage='reimbursed' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    PERFORM public.restore_order_promotion_after_full_refund(NEW.order_id,'reimbursement',NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_restore_promotion_after_reimbursement_completion ON public.cancellations;
CREATE TRIGGER trg_restore_promotion_after_reimbursement_completion
  AFTER UPDATE OF stage ON public.cancellations FOR EACH ROW
  EXECUTE FUNCTION public.trg_restore_promotion_after_reimbursement_completion();
