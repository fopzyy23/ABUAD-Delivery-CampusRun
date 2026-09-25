-- Broadcast only maintenance-mode changes. The site_settings row remains
-- protected by its existing RLS policies and is never exposed through this
-- payload.

CREATE OR REPLACE FUNCTION public.broadcast_site_maintenance_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id = 1 AND NEW.maintenance_mode IS DISTINCT FROM OLD.maintenance_mode THEN
    PERFORM realtime.send(
      jsonb_build_object(
        'type', 'maintenance-changed',
        'maintenance_mode', NEW.maintenance_mode
      ),
      'maintenance-changed',
      'dropzyy-maintenance',
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_settings_maintenance_broadcast
  ON public.site_settings;

CREATE TRIGGER trg_site_settings_maintenance_broadcast
  AFTER UPDATE OF maintenance_mode ON public.site_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_site_maintenance_change();

