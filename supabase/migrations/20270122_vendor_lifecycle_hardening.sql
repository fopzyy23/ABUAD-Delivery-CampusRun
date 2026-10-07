-- Vendor lifecycle hardening: removal is reversible and never mutates catalog
-- or historical order data.  Customer visibility is controlled by vendors.active.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.admin_set_vendor_active(p_vendor_id text, p_active boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old public.vendors%ROWTYPE;
  v_new public.vendors%ROWTYPE;
  v_active boolean := COALESCE(p_active, true);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin authorization required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.require_admin_aal2();
  IF NULLIF(trim(p_vendor_id), '') IS NULL THEN RAISE EXCEPTION 'vendor id is required'; END IF;

  SELECT * INTO v_old FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vendor not found'; END IF;

  -- Idempotent retries are safe after a successful request reached the server.
  IF v_old.active = v_active THEN RETURN to_jsonb(v_old); END IF;

  UPDATE public.vendors SET active = v_active
  WHERE id = p_vendor_id
  RETURNING * INTO v_new;

  PERFORM public._admin_audit(
    CASE WHEN v_new.active THEN 'vendor_restored_to_marketplace' ELSE 'vendor_removed_from_marketplace' END,
    'vendor', p_vendor_id, to_jsonb(v_old), to_jsonb(v_new)
  );
  RETURN to_jsonb(v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_vendor_active(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_vendor_active(text, boolean) TO authenticated;

-- This trigger is defense in depth for every client order path, including
-- SECURITY DEFINER order RPCs whose internal product insert fires it.
CREATE OR REPLACE FUNCTION public.reject_archived_vendor_order_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin()
     AND EXISTS (
       SELECT 1 FROM public.products p
       JOIN public.vendors v ON v.id = p.vendor_id
       WHERE p.id = NEW.product_id AND v.active = false
     ) THEN
    RAISE EXCEPTION 'vendor is unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aaa_reject_archived_vendor_order_item ON public.order_items;
CREATE TRIGGER aaa_reject_archived_vendor_order_item
BEFORE INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.reject_archived_vendor_order_item();

REVOKE ALL ON FUNCTION public.reject_archived_vendor_order_item() FROM PUBLIC, anon, authenticated;
