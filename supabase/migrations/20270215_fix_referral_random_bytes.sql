-- Fix pgcrypto resolution for SECURITY DEFINER referral functions.
-- Their search_path is intentionally public, so the extension function must
-- be schema-qualified. This forward migration does not alter reward values,
-- referral ownership checks, or idempotency behavior.

CREATE OR REPLACE FUNCTION public.issue_customer_signup_reward(p_referral_code text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); code text; ref public.referral_codes%ROWTYPE; referral_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  code := upper(regexp_replace(coalesce(p_referral_code,''),'[^A-Z0-9]','','g'));
  INSERT INTO public.referral_codes(user_id,code)
  VALUES(uid,upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,8)))
  ON CONFLICT(user_id) DO NOTHING;
  IF code<>'' THEN
    SELECT rc.* INTO ref FROM public.referral_codes rc WHERE rc.code=code LIMIT 1;
    IF FOUND AND ref.user_id<>uid THEN
      INSERT INTO public.referrals(referrer_id,referred_id,referral_code)
      VALUES(ref.user_id,uid,ref.code)
      ON CONFLICT(referred_id) DO NOTHING
      RETURNING id INTO referral_id;
    END IF;
  END IF;
  INSERT INTO public.customer_credit_ledger(user_id,amount,source_type,source_id,expires_at)
  VALUES(uid,200,'signup_reward',uid,now()+interval '60 days')
  ON CONFLICT DO NOTHING;
  RETURN json_build_object('issued',true,'referral_id',referral_id);
END; $$;
REVOKE ALL ON FUNCTION public.issue_customer_signup_reward(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_customer_signup_reward(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_referral_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  INSERT INTO public.referral_codes(user_id,code)
  VALUES(auth.uid(),upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,8)))
  ON CONFLICT(user_id) DO NOTHING;
  SELECT code INTO result FROM public.referral_codes WHERE user_id=auth.uid();
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.ensure_referral_code() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code() TO authenticated;
