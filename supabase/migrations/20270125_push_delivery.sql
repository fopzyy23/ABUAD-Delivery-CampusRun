-- Best-effort push delivery audit. Persistent notifications remain authoritative.
CREATE TABLE IF NOT EXISTS public.push_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','retryable','expired','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(notification_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS push_delivery_jobs_ready_idx ON public.push_delivery_jobs(status, available_at);
CREATE INDEX IF NOT EXISTS push_delivery_jobs_notification_idx ON public.push_delivery_jobs(notification_id);
ALTER TABLE public.push_delivery_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_delivery_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.queue_notification_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.push_delivery_jobs(notification_id, subscription_id)
  SELECT NEW.id, s.id FROM public.push_subscriptions s
  WHERE s.user_id=NEW.user_id AND s.active=true
  ON CONFLICT (notification_id, subscription_id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_queue_notification_push ON public.notifications;
CREATE TRIGGER trg_queue_notification_push AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.queue_notification_push();

CREATE OR REPLACE FUNCTION public.claim_push_delivery_job(p_job_id uuid)
RETURNS public.push_delivery_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.push_delivery_jobs;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service role required'; END IF;
  UPDATE public.push_delivery_jobs SET status='processing', attempts=attempts+1, claimed_at=now(), updated_at=now()
  WHERE id=p_job_id AND status IN ('pending','retryable') AND available_at<=now() AND attempts<5
  RETURNING * INTO j;
  IF j.id IS NULL THEN RAISE EXCEPTION 'push job is not claimable'; END IF;
  RETURN j;
END; $$;
REVOKE ALL ON FUNCTION public.claim_push_delivery_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_push_delivery_job(uuid) TO service_role;
