-- Dropzyy global site settings
--
-- The table deliberately contains only settings that are safe for the
-- frontend to know. Public/anonymous reads go through get_public_site_settings;
-- direct table writes are restricted to the existing admin authorization
-- boundary (public.is_admin()).

CREATE TABLE IF NOT EXISTS public.site_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_mode boolean NOT NULL DEFAULT false,
  weekday_delivery_start time NOT NULL DEFAULT TIME '15:00',
  weekday_delivery_end time NOT NULL DEFAULT TIME '20:00',
  weekend_delivery_start time NOT NULL DEFAULT TIME '08:00',
  weekend_delivery_end time NOT NULL DEFAULT TIME '20:00',
  timezone text NOT NULL DEFAULT 'Africa/Lagos',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_delivery_hours_valid CHECK (
    weekday_delivery_start < weekday_delivery_end
    AND weekend_delivery_start < weekend_delivery_end
  ),
  CONSTRAINT site_settings_timezone_not_blank CHECK (btrim(timezone) <> '')
);

-- Keep the migration safe to re-run if the table was partially created.
ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS maintenance_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekday_delivery_start time NOT NULL DEFAULT TIME '15:00',
  ADD COLUMN IF NOT EXISTS weekday_delivery_end time NOT NULL DEFAULT TIME '20:00',
  ADD COLUMN IF NOT EXISTS weekend_delivery_start time NOT NULL DEFAULT TIME '08:00',
  ADD COLUMN IF NOT EXISTS weekend_delivery_end time NOT NULL DEFAULT TIME '20:00',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Lagos',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.site_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.site_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.site_settings TO authenticated;

DROP POLICY IF EXISTS "site_settings_select_admin" ON public.site_settings;
CREATE POLICY "site_settings_select_admin"
  ON public.site_settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "site_settings_insert_admin" ON public.site_settings;
CREATE POLICY "site_settings_insert_admin"
  ON public.site_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin() AND id = 1);

DROP POLICY IF EXISTS "site_settings_update_admin" ON public.site_settings;
CREATE POLICY "site_settings_update_admin"
  ON public.site_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin() AND id = 1);

CREATE OR REPLACE FUNCTION public.get_public_site_settings()
RETURNS TABLE (
  maintenance_mode boolean,
  weekday_delivery_start time,
  weekday_delivery_end time,
  weekend_delivery_start time,
  weekend_delivery_end time,
  timezone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.maintenance_mode,
    s.weekday_delivery_start,
    s.weekday_delivery_end,
    s.weekend_delivery_start,
    s.weekend_delivery_end,
    s.timezone
  FROM public.site_settings AS s
  WHERE s.id = 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_site_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_settings() TO anon, authenticated;

