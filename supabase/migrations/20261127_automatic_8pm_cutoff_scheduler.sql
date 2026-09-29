-- Historical schema replay only. Environment-specific scheduler activation is
-- owned by 20270101_scheduler_environment_configuration.sql. This migration
-- intentionally does not create a cron job or contact any Supabase project.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
