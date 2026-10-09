-- Resolve rider product confirmation after customer removal without weakening
-- purchase-funding or pickup guards.

CREATE OR REPLACE FUNCTION public.customer_remove_unavailable_item(p_order_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  oi public.order_items%ROWTYPE;
  o public.orders%ROWTYPE;
  r public.order_replacements%ROWTYPE;
  due numeric;
  unresolved integer;
BEGIN
  SELECT * INTO oi FROM public.order_items WHERE id=p_order_item_id FOR UPDATE;
  SELECT * INTO o FROM public.orders WHERE id=oi.order_id FOR UPDATE;
  IF NOT FOUND OR o.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'order item is not owned by caller';
  END IF;
  IF o.cancellation_stage <> 'none'
     OR o.purchase_funding_status NOT IN ('not_required','pending')
     OR oi.availability_state <> 'unavailable' THEN
    RAISE EXCEPTION 'item is not eligible for removal';
  END IF;

  SELECT * INTO r FROM public.order_replacements WHERE order_item_id=oi.id FOR UPDATE;
  IF FOUND THEN
    -- A replacement selected but not paid is an obligation, not a completed
    -- financial event. Release its pending payment before removing the item.
    UPDATE public.payments
       SET status='failed', updated_at=now()
     WHERE replacement_obligation_id=r.id AND status='pending';
    UPDATE public.order_replacements
       SET customer_decision='removed', status='cancelled',
           replacement_product_id=NULL, updated_at=now()
     WHERE id=r.id;
  ELSE
    INSERT INTO public.order_replacements(
      order_id, order_item_id, original_product_id, replacement_product_id,
      price_difference, customer_decision, status
    ) VALUES (
      o.id, oi.id, oi.product_id, NULL, -(oi.price*oi.qty), 'removed', 'cancelled'
    );
  END IF;

  UPDATE public.order_items
     SET final_product_id=NULL,
         final_price=0,
         final_removed=true,
         final_resolution='removed',
         final_resolved_at=now(),
         availability_state='available'
   WHERE id=oi.id;

  PERFORM public.recalculate_final_order_financials(o.id);
  SELECT additional_amount_due INTO due FROM public.orders WHERE id=o.id;

  SELECT count(*) INTO unresolved
    FROM public.order_items
   WHERE order_id=o.id
     AND NOT final_removed
     AND COALESCE(final_resolution,'available') NOT IN ('available','replaced');

  -- "needs_customer_decision" is no longer accurate once every original
  -- item has a final resolution. The rider still must explicitly confirm.
  IF unresolved=0 AND o.product_availability_status <> 'confirmed' THEN
    UPDATE public.orders
       SET product_availability_status='in_progress'
     WHERE id=o.id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.notifications
     WHERE related_order_id=o.id
       AND user_id=(SELECT rider_row.user_id FROM public.riders rider_row WHERE rider_row.id=o.rider_id)
       AND title='Customer decision received'
  ) THEN
    INSERT INTO public.notifications(user_id,title,message,type,related_order_id)
    SELECT rider_row.user_id, 'Customer decision received',
           'The unavailable item was removed. The order is ready for final confirmation.',
           'rider', o.id
      FROM public.riders rider_row WHERE rider_row.id=o.rider_id;
  END IF;

  RETURN jsonb_build_object(
    'order_id', o.id,
    'order_item_id', oi.id,
    'additional_amount_due', due,
    'unresolved_items', unresolved
  );
END; $$;
REVOKE ALL ON FUNCTION public.customer_remove_unavailable_item(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.customer_remove_unavailable_item(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_order_products(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  rid uuid;
  fid uuid;
  n integer;
  bad integer;
  pending integer;
  funding_amount numeric;
BEGIN
  SELECT r.id INTO rid FROM public.riders r
   WHERE r.user_id=auth.uid() AND r.status='approved';
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.rider_id IS DISTINCT FROM rid THEN
    RAISE EXCEPTION 'order is not assigned to this rider';
  END IF;
  IF o.cancellation_stage<>'none'
     OR EXISTS(SELECT 1 FROM public.cancellations WHERE order_id=p_order_id) THEN
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

  SELECT count(*) INTO n FROM public.order_items oi
   WHERE oi.order_id=p_order_id
     AND NOT EXISTS (
       SELECT 1 FROM public.product_availability_check pc
        WHERE pc.order_item_id=oi.id AND pc.order_id=p_order_id
     );
  IF n>0 THEN RAISE EXCEPTION 'every order item must be checked'; END IF;

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
    INTO funding_amount
    FROM public.order_items oi WHERE oi.order_id=p_order_id;

  -- An empty final basket is a valid resolution but is not a purchase.
  -- Mark it confirmed without creating funding or calling Paystack. Pickup
  -- remains protected by trg_guard_pickup_requires_final_products because it
  -- requires authorized/processing/transferred purchase funding.
  IF funding_amount<=0 THEN
    UPDATE public.orders
       SET product_availability_status='confirmed',
           purchase_funding_status='not_required',
           products_confirmed_at=COALESCE(products_confirmed_at,now())
     WHERE id=p_order_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.purchase_funding(
    order_id,rider_id,amount,status,authorized_at,created_by,updated_by
  ) VALUES (
    p_order_id,rid,funding_amount,'authorized',now(),auth.uid(),auth.uid()
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
