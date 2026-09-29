-- ============================================================
-- 20261217_add_cleanup_jobs.sql
-- ============================================================
-- Adds pg_cron jobs for cleaning up expired rate-limit and admission records.
-- These tables have TTL-based retention policies and should be cleaned
-- periodically to avoid unbounded growth.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  v_secret text;
BEGIN
  -- Get the worker secret from Vault for authentication
  SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'cleanup_job_secret';

  IF NULLIF(v_secret, '') IS NULL THEN
    RAISE EXCEPTION
      'Vault secret cleanup_job_secret is required before creating cleanup cron jobs';
  END IF;

  -- Clean up expired security_rate_limits (older than 48 hours)
  -- Uses the existing cleanup_security_rate_limits() function
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-cleanup-rate-limits') THEN
    PERFORM cron.unschedule('dropzyy-cleanup-rate-limits');
  END IF;

  PERFORM cron.schedule(
    'dropzyy-cleanup-rate-limits',
    '0 3 * * *', -- Daily at 3 AM
    format($cron$
      SELECT net.http_post(
        url := 'https://cmfohldnmytmwjynqfpz.supabase.co/functions/v1/cleanup-rate-limits',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', %L
        ),
        body := '{}'::jsonb
      )
    $cron$, v_secret)
  );

  -- Clean up expired rate_limit_admissions (older than 24 hours)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-cleanup-admissions') THEN
    PERFORM cron.unschedule('dropzyy-cleanup-admissions');
  END IF;

  PERFORM cron.schedule(
    'dropzyy-cleanup-admissions',
    '0 4 * * *', -- Daily at 4 AM
    format($cron$
      SELECT net.http_post(
        url := 'https://cmfohldnmytmwjynqfpz.supabase.co/functions/v1/cleanup-admissions',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', %L
        ),
        body := '{}'::jsonb
      )
    $cron$, v_secret)
  );
END;
$$;