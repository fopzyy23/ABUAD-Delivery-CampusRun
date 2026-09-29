-- ============================================================
-- 20261219_product_images_storage.sql
-- ============================================================
-- Object storage for product pictures (vendor dashboard + admin catalog).
--
-- WHAT THIS CREATES
--   1. bucket `product-images`:
--        * public = true            → product pictures are shown to signed-out
--          visitors on the storefront, so the bucket must be publicly
--          READABLE (the same way vendors/products rows are publicly readable).
--        * file_size_limit = 5 MB   → matches PRODUCT_IMAGE_MAX_BYTES in app.js.
--        * allowed_mime_types = jpeg / png / webp → the formats the upload UI
--          accepts are also enforced by the storage API (defence in depth:
--          the browser check is a convenience, this one is authoritative).
--   2. storage.objects RLS policies:
--        * public read of this bucket only;
--        * vendors may INSERT / UPDATE / DELETE objects ONLY inside their own
--          folder: the first path segment must equal their profiles.vendor_id
--          (the admin-assigned vendor capability) — so a vendor can never
--          touch another vendor's files, and the object path itself proves
--          ownership;
--        * admins (AAL2) may manage any object in the bucket, mirroring the
--          existing products_insert_admin / products_update_admin policies.
--
-- PATH CONVENTION (enforced by the policy, produced by app.js)
--   product-images/<vendor_id>/<timestamp>-<random>.<ext>
--   * exactly two path segments (no nesting, no traversal);
--   * the middle segment is never a client-chosen value — it comes from
--     profiles.vendor_id via assign_user_to_vendor().
--
-- NO SECRETS: uploads run as the signed-in user with the publishable (anon)
-- key; the service-role key is never used in frontend code.
--
-- ORPHANS: app.js deletes a superseded upload only when it is inside the
-- vendor's own folder AND no remaining product row (visible to that vendor)
-- still references it. Product rows that were merely DEACTIVATED keep their
-- image, so historical/hidden catalogs never lose their picture.
--
-- Idempotent: ON CONFLICT DO UPDATE + DROP POLICY IF EXISTS + CREATE POLICY.
-- Fail-safe: if the storage schema/columns are unavailable the migration only
-- raises a WARNING (the dashboard can create the bucket manually — see the
-- notes at the bottom of this file).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Create/refresh the bucket.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_has_size boolean;
  v_has_mime boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    RAISE WARNING 'storage.buckets not available — create the public bucket "product-images" from the Supabase dashboard (Storage → New bucket, public, 5 MB, image/jpeg,image/png,image/webp)';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
  ) INTO v_has_size;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types'
  ) INTO v_has_mime;

  IF v_has_size AND v_has_mime THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('product-images', 'product-images', true, 5242880,
              ARRAY['image/jpeg','image/png','image/webp'])
      ON CONFLICT (id) DO UPDATE
        SET public             = true,
            file_size_limit    = EXCLUDED.file_size_limit,
            allowed_mime_types = EXCLUDED.allowed_mime_types
    $sql$;
  ELSIF v_has_size THEN
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public, file_size_limit)
      VALUES ('product-images', 'product-images', true, 5242880)
      ON CONFLICT (id) DO UPDATE
        SET public          = true,
            file_size_limit = EXCLUDED.file_size_limit
    $sql$;
  ELSE
    EXECUTE $sql$
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('product-images', 'product-images', true)
      ON CONFLICT (id) DO UPDATE SET public = true
    $sql$;
  END IF;

  RAISE NOTICE 'bucket "product-images" ready (public read, 5 MB, jpeg/png/webp)';

END $$;

-- ------------------------------------------------------------
-- 2. storage.objects RLS (only this bucket, only these shapes).
-- ------------------------------------------------------------
-- Vendor ownership predicate, expressed once per command because
-- storage.objects policies cannot call a helper function that reads
-- profiles without the same RLS context. `name ~ '^[^/]+/[^/]+$'` keeps the
-- object exactly one folder deep, so the vendor segment is unambiguous.
--
-- Every statement runs through EXECUTE inside a GUARDED DO block: if a database
-- has no storage schema the whole section only raises a WARNING (fail-safe as
-- documented in the header) instead of failing on DROP POLICY against a
-- missing relation.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    RAISE WARNING 'storage.objects not available — storage policies were skipped';
    RETURN;
  END IF;

  EXECUTE $pol$DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects$pol$;
  EXECUTE $pol$CREATE POLICY "product_images_public_read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'product-images')$pol$;

  EXECUTE $pol$DROP POLICY IF EXISTS "product_images_vendor_insert" ON storage.objects$pol$;
  EXECUTE $pol$CREATE POLICY "product_images_vendor_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'product-images'
      AND name ~ '^[^/]+/[^/]+$'
      AND (storage.foldername(name))[1] = (
        SELECT p.vendor_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.vendor_id IS NOT NULL
      )
    )$pol$;

  EXECUTE $pol$DROP POLICY IF EXISTS "product_images_vendor_update" ON storage.objects$pol$;
  EXECUTE $pol$CREATE POLICY "product_images_vendor_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'product-images'
      AND (storage.foldername(name))[1] = (
        SELECT p.vendor_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.vendor_id IS NOT NULL
      )
    )
    WITH CHECK (
      bucket_id = 'product-images'
      AND name ~ '^[^/]+/[^/]+$'
      AND (storage.foldername(name))[1] = (
        SELECT p.vendor_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.vendor_id IS NOT NULL
      )
    )$pol$;

  EXECUTE $pol$DROP POLICY IF EXISTS "product_images_vendor_delete" ON storage.objects$pol$;
  EXECUTE $pol$CREATE POLICY "product_images_vendor_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'product-images'
      AND (storage.foldername(name))[1] = (
        SELECT p.vendor_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.vendor_id IS NOT NULL
      )
    )$pol$;
END $$;

-- Admin management: same bucket, mirroring the AAL2-gated products_admin
-- policies. The AAL2 helper only exists once 20261217_fix_aal2_policy_safety.sql
-- is applied, so the predicate is chosen at apply time (fail-safe).
DO $$
DECLARE
  v_predicate text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'objects'
  ) THEN
    RAISE WARNING 'storage.objects not available — storage policies were skipped';
    RETURN;
  END IF;

  IF to_regprocedure('public.is_admin_aal2()') IS NOT NULL THEN
    v_predicate := 'public.is_admin() AND public.is_admin_aal2()';
  ELSE
    v_predicate := 'public.is_admin()';
  END IF;

  EXECUTE 'DROP POLICY IF EXISTS "product_images_admin_all" ON storage.objects';
  EXECUTE format($fmt$
    CREATE POLICY "product_images_admin_all" ON storage.objects
      FOR ALL TO authenticated
      USING (bucket_id = 'product-images' AND (%s))
      WITH CHECK (bucket_id = 'product-images' AND (%s))
  $fmt$, v_predicate, v_predicate);

  RAISE NOTICE 'storage policy product_images_admin_all created with predicate: %', v_predicate;
END $$;

-- ------------------------------------------------------------
-- 3. MANUAL STEPS / VERIFICATION (Supabase dashboard)
-- ------------------------------------------------------------
-- a) Storage → product-images exists: public, 5 MB, image/jpeg|png|webp.
--    Upload a file as a vendor; it must land in <vendor_id>/... .
-- b) A signed-in NON-vendor (or another vendor) uploading into that folder
--    must be rejected with "new row violates row-level security policy".
-- c) Signed-out visitors must be able to load
--    /storage/v1/object/public/product-images/<vendor>/<file> (public read).
-- d) CSP: netlify.toml already allows img-src + connect-src for
--    https://cmfohldnmytmwjynqfpz.supabase.co, so uploads and rendering need
--    no policy change.
-- ============================================================
