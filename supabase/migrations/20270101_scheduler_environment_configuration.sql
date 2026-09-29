-- Forward-only scheduler configuration.
-- Historical scheduler migrations remain untouched because they may already be
-- recorded in deployed projects. This migration removes their project-specific
-- jobs and activates replacement jobs only when Vault configuration is present.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.configure_dropzyy_scheduled_workers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_url text;
  v_cutoff_secret text;
  v_cleanup_secret text;
BEGIN
  SELECT decrypted_secret INTO v_base_url
  FROM vault.decrypted_secrets WHERE name = 'dropzyy_scheduler_base_url';
  SELECT decrypted_secret INTO v_cutoff_secret
  FROM vault.decrypted_secrets WHERE name = 'automatic_cutoff_worker_secret';
  SELECT decrypted_secret INTO v_cleanup_secret
  FROM vault.decrypted_secrets WHERE name = 'cleanup_job_secret';

  v_base_url := regexp_replace(trim(coalesce(v_base_url, '')), '/+$', '');
  IF v_base_url !~ '^https://[a-z0-9-]+\.supabase\.co$' THEN
    RAISE EXCEPTION 'Vault secret dropzyy_scheduler_base_url must be this project''s https://<project-ref>.supabase.co URL';
  END IF;
  IF NULLIF(v_cutoff_secret, '') IS NULL OR NULLIF(v_cleanup_secret, '') IS NULL THEN
    RAISE EXCEPTION 'Vault secrets automatic_cutoff_worker_secret and cleanup_job_secret are required to activate schedulers';
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-automatic-cutoff-worker') THEN
    PERFORM cron.unschedule('dropzyy-automatic-cutoff-worker');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-cleanup-rate-limits') THEN
    PERFORM cron.unschedule('dropzyy-cleanup-rate-limits');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-cleanup-admissions') THEN
    PERFORM cron.unschedule('dropzyy-cleanup-admissions');
  END IF;

  PERFORM cron.schedule(
    'dropzyy-automatic-cutoff-worker', '* * * * *',
    format('SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''apikey'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''automatic_cutoff_worker_secret'')), body := ''{}''::jsonb)',
      v_base_url || '/functions/v1/automatic-cutoff-worker')
  );
  PERFORM cron.schedule(
    'dropzyy-cleanup-rate-limits', '0 3 * * *',
    format('SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''apikey'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''cleanup_job_secret'')), body := ''{}''::jsonb)',
      v_base_url || '/functions/v1/cleanup-rate-limits')
  );
  PERFORM cron.schedule(
    'dropzyy-cleanup-admissions', '0 4 * * *',
    format('SELECT net.http_post(url := %L, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''apikey'', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ''cleanup_job_secret'')), body := ''{}''::jsonb)',
      v_base_url || '/functions/v1/cleanup-admissions')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.configure_dropzyy_scheduled_workers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_dropzyy_scheduled_workers() TO service_role;

-- Do not retain jobs that target the historical project URL. If all new
-- configuration exists, reconcile immediately; otherwise leave workers safely
-- inactive until the explicit post-migration provisioning step is run.
DO $$
DECLARE
  v_base_url text;
  v_cutoff_secret text;
  v_cleanup_secret text;
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-automatic-cutoff-worker') THEN
    PERFORM cron.unschedule('dropzyy-automatic-cutoff-worker');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-cleanup-rate-limits') THEN
    PERFORM cron.unschedule('dropzyy-cleanup-rate-limits');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dropzyy-cleanup-admissions') THEN
    PERFORM cron.unschedule('dropzyy-cleanup-admissions');
  END IF;

  SELECT decrypted_secret INTO v_base_url FROM vault.decrypted_secrets WHERE name = 'dropzyy_scheduler_base_url';
  SELECT decrypted_secret INTO v_cutoff_secret FROM vault.decrypted_secrets WHERE name = 'automatic_cutoff_worker_secret';
  SELECT decrypted_secret INTO v_cleanup_secret FROM vault.decrypted_secrets WHERE name = 'cleanup_job_secret';
  v_base_url := regexp_replace(trim(coalesce(v_base_url, '')), '/+$', '');

  IF v_base_url ~ '^https://[a-z0-9-]+\.supabase\.co$'
     AND NULLIF(v_cutoff_secret, '') IS NOT NULL
     AND NULLIF(v_cleanup_secret, '') IS NOT NULL THEN
    PERFORM public.configure_dropzyy_scheduled_workers();
  ELSE
    RAISE WARNING 'Dropzyy scheduler jobs are inactive until Vault secrets and dropzyy_scheduler_base_url are provisioned and configure_dropzyy_scheduled_workers() is run';
  END IF;
END;
$$;
