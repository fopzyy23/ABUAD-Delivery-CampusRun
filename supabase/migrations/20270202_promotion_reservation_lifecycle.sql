-- Promotion reservation lifecycle. Forward-only; preserves existing payment,
-- settlement, cancellation, RLS, and Paystack verification boundaries.

ALTER TABLE public.customer_credit_ledger ADD COLUMN IF NOT EXISTS remaining_amount numeric(12,2);
UPDATE public.customer_credit_ledger SET remaining_amount=CASE WHEN amount>0 THEN amount ELSE 0 END WHERE remaining_amount IS NULL;
ALTER TABLE public.customer_credit_ledger ALTER COLUMN remaining_amount SET DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.promotion_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  promotion_type text NOT NULL CHECK (promotion_type IN ('credit','coupon')),
  source_id uuid, discount_amount numeric(12,2) NOT NULL CHECK (discount_amount>0 AND discount_amount<=400),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','finalized','released','expired')),
  created_at timestamptz NOT NULL DEFAULT now(), finalized_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.credit_reservation_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reservation_id uuid NOT NULL REFERENCES public.promotion_reservations(id) ON DELETE CASCADE,
  ledger_id uuid NOT NULL REFERENCES public.customer_credit_ledger(id), amount numeric(12,2) NOT NULL CHECK (amount>0),
  UNIQUE(reservation_id, ledger_id)
);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promotion_reservation_id uuid REFERENCES public.promotion_reservations(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS team_share_before_promotion numeric(12,2);

ALTER TABLE public.promotion_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reservation_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY promotion_reservations_read_own ON public.promotion_reservations FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY promotion_allocations_read_own ON public.credit_reservation_allocations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.promotion_reservations r WHERE r.id=reservation_id AND r.user_id=auth.uid()));
REVOKE ALL ON public.promotion_reservations,public.credit_reservation_allocations FROM anon,authenticated;
GRANT SELECT ON public.promotion_reservations,public.credit_reservation_allocations TO authenticated;

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
    IF c.first_order_only AND EXISTS (SELECT 1 FROM public.orders x WHERE x.user_id=auth.uid() AND x.payment_status='success') THEN RAISE EXCEPTION 'coupon is first-order only'; END IF;
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
REVOKE ALL ON FUNCTION public.reserve_delivery_promotion(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.reserve_delivery_promotion(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_delivery_promotion(p_order_id uuid,p_mode text,p_coupon_code text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.reserve_delivery_promotion(p_order_id,p_mode,p_coupon_code);
END; $$;
REVOKE ALL ON FUNCTION public.apply_delivery_promotion(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.apply_delivery_promotion(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_delivery_promotion(p_order_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.promotion_reservations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.promotion_reservations WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR r.status='finalized' THEN RETURN json_build_object('finalized',false); END IF;
  IF r.status<>'reserved' THEN RETURN json_build_object('finalized',false,'status',r.status); END IF;
  IF r.promotion_type='credit' THEN UPDATE public.customer_credit_ledger l SET status='consumed' FROM public.credit_reservation_allocations a WHERE a.reservation_id=r.id AND l.id=a.ledger_id; ELSE UPDATE public.coupon_redemptions SET status='finalized',redeemed_at=now() WHERE order_id=p_order_id AND status='reserved'; END IF;
  UPDATE public.promotion_reservations SET status='finalized',finalized_at=now() WHERE id=r.id;
  RETURN json_build_object('finalized',true);
END; $$;
REVOKE ALL ON FUNCTION public.finalize_delivery_promotion(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.release_delivery_promotion(p_order_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.promotion_reservations%ROWTYPE; a record;
BEGIN
  SELECT * INTO r FROM public.promotion_reservations WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR r.status<>'reserved' THEN RETURN json_build_object('released',false); END IF;
  IF r.promotion_type='credit' THEN FOR a IN SELECT * FROM public.credit_reservation_allocations WHERE reservation_id=r.id LOOP UPDATE public.customer_credit_ledger SET remaining_amount=remaining_amount+a.amount,status=CASE WHEN expires_at IS NOT NULL AND expires_at<=now() THEN 'expired' ELSE 'available' END WHERE id=a.ledger_id; END LOOP; ELSE UPDATE public.coupon_redemptions SET status='released' WHERE order_id=p_order_id AND status='reserved'; END IF;
  UPDATE public.promotion_reservations SET status='released' WHERE id=r.id;
  RETURN json_build_object('released',true);
END; $$;
REVOKE ALL ON FUNCTION public.release_delivery_promotion(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.trg_finalize_or_release_promotion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='success' AND OLD.status IS DISTINCT FROM NEW.status THEN PERFORM public.finalize_delivery_promotion(NEW.order_id); ELSIF NEW.status IN ('failed','reversed','cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN PERFORM public.release_delivery_promotion(NEW.order_id); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_finalize_or_release_promotion ON public.payments;
CREATE TRIGGER trg_finalize_or_release_promotion AFTER UPDATE OF status ON public.payments FOR EACH ROW EXECUTE FUNCTION public.trg_finalize_or_release_promotion();

-- Admin coupon mutations require the existing AAL2 guard.
CREATE OR REPLACE FUNCTION public.admin_create_coupon(p_code text,p_type text,p_value numeric,p_starts_at timestamptz DEFAULT NULL,p_expires_at timestamptz DEFAULT NULL,p_usage_limit integer DEFAULT NULL,p_per_user_limit integer DEFAULT 1,p_first_order_only boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE id uuid; BEGIN PERFORM public.require_admin_aal2(); IF p_type NOT IN ('fixed','percentage') OR p_value<=0 OR (p_type='fixed' AND p_value>400) OR (p_type='percentage' AND p_value>100) THEN RAISE EXCEPTION 'invalid coupon'; END IF; INSERT INTO public.coupons(code,coupon_type,fixed_amount,percentage,starts_at,expires_at,usage_limit,per_user_limit,first_order_only) VALUES(upper(trim(p_code)),p_type,CASE WHEN p_type='fixed' THEN p_value END,CASE WHEN p_type='percentage' THEN p_value END,p_starts_at,p_expires_at,p_usage_limit,p_per_user_limit,p_first_order_only) RETURNING coupons.id INTO id; RETURN id; END; $$;
CREATE OR REPLACE FUNCTION public.admin_set_coupon_active(p_coupon_id uuid,p_active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN PERFORM public.require_admin_aal2(); UPDATE public.coupons SET active=p_active WHERE id=p_coupon_id; END; $$;
REVOKE ALL ON FUNCTION public.admin_create_coupon(text,text,numeric,timestamptz,timestamptz,integer,integer,boolean),public.admin_set_coupon_active(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_coupon(text,text,numeric,timestamptz,timestamptz,integer,integer,boolean),public.admin_set_coupon_active(uuid,boolean) TO authenticated;
