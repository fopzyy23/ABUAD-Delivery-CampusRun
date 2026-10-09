-- Include the selected packaging snapshot in restaurant purchase funding.
-- Packaging is a restaurant purchase cost, not rider delivery earnings or
-- delivery/team revenue.  This forward migration supersedes the prior
-- confirm_order_products implementation without editing an applied migration.

ALTER TABLE public.purchase_funding
  ADD COLUMN IF NOT EXISTS food_amount numeric NOT NULL DEFAULT 0
    CHECK (food_amount >= 0),
  ADD COLUMN IF NOT EXISTS packaging_amount numeric NOT NULL DEFAULT 0
    CHECK (packaging_amount >= 0),
  ADD COLUMN IF NOT EXISTS restaurant_purchase_amount numeric NOT NULL DEFAULT 0
    CHECK (restaurant_purchase_amount >= 0);

-- Rows created before packaging existed have no packaging component.  Preserve
-- their existing authoritative amount and make the split explicit.
UPDATE public.purchase_funding
SET food_amount = amount,
    packaging_amount = 0,
    restaurant_purchase_amount = amount
WHERE restaurant_purchase_amount = 0
  AND amount > 0;

ALTER TABLE public.purchase_funding
  DROP CONSTRAINT IF EXISTS purchase_funding_amount_split_check;
ALTER TABLE public.purchase_funding
  ADD CONSTRAINT purchase_funding_amount_split_check
  CHECK (restaurant_purchase_amount = food_amount + packaging_amount);

CREATE OR REPLACE FUNCTION public.confirm_order_products(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  rid uuid;
  fid uuid;
  n integer;
  bad integer;
  pending integer;
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
    INTO final_food_amount
    FROM public.order_items oi WHERE oi.order_id=p_order_id;

  -- Packaging only funds the restaurant when there is food to collect.  An
  -- all-removed order stays on the separate no-product/cancellation path.
  IF final_food_amount<=0 THEN
    UPDATE public.orders
       SET product_availability_status='confirmed',
           purchase_funding_status='not_required',
           products_confirmed_at=COALESCE(products_confirmed_at,now())
     WHERE id=p_order_id;
    RETURN NULL;
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
