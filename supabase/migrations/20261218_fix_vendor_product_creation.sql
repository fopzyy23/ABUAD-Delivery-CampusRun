-- ============================================================
-- 20261218_fix_vendor_product_creation.sql
-- ============================================================
-- ROOT CAUSE — "an assigned vendor cannot add a product"
-- ------------------------------------------------------------
-- The vendor dashboard assigned products.id CLIENT-SIDE:
--
--   nextVendorProductId() = max(id I can SELECT) + 1
--
-- but RLS only exposes two disjoint sets of product rows to a signed-in
-- vendor:
--   * products_select_public : active = true AND the vendor row still exists
--   * products_select_vendor : the caller's OWN products (any active flag)
--
-- An id that belongs to an INACTIVE product of ANOTHER vendor is therefore
-- invisible. As soon as such a row holds the highest id in the table — which
-- is exactly what 20261202_remove_bookshop_feature.sql did to the 16 Bookshop
-- rows (deactivated but still present) and what happens every time a vendor or
-- the admin deactivates the newest product — the computed id collides with an
-- existing primary key. The client's single "retry" re-ran
-- nextVendorProductId(), recomputed the SAME value from the SAME invisible
-- maximum and failed again, so EVERY attempt failed with:
--
--   23505 duplicate key value violates unique constraint "products_pkey"
--
-- Admin product management never hit this because its write path upserts.
--
-- FIX (authoritative, server-side)
-- --------------------------------
-- products.id becomes database-generated, so creating a product no longer
-- depends on which rows the caller is allowed to read:
--   1. create public.products_id_seq, positioned at MAX(products.id) + 1;
--   2. ALTER TABLE public.products ALTER COLUMN id SET DEFAULT nextval(...);
--   3. GRANT USAGE on the sequence to authenticated / service_role (the INSERT
--      runs as the caller's role, and sequences are not RLS-protected).
-- The legacy max+1 path stays in app.js ONLY as a fallback for a database
-- where this migration has not been applied yet (a NOT NULL violation on id is
-- read as "no server default" and the client retries with escalating ids).
--
-- Also re-asserted here (idempotent DROP + CREATE) so the vendor ownership
-- boundary is guaranteed present in every environment:
--   products_select_vendor / products_insert_vendor / products_update_vendor
--   — all derived from profiles.vendor_id (the multi-role vendor capability
--   written only by assign_user_to_vendor), never from a client-supplied value.
--
-- UNCHANGED: every existing product id, order_items.product_id reference,
-- order history, settlement, payment and transfer row. No DELETE, no data
-- rewrite, no status or price change. Vendors still have NO products DELETE
-- policy (deactivation = active = false, historical rows preserved).
-- Idempotent: safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Server-assigned product ids.
--    Fail-safe by design: if the live column is not an integer type the
--    migration only logs a warning and leaves the client fallback in charge,
--    so applying this file can never abort a deployment.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_type text;
  v_max  bigint;
  v_next bigint;
BEGIN
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'products'
    AND column_name  = 'id';

  IF v_type IS NULL THEN
    RAISE WARNING 'products.id not found — leaving client-assigned product ids in place';
    RETURN;
  END IF;

  IF v_type NOT IN ('integer', 'bigint', 'smallint') THEN
    RAISE WARNING 'products.id is % — server-assigned ids are unsupported; leaving client-assigned product ids in place', v_type;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'products_id_seq' AND c.relkind = 'S'
  ) THEN
    EXECUTE 'CREATE SEQUENCE public.products_id_seq';
  END IF;

  -- Owned by the column so it is dropped together with the table.
  EXECUTE 'ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id';

  SELECT COALESCE(MAX(id), 0) INTO v_max FROM public.products;
  v_next := GREATEST(v_max, 0) + 1;

  -- is_called = false  →  the FIRST nextval() returns exactly v_next,
  -- so ids continue seamlessly after the highest existing product id.
  PERFORM setval('public.products_id_seq', v_next, false);

  EXECUTE 'ALTER TABLE public.products ALTER COLUMN id SET DEFAULT nextval(''public.products_id_seq''::regclass)';

  RAISE NOTICE 'products.id now defaults to public.products_id_seq (next id: %)', v_next;
END $$;

-- The INSERT executes as `authenticated` (PostgREST + RLS), so that role must
-- be able to advance the sequence. RLS does not apply to sequences, no row
-- access is granted, and only the next value can be consumed.

-- ------------------------------------------------------------
-- 2. Re-assert the vendor product policies.
--    Definitions are identical to 20260922_multi_role_vendor_capability.sql
--    (vendor capability = profiles.vendor_id), re-stated here so a database
--    that skipped or partially applied an older migration still ends up with
--    the correct ownership boundary. DROP + CREATE is idempotent.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "products_select_vendor" ON public.products;
CREATE POLICY "products_select_vendor" ON public.products
  FOR SELECT
  USING (
    vendor_id IN (
      SELECT p.vendor_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.vendor_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "products_insert_vendor" ON public.products;
CREATE POLICY "products_insert_vendor" ON public.products
  FOR INSERT
  WITH CHECK (
    vendor_id IN (
      SELECT p.vendor_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.vendor_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "products_update_vendor" ON public.products;
CREATE POLICY "products_update_vendor" ON public.products
  FOR UPDATE
  USING (
    vendor_id IN (
      SELECT p.vendor_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.vendor_id IS NOT NULL
    )
  )
  WITH CHECK (
    vendor_id IN (
      SELECT p.vendor_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.vendor_id IS NOT NULL
    )
  );

-- ------------------------------------------------------------
-- 3. Report the resulting state (informational only).
-- ------------------------------------------------------------
DO $$
DECLARE
  v_default text;
  v_max     bigint;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'id';

  SELECT COALESCE(MAX(id), 0) INTO v_max FROM public.products;

  IF v_default IS NULL THEN
    RAISE NOTICE 'products.id has no server default — client fallback ids in use (highest existing id: %)', v_max;
  ELSE
    RAISE NOTICE 'vendor product creation now uses server-assigned ids (highest existing id: %)', v_max;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'products_id_seq' AND c.relkind = 'S'
  ) THEN
    EXECUTE 'GRANT USAGE ON SEQUENCE public.products_id_seq TO authenticated';
    EXECUTE 'GRANT USAGE ON SEQUENCE public.products_id_seq TO service_role';
  END IF;
END $$;
