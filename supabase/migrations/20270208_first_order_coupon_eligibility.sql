-- Phase 5 correction: first-order-only coupons ignore only authoritative full
-- reversals. Forward-only; prior promotion/refund migrations are unchanged.

CREATE OR REPLACE FUNCTION public.order_has_authoritative_full_reversal(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  r public.refunds%ROWTYPE;
  p public.payments%ROWTYPE;
  c public.cancellations%ROWTYPE;
  t public.transfers%ROWTYPE;
  expected numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id;
  IF NOT FOUND THEN RETURN false; END IF;

  -- A processed full-order refund must equal the complete authoritative
  -- payment for its payment type. Partial, replacement, unknown, failed,
  -- approved, and processing rows deliberately do not qualify.
  FOR r IN SELECT * FROM public.refunds
    WHERE order_id=o.id AND status='processed' AND refund_kind='full_order' LOOP
    SELECT * INTO p FROM public.payments WHERE id=r.payment_id AND order_id=o.id;
    IF FOUND AND p.payment_type IN ('product','vendor_delivery')
       AND p.status IN ('success','refunded') THEN
      expected:=CASE WHEN p.payment_type='vendor_delivery'
        THEN COALESCE(o.customer_delivery_charge,o.base_delivery_fee,o.fee)
        ELSE COALESCE(o.final_order_total,o.total) END;
      IF expected IS NOT NULL AND ABS(r.amount-expected)<=0.01 AND ABS(p.amount-expected)<=0.01 THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  -- A completed customer reimbursement must be the complete authoritative
  -- order amount, not a requested/pending/processing/failed/partial transfer.
  FOR c IN SELECT * FROM public.cancellations
    WHERE order_id=o.id AND stage='reimbursed' LOOP
    SELECT * INTO t FROM public.transfers
      WHERE cancellation_id=c.id AND transfer_kind='customer_reimbursement' AND status='success'
      ORDER BY attempt_no DESC NULLS LAST,created_at DESC LIMIT 1;
    expected:=COALESCE(o.final_order_total,o.total);
    IF FOUND AND expected IS NOT NULL AND c.reimbursement_amount IS NOT NULL
       AND ABS(c.reimbursement_amount-expected)<=0.01 AND ABS(t.amount-expected)<=0.01 THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.order_has_authoritative_full_reversal(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.customer_has_prior_qualifying_order(
  p_user_id uuid, p_exclude_order_id uuid DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
  FOR o IN SELECT * FROM public.orders
    WHERE user_id=p_user_id AND (p_exclude_order_id IS NULL OR id<>p_exclude_order_id)
      AND payment_status IN ('success','refunded')
      AND EXISTS (SELECT 1 FROM public.payments p WHERE p.order_id=orders.id
        AND p.payment_type='product' AND p.status IN ('success','refunded')) LOOP
    IF NOT public.order_has_authoritative_full_reversal(o.id) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END; $$;
REVOKE ALL ON FUNCTION public.customer_has_prior_qualifying_order(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.is_first_order_coupon_eligible(
  p_user_id uuid, p_exclude_order_id uuid DEFAULT NULL
)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT NOT public.customer_has_prior_qualifying_order(p_user_id,p_exclude_order_id);
$$;
REVOKE ALL ON FUNCTION public.is_first_order_coupon_eligible(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Re-issue the existing reservation RPC with the same pricing, locking, and
-- promotion lifecycle. The only behavior change is the centralized,
-- order-excluding first-order check.
CREATE OR REPLACE FUNCTION public.reserve_delivery_promotion(p_order_id uuid,p_mode text,p_coupon_code text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; c public.coupons%ROWTYPE; r public.promotion_reservations%ROWTYPE; e record; available numeric:=0; needed numeric; take numeric; discount numeric; fee numeric; team numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR o.payment_status<>'pending' THEN RAISE EXCEPTION 'order is not eligible for promotion'; END IF;
  SELECT * INTO r FROM public.promotion_reservations WHERE order_id=o.id FOR UPDATE;
  IF FOUND AND r.status='reserved' THEN RETURN json_build_object('reservation_id',r.id,'discount',r.discount_amount,'status',r.status); END IF;
  IF p_mode NOT IN ('credit','coupon') THEN RAISE EXCEPTION 'invalid promotion mode'; END IF;
  fee:=COALESCE(o.fee,0); team:=COALESCE(o.company_delivery_share,fee-COALESCE(o.rider_delivery_share,0));
  IF fee<=0 THEN RAISE EXCEPTION 'order has no delivery fee'; END IF;
  IF p_mode='coupon' THEN
    SELECT * INTO c FROM public.coupons WHERE code=upper(trim(p_coupon_code)) FOR UPDATE;
    IF NOT FOUND OR NOT c.active OR (c.starts_at IS NOT NULL AND now()<c.starts_at) OR (c.expires_at IS NOT NULL AND now()>=c.expires_at) THEN RAISE EXCEPTION 'coupon is not eligible'; END IF;
    IF c.usage_limit IS NOT NULL AND (SELECT count(*) FROM public.coupon_redemptions WHERE coupon_id=c.id AND status IN ('reserved','finalized'))>=c.usage_limit THEN RAISE EXCEPTION 'coupon usage limit reached'; END IF;
    IF (SELECT count(*) FROM public.coupon_redemptions WHERE coupon_id=c.id AND user_id=auth.uid() AND status IN ('reserved','finalized'))>=c.per_user_limit THEN RAISE EXCEPTION 'coupon per-user limit reached'; END IF;
    IF c.first_order_only AND NOT public.is_first_order_coupon_eligible(auth.uid(),o.id) THEN RAISE EXCEPTION 'coupon is first-order only'; END IF;
    discount:=CASE WHEN c.coupon_type='fixed' THEN c.fixed_amount ELSE fee*c.percentage/100 END;
    discount:=LEAST(discount,400,team-100);
    IF discount<=0 THEN RAISE EXCEPTION 'coupon cannot be applied safely'; END IF;
    INSERT INTO public.promotion_reservations(user_id,order_id,promotion_type,source_id,discount_amount) VALUES(auth.uid(),o.id,'coupon',c.id,discount) RETURNING * INTO r;
    INSERT INTO public.coupon_redemptions(coupon_id,user_id,order_id,discount_amount,status) VALUES(c.id,auth.uid(),o.id,discount,'reserved') ON CONFLICT(coupon_id,order_id) DO UPDATE SET discount_amount=EXCLUDED.discount_amount,status='reserved';
  ELSE
    SELECT COALESCE(SUM(remaining_amount),0) INTO available FROM public.customer_credit_ledger WHERE user_id=auth.uid() AND amount>0 AND remaining_amount>0 AND status='available' AND (expires_at IS NULL OR expires_at>now());
    discount:=LEAST(available,400,team-100);
    IF discount<=0 THEN RAISE EXCEPTION 'no promotional credit available'; END IF;
    INSERT INTO public.promotion_reservations(user_id,order_id,promotion_type,discount_amount) VALUES(auth.uid(),o.id,'credit',discount) RETURNING * INTO r;
    needed:=discount;
    FOR e IN SELECT * FROM public.customer_credit_ledger WHERE user_id=auth.uid() AND amount>0 AND remaining_amount>0 AND status='available' AND (expires_at IS NULL OR expires_at>now()) ORDER BY expires_at NULLS LAST,issued_at,id FOR UPDATE LOOP
      EXIT WHEN needed<=0;
      take:=LEAST(needed,e.remaining_amount);
      UPDATE public.customer_credit_ledger SET remaining_amount=remaining_amount-take,status=CASE WHEN remaining_amount-take<=0 THEN 'reserved' ELSE status END WHERE id=e.id;
      INSERT INTO public.credit_reservation_allocations(reservation_id,ledger_id,amount) VALUES(r.id,e.id,take);
      needed:=needed-take;
    END LOOP;
    IF needed>0 THEN RAISE EXCEPTION 'credit became unavailable'; END IF;
  END IF;
  UPDATE public.orders SET base_delivery_fee=fee,team_share_before_promotion=team,customer_delivery_charge=fee-discount,promotion_type=p_mode,promotion_source_id=r.source_id,promotion_discount=discount,credit_used=CASE WHEN p_mode='credit' THEN discount ELSE 0 END,promotion_reservation_id=r.id,total=subtotal+fee-discount WHERE id=o.id;
  RETURN json_build_object('reservation_id',r.id,'discount',discount,'status','reserved');
END; $$;
REVOKE ALL ON FUNCTION public.reserve_delivery_promotion(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_delivery_promotion(uuid,text,text) TO authenticated;
