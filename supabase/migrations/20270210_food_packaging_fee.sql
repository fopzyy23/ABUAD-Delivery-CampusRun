-- Optional food packaging fee. Forward-only; historical orders default to zero
-- and retain their own immutable packaging snapshot.

ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS food_packaging_unit_price numeric(12,2) NOT NULL DEFAULT 200
    CHECK (food_packaging_unit_price >= 0);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packaging_quantity integer NOT NULL DEFAULT 0
    CHECK (packaging_quantity >= 0 AND packaging_quantity <= 10),
  ADD COLUMN IF NOT EXISTS packaging_unit_price numeric(12,2) NOT NULL DEFAULT 200
    CHECK (packaging_unit_price >= 0),
  ADD COLUMN IF NOT EXISTS packaging_amount numeric(12,2) NOT NULL DEFAULT 0
    CHECK (packaging_amount >= 0);

CREATE OR REPLACE FUNCTION public.get_public_food_packaging_settings()
RETURNS TABLE (food_packaging_unit_price numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(food_packaging_unit_price, 200)
  FROM public.site_settings WHERE id=1;
$$;
REVOKE ALL ON FUNCTION public.get_public_food_packaging_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_food_packaging_settings() TO anon, authenticated;

-- Replacement calculations include the original packaging snapshot in the
-- final payable amount. This keeps a product price difference independent of
-- packaging: 700 -> 1000 still produces a 300 additional obligation.
CREATE OR REPLACE FUNCTION public.recalculate_final_order_financials(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_order public.orders%ROWTYPE; v_product numeric; v_paid numeric; v_final numeric; v_due numeric; v_over numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  SELECT COALESCE(SUM(CASE WHEN NOT oi.final_removed THEN COALESCE(oi.final_price,oi.price)*oi.qty ELSE 0 END),0)
    INTO v_product FROM public.order_items oi WHERE oi.order_id=p_order_id;
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.payments
   WHERE order_id=p_order_id AND payment_type='product' AND status='success';
  SELECT v_product+COALESCE(v_order.packaging_amount,0)+COALESCE(v_order.fee,0),
         GREATEST(v_product+COALESCE(v_order.packaging_amount,0)+COALESCE(v_order.fee,0)-v_paid,0),
         GREATEST(v_paid-(v_product+COALESCE(v_order.packaging_amount,0)+COALESCE(v_order.fee,0)),0)
    INTO v_final,v_due,v_over;
  UPDATE public.orders SET original_paid_amount=v_paid,final_product_total=v_product,final_order_total=v_final,additional_amount_due=v_due,overpaid_amount=v_over,final_financial_status=CASE WHEN v_due>0 THEN 'additional_payment_required' WHEN v_over>0 THEN 'overpaid_pending_resolution' ELSE 'settled' END WHERE id=p_order_id;
END; $$;
REVOKE ALL ON FUNCTION public.recalculate_final_order_financials(uuid) FROM PUBLIC,anon,authenticated;

-- Preserve the old four-argument entry point for callers that do not yet send
-- packaging. New checkout uses the five-argument authoritative entry point.
ALTER FUNCTION public.place_order(jsonb,text,uuid,text) RENAME TO place_order_legacy;
REVOKE ALL ON FUNCTION public.place_order_legacy(jsonb,text,uuid,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb, p_spot text, p_attempt_id uuid, p_request_fingerprint text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.place_order(p_items,p_spot,p_attempt_id,p_request_fingerprint,0);
END; $$;

CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_spot text,
  p_attempt_id uuid,
  p_request_fingerprint text,
  p_packaging_quantity integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_item jsonb;
  v_vendor_count integer;
  v_restaurant_count integer;
  v_unit_price numeric(12,2);
  v_order_id uuid;
  v_result jsonb;
  v_order public.orders%ROWTYPE;
BEGIN
  IF p_packaging_quantity IS NULL OR p_packaging_quantity < 0 OR p_packaging_quantity > 10 THEN
    RAISE EXCEPTION 'packaging quantity must be between 0 and 10';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)=0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;

  SELECT count(DISTINCT p.vendor_id), count(DISTINCT p.vendor_id) FILTER (WHERE v.is_restaurant)
    INTO v_vendor_count, v_restaurant_count
    FROM jsonb_array_elements(p_items) li
    JOIN public.products p ON p.id::text=li->>'id' AND p.active=true
    JOIN public.vendors v ON v.id=p.vendor_id;
  IF v_vendor_count IS DISTINCT FROM 1 OR v_restaurant_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'restaurant checkout must contain products from one restaurant';
  END IF;

  SELECT COALESCE(food_packaging_unit_price,200) INTO v_unit_price
    FROM public.site_settings WHERE id=1;
  IF v_unit_price IS NULL THEN v_unit_price := 200; END IF;

  v_result := public.place_order_legacy(p_items,p_spot,p_attempt_id,p_request_fingerprint);
  v_order_id := (v_result->'order'->>'id')::uuid;
  SELECT * INTO v_order FROM public.orders WHERE id=v_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order could not be loaded after creation'; END IF;

  PERFORM set_config('app.order_server_update','on',true);
  UPDATE public.orders
     SET packaging_quantity=p_packaging_quantity,
         packaging_unit_price=v_unit_price,
         packaging_amount=p_packaging_quantity*v_unit_price,
         total=total+(p_packaging_quantity*v_unit_price)
   WHERE id=v_order_id;
  SELECT * INTO v_order FROM public.orders WHERE id=v_order_id;

  RETURN jsonb_build_object(
    'order',to_jsonb(v_order),
    'items',(SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id),'[]'::jsonb)
               FROM public.order_items oi WHERE oi.order_id=v_order_id)
  );
END; $$;

REVOKE ALL ON FUNCTION public.place_order(jsonb,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.place_order(jsonb,text,uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb,text,uuid,text,integer) TO authenticated;

-- Promotions remain delivery-only. Packaging is added outside the discounted
-- delivery charge and is never reduced by coupon or credit.
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
      EXIT WHEN needed<=0; take:=LEAST(needed,e.remaining_amount);
      UPDATE public.customer_credit_ledger SET remaining_amount=remaining_amount-take,status=CASE WHEN remaining_amount-take<=0 THEN 'reserved' ELSE status END WHERE id=e.id;
      INSERT INTO public.credit_reservation_allocations(reservation_id,ledger_id,amount) VALUES(r.id,e.id,take); needed:=needed-take;
    END LOOP;
    IF needed>0 THEN RAISE EXCEPTION 'credit became unavailable'; END IF;
  END IF;
  PERFORM set_config('app.order_server_update','on',true);
  UPDATE public.orders SET base_delivery_fee=fee,team_share_before_promotion=team,customer_delivery_charge=fee-discount,promotion_type=p_mode,promotion_source_id=r.source_id,promotion_discount=discount,credit_used=CASE WHEN p_mode='credit' THEN discount ELSE 0 END,promotion_reservation_id=r.id,total=subtotal+COALESCE(packaging_amount,0)+fee-discount WHERE id=o.id;
  RETURN json_build_object('reservation_id',r.id,'discount',discount,'status','reserved');
END; $$;
REVOKE ALL ON FUNCTION public.reserve_delivery_promotion(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_delivery_promotion(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_delivery_promotion(p_order_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.promotion_reservations%ROWTYPE; o public.orders%ROWTYPE; a record;
BEGIN
  SELECT * INTO r FROM public.promotion_reservations WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'reserved' THEN RETURN json_build_object('released',false,'status',COALESCE(r.status,'none')); END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF r.promotion_type='credit' THEN
    FOR a IN SELECT * FROM public.credit_reservation_allocations WHERE reservation_id=r.id LOOP
      UPDATE public.customer_credit_ledger SET remaining_amount=remaining_amount+a.amount,status=CASE WHEN expires_at IS NOT NULL AND expires_at<=now() THEN 'expired' ELSE 'available' END WHERE id=a.ledger_id;
    END LOOP;
  ELSE UPDATE public.coupon_redemptions SET status='released' WHERE order_id=p_order_id AND status='reserved'; END IF;
  UPDATE public.promotion_reservations SET status='released' WHERE id=r.id;
  IF o.id IS NOT NULL AND o.payment_status<>'success' THEN
    PERFORM set_config('app.order_server_update','on',true);
    UPDATE public.orders SET customer_delivery_charge=COALESCE(base_delivery_fee,fee),promotion_type=NULL,promotion_source_id=NULL,promotion_discount=0,credit_used=0,promotion_reservation_id=NULL,total=subtotal+COALESCE(packaging_amount,0)+COALESCE(base_delivery_fee,fee) WHERE id=o.id;
  END IF;
  RETURN json_build_object('released',true,'status','released');
END; $$;
REVOKE ALL ON FUNCTION public.release_delivery_promotion(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_delivery_promotion(uuid) TO authenticated;
