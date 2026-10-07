-- Automatically dispatch queued Web Push notifications.
-- Environment-specific URL and authentication secret are stored in Vault.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_base_url text;
  v_dispatcher_secret text;
  v_existing_job_id bigint;
BEGIN
  -- Fail closed if the environment has not been configured.
  SELECT decrypted_secret
  INTO v_base_url
  FROM vault.decrypted_secrets
  WHERE name = 'dropzyy_scheduler_base_url';

  IF COALESCE(v_base_url, '') = '' THEN
    RAISE EXCEPTION
      'Vault secret dropzyy_scheduler_base_url is required';
  END IF;

  SELECT decrypted_secret
  INTO v_dispatcher_secret
  FROM vault.decrypted_secrets
  WHERE name = 'push_dispatcher_secret';

  IF COALESCE(v_dispatcher_secret, '') = '' THEN
    RAISE EXCEPTION
      'Vault secret push_dispatcher_secret is required';
  END IF;

  -- Replay-safe: remove an older copy of this cron job first.
  SELECT jobid
  INTO v_existing_job_id
  FROM cron.job
  WHERE jobname = 'dropzyy-push-dispatcher'
  LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_existing_job_id);
  END IF;

  -- Process waiting push jobs every minute.
  PERFORM cron.schedule(
    'dropzyy-push-dispatcher',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url :=
          rtrim(
            (
              SELECT decrypted_secret
              FROM vault.decrypted_secrets
              WHERE name = 'dropzyy_scheduler_base_url'
            ),
            '/'
          ) || '/functions/v1/push-dispatcher',

        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-dropzyy-push-secret',
          (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'push_dispatcher_secret'
          )
        ),

        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
    $cron$
  );
END
$$;