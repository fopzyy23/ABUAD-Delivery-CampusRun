-- Browser push subscriptions are device-scoped and never contain VAPID secrets.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%'),
  p256dh text NOT NULL,
  auth text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
DROP POLICY IF EXISTS push_subscriptions_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_own ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
  IF auth.uid() IS NULL OR p_endpoint IS NULL OR p_endpoint NOT LIKE 'https://%' OR length(p_p256dh) < 20 OR length(p_auth) < 10 THEN
    RAISE EXCEPTION 'invalid push subscription';
  END IF;
  INSERT INTO public.push_subscriptions(user_id,endpoint,p256dh,auth,user_agent,active,updated_at,last_seen_at)
  VALUES(auth.uid(),p_endpoint,p_p256dh,p_auth,left(p_user_agent,500),true,now(),now())
  ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,
    user_agent=EXCLUDED.user_agent,active=true,updated_at=now(),last_seen_at=now()
  RETURNING id INTO sid;
  RETURN sid;
END; $$;
REVOKE ALL ON FUNCTION public.upsert_push_subscription(text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_push_subscription(p_endpoint text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.push_subscriptions SET active=false,updated_at=now()
  WHERE endpoint=p_endpoint AND user_id=auth.uid();
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.deactivate_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_push_subscription(text) TO authenticated;
