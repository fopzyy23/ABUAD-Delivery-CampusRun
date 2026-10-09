-- Phase 4 promotion hardening. Forward-only after 20270205.
-- Keeps payment success, RLS, Paystack, cancellation, and settlement authority
-- in their existing server-side paths.

-- History may contain released reservations, so the original lifetime UNIQUE
-- constraint is replaced with the invariant that actually matters: at most one
-- live reservation for an order.
ALTER TABLE public.promotion_reservations
  DROP CONSTRAINT IF EXISTS promotion_reservations_order_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS promotion_reservations_one_active_per_order
  ON public.promotion_reservations(order_id)
  WHERE status = 'reserved';

-- A replacement operation is serialized by the order row lock. It releases
-- the old live reservation and reserves exactly one new promotion in the same
-- transaction; callers cannot stack credit and coupon reservations.
CREATE OR REPLACE FUNCTION public.replace_delivery_promotion(p_order_id uuid,p_mode text,p_coupon_code text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; r public.promotion_reservations%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR o.payment_status <> 'pending' THEN RAISE EXCEPTION 'order is not eligible for promotion'; END IF;
  SELECT * INTO r FROM public.promotion_reservations WHERE order_id=o.id AND status='reserved' FOR UPDATE;
  IF FOUND THEN PERFORM public.release_delivery_promotion(o.id); END IF;
  RETURN public.reserve_delivery_promotion(o.id,p_mode,p_coupon_code);
END; $$;
REVOKE ALL ON FUNCTION public.replace_delivery_promotion(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.replace_delivery_promotion(uuid,text,text) TO authenticated;

-- Release is idempotent and restores the pre-promotion order snapshot when a
-- payment attempt fails or is abandoned. A finalized reservation is never
-- released and its historical financial snapshot remains unchanged.
CREATE OR REPLACE FUNCTION public.release_delivery_promotion(p_order_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.promotion_reservations%ROWTYPE; a record; o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.promotion_reservations WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'reserved' THEN RETURN json_build_object('released',false,'status',COALESCE(r.status,'none')); END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF r.promotion_type='credit' THEN
    FOR a IN SELECT * FROM public.credit_reservation_allocations WHERE reservation_id=r.id LOOP
      UPDATE public.customer_credit_ledger
      SET remaining_amount=remaining_amount+a.amount,
          status=CASE WHEN expires_at IS NOT NULL AND expires_at<=now() THEN 'expired' ELSE 'available' END
      WHERE id=a.ledger_id;
    END LOOP;
  ELSE
    UPDATE public.coupon_redemptions SET status='released'
    WHERE order_id=p_order_id AND status='reserved';
  END IF;
  UPDATE public.promotion_reservations SET status='released' WHERE id=r.id;
  IF o.id IS NOT NULL AND o.payment_status <> 'success' THEN
    UPDATE public.orders
    SET customer_delivery_charge=COALESCE(base_delivery_fee,fee),
        promotion_type=NULL, promotion_source_id=NULL, promotion_discount=0,
        credit_used=0, promotion_reservation_id=NULL,
        total=subtotal+COALESCE(base_delivery_fee,fee)
    WHERE id=o.id;
  END IF;
  RETURN json_build_object('released',true,'status','released');
END; $$;
REVOKE ALL ON FUNCTION public.release_delivery_promotion(uuid) FROM PUBLIC,anon,authenticated;

-- Customer-only helper for changing/removing a promotion before payment.
CREATE OR REPLACE FUNCTION public.release_my_delivery_promotion(p_order_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR o.payment_status <> 'pending' THEN RAISE EXCEPTION 'order is not eligible for promotion'; END IF;
  RETURN public.release_delivery_promotion(p_order_id);
END; $$;
REVOKE ALL ON FUNCTION public.release_my_delivery_promotion(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.release_my_delivery_promotion(uuid) TO authenticated;

-- Cancellation before the relevant payment succeeds also releases a live
-- reservation. The release function remains idempotent and refuses finalized
-- reservations, so this cannot claw back a successful payment.
CREATE OR REPLACE FUNCTION public.trg_release_promotion_on_order_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='Cancelled' AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.payment_status <> 'success'
     AND COALESCE(NEW.delivery_payment_status,'pending') <> 'success' THEN
    PERFORM public.release_delivery_promotion(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_release_promotion_on_order_cancel ON public.orders;
CREATE TRIGGER trg_release_promotion_on_order_cancel
  AFTER UPDATE OF status ON public.orders FOR EACH ROW
  EXECUTE FUNCTION public.trg_release_promotion_on_order_cancel();

-- Include every admin-visible coupon field without exposing customer identity.
DROP FUNCTION IF EXISTS public.admin_coupon_usage();
CREATE FUNCTION public.admin_coupon_usage()
RETURNS TABLE(coupon_id uuid,code text,coupon_type text,value numeric,active boolean,starts_at timestamptz,expires_at timestamptz,usage_limit integer,per_user_limit integer,first_order_only boolean,reserved_usage bigint,finalized_usage bigint,remaining_usage bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id,c.code,c.coupon_type,COALESCE(c.fixed_amount,c.percentage),c.active,c.starts_at,c.expires_at,c.usage_limit,c.per_user_limit,c.first_order_only,
    count(*) FILTER (WHERE r.status='reserved'),count(*) FILTER (WHERE r.status='finalized'),
    CASE WHEN c.usage_limit IS NULL THEN NULL ELSE GREATEST(c.usage_limit-count(*) FILTER (WHERE r.status IN ('reserved','finalized')),0) END
  FROM public.coupons c LEFT JOIN public.coupon_redemptions r ON r.coupon_id=c.id
  WHERE public.is_admin() GROUP BY c.id;
$$;
REVOKE ALL ON FUNCTION public.admin_coupon_usage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_coupon_usage() TO authenticated;

-- Explicitly retain the server-side payment trigger as the only finalizer.
-- Repeated success events are harmless because finalize_delivery_promotion
-- locks the row and returns once it is finalized.
