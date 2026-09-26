-- Phase E8: invoke the bounded automatic cutoff worker every minute.
-- The worker secret must already exist in Supabase Vault as
-- `automatic_cutoff_worker_secret` and must match the Edge Function secret
-- AUTOMATIC_CUTOFF_WORKER_SECRET. This migration intentionally fails closed
-- when that precondition is missing.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_secret text;
  v_url text := 'https://cmfohldnmytmwjynqfpz.supabase.co/functions/v1/automatic-cutoff-worker';
BEGIN
  SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'automatic_cutoff_worker_secret';

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE EXCEPTION
      'Vault secret automatic_cutoff_worker_secret is required before creating the automatic cutoff scheduler';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-automatic-cutoff-worker') THEN
    PERFORM cron.unschedule('dropzyy-automatic-cutoff-worker');
  END IF;

  PERFORM cron.schedule(
    'dropzyy-automatic-cutoff-worker',
    '* * * * *',
    format($cron$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'automatic_cutoff_worker_secret')
        ),
        body := '{}'::jsonb
      )
    $cron$, v_url)
  );
END;
$$;
