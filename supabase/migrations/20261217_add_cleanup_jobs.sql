-- ============================================================
-- 20261217_add_cleanup_jobs.sql
-- ============================================================
-- Historical schema replay only. Keep the cron extension available, but defer
-- environment-specific cleanup job activation to
-- 20270101_scheduler_environment_configuration.sql.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
