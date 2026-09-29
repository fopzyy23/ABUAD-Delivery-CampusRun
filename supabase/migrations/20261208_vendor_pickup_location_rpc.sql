-- ============================================================
-- 20261208_vendor_pickup_location_rpc.sql
-- ============================================================
-- Adds a secure RPC for vendors to set their pickup location.
--
-- The pickup_location column exists on vendors (20261006_vendor_foundation)
-- but there was no RPC to update it. The set_vendor_delivery_method RPC
-- requires pickup_location to be set before allowing rider delivery,
-- but vendors had no way to configure it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_vendor_pickup_location(
  p_pickup_location text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_id text;
  v_vendor public.vendors%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT vendor_id INTO v_vendor_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'you are not linked to a vendor account';
  END IF;

  -- Sanitize input: trim and limit length
  IF p_pickup_location IS NOT NULL THEN
    p_pickup_location := trim(p_pickup_location);
    IF length(p_pickup_location) > 500 THEN
      RAISE EXCEPTION 'pickup location cannot exceed 500 characters';
    END IF;
    IF p_pickup_location = '' THEN
      p_pickup_location := NULL;
    END IF;
  END IF;

  UPDATE public.vendors
  SET pickup_location = p_pickup_location
  WHERE id = v_vendor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'vendor not found';
  END IF;

  SELECT * INTO v_vendor FROM public.vendors WHERE id = v_vendor_id;

  RETURN jsonb_build_object(
    'success', true,
    'vendor_id', v_vendor.id,
    'pickup_location', v_vendor.pickup_location
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_vendor_pickup_location(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_vendor_pickup_location(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_vendor_pickup_location(text) FROM PUBLIC;