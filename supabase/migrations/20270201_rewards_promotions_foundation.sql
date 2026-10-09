-- Dropzyy rewards, referrals, promotional credit, and delivery promotions.
-- Forward-only foundation. Customer financial mutations are SECURITY DEFINER
-- RPCs; direct client writes are not granted.

CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE CHECK (code = upper(code) AND code ~ '^[A-Z0-9]{6,12}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code text NOT NULL REFERENCES public.referral_codes(code),
  status text NOT NULL DEFAULT 'attributed' CHECK (status IN ('attributed','qualified','rewarded','rejected')),
  qualifying_order_id uuid,
  reward_ledger_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  qualified_at timestamptz,
  UNIQUE(referrer_id, referred_id)
);

CREATE TABLE IF NOT EXISTS public.customer_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  source_type text NOT NULL CHECK (source_type IN ('signup_reward','referral_reward','promotion_debit','promotion_release','adjustment')),
  source_id uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','consumed','expired','released')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_signup_reward_per_user ON public.customer_credit_ledger(user_id) WHERE source_type='signup_reward' AND amount > 0;
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_reward_per_source ON public.customer_credit_ledger(source_id) WHERE source_type='referral_reward' AND amount > 0;

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code=upper(code) AND code ~ '^[A-Z0-9_-]{3,40}$'),
  coupon_type text NOT NULL CHECK (coupon_type IN ('fixed','percentage')),
  fixed_amount numeric(12,2) CHECK (fixed_amount IS NULL OR fixed_amount >= 0),
  percentage numeric(5,2) CHECK (percentage IS NULL OR percentage > 0 AND percentage <= 100),
  max_discount numeric(12,2) CHECK (max_discount IS NULL OR max_discount >= 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer CHECK (usage_limit IS NULL OR usage_limit > 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0),
  first_order_only boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((coupon_type='fixed' AND fixed_amount IS NOT NULL AND percentage IS NULL) OR (coupon_type='percentage' AND percentage IS NOT NULL AND fixed_amount IS NULL)),
  CHECK (fixed_amount IS NULL OR fixed_amount <= 400),
  CHECK (max_discount IS NULL OR max_discount <= 400)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), coupon_id uuid NOT NULL REFERENCES public.coupons(id), user_id uuid NOT NULL REFERENCES auth.users(id), order_id uuid NOT NULL REFERENCES public.orders(id), discount_amount numeric(12,2) NOT NULL CHECK (discount_amount >= 0), status text NOT NULL CHECK (status IN ('reserved','finalized','released')), created_at timestamptz NOT NULL DEFAULT now(), redeemed_at timestamptz,
  UNIQUE(coupon_id, order_id)
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS base_delivery_fee numeric(12,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_delivery_charge numeric(12,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promotion_type text CHECK (promotion_type IS NULL OR promotion_type IN ('credit','coupon'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promotion_source_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promotion_discount numeric(12,2) NOT NULL DEFAULT 0 CHECK (promotion_discount >= 0 AND promotion_discount <= 400);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS credit_used numeric(12,2) NOT NULL DEFAULT 0 CHECK (credit_used >= 0);

ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_qualifying_order_fk;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_qualifying_order_fk FOREIGN KEY (qualifying_order_id) REFERENCES public.orders(id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY referral_codes_read_own ON public.referral_codes FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY referrals_read_participant ON public.referrals FOR SELECT TO authenticated USING (referrer_id=auth.uid() OR referred_id=auth.uid());
CREATE POLICY credit_read_own ON public.customer_credit_ledger FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY coupon_redemptions_read_own ON public.coupon_redemptions FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY coupons_read_active ON public.coupons FOR SELECT TO authenticated USING (active=true);
REVOKE ALL ON public.referral_codes,public.referrals,public.customer_credit_ledger,public.coupons,public.coupon_redemptions FROM anon,authenticated;
GRANT SELECT ON public.referral_codes,public.referrals,public.customer_credit_ledger,public.coupons,public.coupon_redemptions TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_customer_signup_reward(p_referral_code text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); code text; ref public.referral_codes%ROWTYPE; referral_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  code := upper(regexp_replace(coalesce(p_referral_code,''),'[^A-Z0-9]','','g'));
  INSERT INTO public.referral_codes(user_id,code) VALUES(uid,substr(encode(gen_random_bytes(8),'hex'),1,8)) ON CONFLICT(user_id) DO NOTHING;
  IF code<>'' THEN
    SELECT rc.* INTO ref FROM public.referral_codes rc WHERE rc.code=code LIMIT 1;
    IF FOUND AND ref.user_id<>uid THEN
      INSERT INTO public.referrals(referrer_id,referred_id,referral_code) VALUES(ref.user_id,uid,ref.code) ON CONFLICT(referred_id) DO NOTHING RETURNING id INTO referral_id;
    END IF;
  END IF;
  INSERT INTO public.customer_credit_ledger(user_id,amount,source_type,source_id,expires_at) VALUES(uid,200,'signup_reward',uid,now()+interval '60 days') ON CONFLICT DO NOTHING;
  RETURN json_build_object('issued',true,'referral_id',referral_id);
END; $$;
REVOKE ALL ON FUNCTION public.issue_customer_signup_reward(text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.issue_customer_signup_reward(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_referral_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  INSERT INTO public.referral_codes(user_id,code) VALUES(auth.uid(),substr(encode(gen_random_bytes(8),'hex'),1,8)) ON CONFLICT(user_id) DO NOTHING;
  SELECT code INTO result FROM public.referral_codes WHERE user_id=auth.uid();
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_referral_code() FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.ensure_referral_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.qualify_referral_on_delivery(p_order_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; r public.referrals%ROWTYPE; lid uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status NOT IN ('Delivered','Rated') THEN RETURN json_build_object('rewarded',false); END IF;
  SELECT * INTO r FROM public.referrals WHERE referred_id=o.user_id AND status='attributed' FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('rewarded',false); END IF;
  INSERT INTO public.customer_credit_ledger(user_id,amount,source_type,source_id,expires_at) VALUES(r.referrer_id,100,'referral_reward',r.id,now()+interval '60 days') ON CONFLICT DO NOTHING RETURNING id INTO lid;
  UPDATE public.referrals SET status='rewarded',qualifying_order_id=p_order_id,reward_ledger_id=COALESCE(reward_ledger_id,lid),qualified_at=COALESCE(qualified_at,now()) WHERE id=r.id;
  RETURN json_build_object('rewarded',true,'referral_id',r.id);
END; $$;
REVOKE ALL ON FUNCTION public.qualify_referral_on_delivery(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.trg_qualify_referral_after_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('Delivered','Rated') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.qualify_referral_on_delivery(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_qualify_referral_after_delivery ON public.orders;
CREATE TRIGGER trg_qualify_referral_after_delivery AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_qualify_referral_after_delivery();

CREATE OR REPLACE FUNCTION public.apply_delivery_promotion(p_order_id uuid,p_mode text,p_coupon_code text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; fee numeric; discount numeric:=0; c public.coupons%ROWTYPE; available numeric; entry record; remaining numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR o.payment_status<>'pending' THEN RAISE EXCEPTION 'order is not eligible for promotion'; END IF;
  IF p_mode NOT IN ('credit','coupon') THEN RAISE EXCEPTION 'invalid promotion mode'; END IF;
  IF o.promotion_type IS NOT NULL THEN RAISE EXCEPTION 'one promotion per order'; END IF;
  fee:=COALESCE(o.fee,0); IF fee<=0 THEN RAISE EXCEPTION 'order has no delivery fee'; END IF;
  IF p_mode='coupon' THEN
    SELECT * INTO c FROM public.coupons WHERE code=upper(trim(p_coupon_code)) FOR UPDATE;
    IF NOT FOUND OR NOT c.active OR (c.starts_at IS NOT NULL AND now()<c.starts_at) OR (c.expires_at IS NOT NULL AND now()>=c.expires_at) THEN RAISE EXCEPTION 'coupon is not eligible'; END IF;
    IF c.coupon_type='fixed' THEN discount:=c.fixed_amount; ELSE discount:=fee*c.percentage/100; END IF;
    discount:=LEAST(discount,400,fee-COALESCE(o.rider_delivery_share,0)-100);
    IF discount<0 THEN discount:=0; END IF;
    INSERT INTO public.coupon_redemptions(coupon_id,user_id,order_id,discount_amount,status) VALUES(c.id,auth.uid(),o.id,discount,'reserved') ON CONFLICT(coupon_id,order_id) DO UPDATE SET discount_amount=EXCLUDED.discount_amount;
    UPDATE public.orders SET base_delivery_fee=fee,customer_delivery_charge=fee-discount,promotion_type='coupon',promotion_source_id=c.id,promotion_discount=discount,total=subtotal+fee-discount WHERE id=o.id;
  ELSE
    SELECT COALESCE(SUM(amount) FILTER (WHERE status='available' AND (expires_at IS NULL OR expires_at>now())),0) INTO available FROM public.customer_credit_ledger WHERE user_id=auth.uid();
    discount:=LEAST(available,400,fee-COALESCE(o.rider_delivery_share,0)-100);
    IF discount<=0 THEN RAISE EXCEPTION 'no promotional credit available'; END IF;
    INSERT INTO public.customer_credit_ledger(user_id,amount,source_type,source_id,expires_at,status) VALUES(auth.uid(),-discount,'promotion_debit',o.id,now(),'reserved');
    UPDATE public.orders SET base_delivery_fee=fee,customer_delivery_charge=fee-discount,promotion_type='credit',promotion_source_id=o.id,promotion_discount=discount,credit_used=discount,total=subtotal+fee-discount WHERE id=o.id;
  END IF;
  RETURN json_build_object('discount',discount,'total',o.subtotal+fee-discount);
END; $$;
REVOKE ALL ON FUNCTION public.apply_delivery_promotion(uuid,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.apply_delivery_promotion(uuid,text,text) TO authenticated;
