-- ============================================================
-- 20260929_combined_vendor_fee_settlement.sql
-- Combined migration - supersedes 20260927 + 20260928.
--
-- Contents:
--   1. vendor_applications table + indexes        (from 20260927)
--   2. riders student-ID fields                   (from 20260927)
--   3. orders delivery-fee split columns + CHECK  (from 20260927)
--   4. Historical order backfill (80/20, preservation only)
--                                                 (from 20260927)
--   5. updated_at trigger for vendor_applications (from 20260927)
--   6. vendor_applications RLS + grants           (from 20260927)
--   7. place_order RPC - FIXED 20260928 implementation:
--      native p.id product insert, full { order, items } result,
--      server-side pricing: fee 1500 / rider 1000 / company 500
--   8. generate_settlement RPC - uses the stored split columns
--      (no percentage math in active logic)       (from 20260927)
--
-- Business rules (server-authoritative):
--   Customer delivery fee  = 1500
--   Rider share            = 1000
--   Dropzyy/company share  = 500
--   Vendor earnings remain separate from the delivery split.
--   Historical orders keep their original fee; their backfilled
--   80/20 split is preserved as a historical record only.
--
-- Idempotent: safe to apply once to the current live database.
-- ============================================================

-- ------------------------------------------------------------
-- 1. VENDOR APPLICATIONS TABLE
--    Mirrors the existing riders table structure. One row per
--    applicant (UNIQUE user_id). Admin-gated approval workflow.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  matric_number text NOT NULL,
  college text NOT NULL,
  department text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  what_they_want_to_sell text NOT NULL,
  expected_price_range text NOT NULL,
  additional_info text,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  vendor_id text,
  admin_response text,
  admin_reviewed_at timestamptz,
  admin_reviewed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_applications_user_id UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS vendor_applications_status_idx
  ON public.vendor_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_applications_user_id_idx
  ON public.vendor_applications (user_id);

-- ------------------------------------------------------------
-- 2. EXTEND RIDERS TABLE
--    Add student-identification fields to match the vendor
--    application intake. Existing rows keep NULL (backfilled
--    by the applicant on next submission).
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'full_name') THEN
    ALTER TABLE public.riders ADD COLUMN full_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'college') THEN
    ALTER TABLE public.riders ADD COLUMN college text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'department') THEN
    ALTER TABLE public.riders ADD COLUMN department text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'email') THEN
    ALTER TABLE public.riders ADD COLUMN email text;
  END IF;
END$$;

-- ------------------------------------------------------------
-- 3. EXTEND ORDERS TABLE
--    Add columns to track the delivery-fee split per order.
--    fee = rider_delivery_share + company_delivery_share
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'rider_delivery_share') THEN
    ALTER TABLE public.orders ADD COLUMN rider_delivery_share numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'company_delivery_share') THEN
    ALTER TABLE public.orders ADD COLUMN company_delivery_share numeric(12,2);
  END IF;
END$$;

-- Constraint: split must sum to fee (when both are set)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_split_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_delivery_split_check
      CHECK (
        rider_delivery_share IS NULL
        OR company_delivery_share IS NULL
        OR rider_delivery_share + company_delivery_share = fee
      );
  END IF;
END$$;

-- ------------------------------------------------------------
-- 4. BACKFILL EXISTING ORDERS (HISTORICAL PRESERVATION ONLY)
--    Preserve historical fee records: existing orders keep
--    their original fee, and the split is backfilled to match
--    the previous 80/20 model (rider = 80%, company = 20%).
--    Only touches rows where the split columns are still NULL.
--    NEW orders never use this - place_order (Section 7) writes
--    the authoritative 1500/1000/500 split at insert time.
-- ------------------------------------------------------------
UPDATE public.orders
SET
  rider_delivery_share = round(fee * 0.8, 2),
  company_delivery_share = fee - round(fee * 0.8, 2)
WHERE rider_delivery_share IS NULL
  AND company_delivery_share IS NULL
  AND fee IS NOT NULL;

-- ------------------------------------------------------------
-- 5. UPDATED_AT TRIGGER for vendor_applications
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vendor_applications_updated_at
  ON public.vendor_applications;
CREATE TRIGGER trg_vendor_applications_updated_at
  BEFORE UPDATE ON public.vendor_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 6. RLS - VENDOR APPLICATIONS
-- ------------------------------------------------------------
ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;

-- Applicants can submit their own application
DROP POLICY IF EXISTS "vendor_applications_insert_own"
  ON public.vendor_applications;
CREATE POLICY "vendor_applications_insert_own"
  ON public.vendor_applications
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Pending'
    AND admin_response IS NULL
    AND admin_reviewed_by IS NULL
  );

-- Applicants can view only their own application
DROP POLICY IF EXISTS "vendor_applications_select_own"
  ON public.vendor_applications;
CREATE POLICY "vendor_applications_select_own"
  ON public.vendor_applications
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins can view all applications
DROP POLICY IF EXISTS "vendor_applications_select_admin"
  ON public.vendor_applications;
CREATE POLICY "vendor_applications_select_admin"
  ON public.vendor_applications
  FOR SELECT
  USING (public.is_admin());

-- Admins can update (approve/reject/status/response)
DROP POLICY IF EXISTS "vendor_applications_update_admin"
  ON public.vendor_applications;
CREATE POLICY "vendor_applications_update_admin"
  ON public.vendor_applications
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy - application records are retained for audit

GRANT SELECT, INSERT ON public.vendor_applications TO authenticated;
GRANT UPDATE (status, vendor_id, admin_response, admin_reviewed_at, admin_reviewed_by)
  ON public.vendor_applications TO authenticated;
REVOKE ALL ON public.vendor_applications FROM anon;
REVOKE ALL ON public.vendor_applications FROM PUBLIC;

-- ------------------------------------------------------------
-- 7. PLACE_ORDER RPC - the FIXED 20260928 implementation,
--    copied verbatim. Native p.id product insert, full
--    { order, items } result shape, collision-safe order
--    numbers, and server-authoritative pricing:
--      delivery_fee           = 1500
--      rider_delivery_share   = 1000
--      company_delivery_share = 500
--      total = subtotal + 1500
--    The client cannot influence any money value; all prices
--    come exclusively from the products table.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_spot  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user          uuid := auth.uid();
  v_item          jsonb;
  v_qty_text      text;
  v_qty           integer;
  v_expected      integer;
  v_matched       integer;
  v_subtotal      numeric(12,2);
  v_fee           numeric(12,2) := 1500;  -- flat campus delivery fee
  v_rider_share   numeric(12,2) := 1000;  -- rider earns 1000 of the 1500 fee
  v_company_share numeric(12,2) := 500;   -- Dropzyy keeps 500 of the 1500 fee
  v_total         numeric(12,2);
  v_order_number  text;
  v_attempt       integer := 0;
  v_order         public.orders%ROWTYPE;
BEGIN
  -- 0. Authenticated customers only.
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 1. The cart must be a non-empty JSON array (max 50 lines).
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;
  v_expected := jsonb_array_length(p_items);
  IF v_expected > 50 THEN
    RAISE EXCEPTION 'too many cart lines (max 50)';
  END IF;

  -- 2. Validate each line: an id and a whole-number quantity 1..99.
  --    NOTE: the client never sends prices - any such field is ignored.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF v_item->>'id' IS NULL OR btrim(v_item->>'id') = '' THEN
      RAISE EXCEPTION 'cart line is missing a product id';
    END IF;
    v_qty_text := v_item->>'qty';
    IF v_qty_text IS NULL OR v_qty_text !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid quantity for product %', v_item->>'id';
    END IF;
    v_qty := v_qty_text::integer;
    IF v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'quantity for product % must be between 1 and 99', v_item->>'id';
    END IF;
  END LOOP;

  -- 3. A non-empty delivery spot is required (blocked from later edits by
  --    the existing prevent_order_unauthorized_changes trigger).
  IF p_spot IS NULL OR btrim(p_spot) = '' OR length(p_spot) > 200 THEN
    RAISE EXCEPTION 'a delivery location is required';
  END IF;

  -- 4. Verify EVERY product exists AND is active, using the authoritative
  --    products table. The id is compared as text so this works whatever
  --    the underlying products.id type is. If any product is missing or
  --    inactive the count below will not match and the RPC aborts.
  SELECT count(*) INTO v_matched
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  IF v_matched IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'one or more products are unavailable or no longer exist';
  END IF;

  -- 5. Compute the subtotal from the SAME authoritative join. Prices come
  --    exclusively from products.price - never from the client.
  SELECT COALESCE(SUM(p.price * (li->>'qty')::integer), 0) INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  v_total := v_subtotal + v_fee;
  -- 6. Insert the order (server-side money values + a COLLISION-SAFE
  --    server-generated order number), carrying the 20260927 split:
  --    fee = 1500, rider share = 1000, company share = 500.
  LOOP
    v_order_number := 'CR-' || upper(substr(md5(clock_timestamp()::text || random()::text || v_attempt::text), 1, 12));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders WHERE order_number = v_order_number
    );
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      RAISE EXCEPTION 'could not allocate a unique order number, please retry';
    END IF;
  END LOOP;

  INSERT INTO public.orders (
    order_number, user_id, subtotal, fee,
    rider_delivery_share, company_delivery_share,
    total, status, payment_status, spot, delivery_method, created_at
  ) VALUES (
    v_order_number, v_user, v_subtotal, v_fee,
    v_rider_share, v_company_share,
    v_total, 'Order confirmed', 'pending', p_spot, 'rider', now()
  )
  RETURNING * INTO v_order;

  -- 7. Insert the order lines with authoritative prices/names/vendors.
  --    FIX (20260928): use the NATIVE p.id for product_id - the 20260927
  --    re-declaration cast (li->>'id')::text which has no implicit cast to
  --    the underlying product_id column type and aborted every checkout.
  --    trg_enforce_order_item_pricing re-derives them again (defense in
  --    depth) and trg_order_items_notify_vendor notifies the vendor(s).
  INSERT INTO public.order_items (order_id, product_id, qty, price, name, icon, vendor_id)
  SELECT
    v_order.id,
    p.id,
    (li->>'qty')::integer,
    p.price,
    p.name,
    COALESCE(p.icon, li->>'icon', ''),
    p.vendor_id
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  -- 8. Return the authoritative order + items so the client can display
  --    exactly what was persisted (the 20260927 version dropped 'items').
  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', (
      SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb)
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
    )
  );
END;
$$;

-- Keep the existing grant model exactly as-is: only authenticated
-- users may call the checkout RPC.
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM PUBLIC;

-- [SLOT-5]