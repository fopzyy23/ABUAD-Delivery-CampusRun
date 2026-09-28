-- ============================================================
-- 20261202_remove_bookshop_feature.sql
-- ============================================================
-- Dropzyy 1.0: the Bookshop feature is REMOVED. It will be rebuilt for
-- Dropzyy 2.0, so nothing Bookshop-related may appear or be usable until then.
--
-- This migration is the DATA half of the removal. The catalog seed
-- (`scripts/seed_catalog.js`) originally pushed a 'bookshop' vendor plus 16
-- Bookshop products into Supabase, and those rows may already be live. This
-- file neutralises them:
--
--   * every Bookshop product is deactivated (`products.active = false`), so
--     the catalog/storefront can never offer it from the database;
--   * the Bookshop storefront row is closed (`open = false`) and switched to
--     request-only (`is_restaurant = false`), so no paid Dropzyy order can be
--     routed to a removed vendor.
--
-- Deliberately NON-DESTRUCTIVE: no vendor, product, order, order_item,
-- settlement or payment row is deleted, so historic orders that reference the
-- Bookshop keep resolving and the audit trail is preserved.
--
-- Fail-closed by design: the deployed application ALSO strips anything
-- Bookshop-shaped from every catalog read (`assets/js/app.js` and
-- `assets/js/admin.js` → stripBookshop()), so the feature cannot reappear even
-- before this migration is applied.
--
-- Idempotent: plain UPDATEs with fixed predicates — safe to re-run.
--
-- NOTE on vendor ACCOUNTS: `profiles.role` / `profiles.vendor_id` are
-- trigger-guarded and may only be changed by an authenticated admin
-- (20260922_multi_role_vendor_capability.sql), so this migration intentionally
-- does not touch them. An account still linked to the Bookshop storefront is
-- blocked from the vendor dashboard by the application gate, and an admin can
-- unassign it from Admin → Vendors → Assign Vendor.
-- ============================================================

-- 1. Deactivate every Bookshop product. Matches the seeded vendor id as well as
--    the retired 'Bookshop' category, so a hand-created row is covered too.
UPDATE public.products
SET active = false
WHERE vendor_id IN ('bookshop', 'campus-bookshop')
   OR lower(btrim(coalesce(category, ''))) = 'bookshop';

-- 2. Close the Bookshop storefront(s) and make them request-only, so the store
--    can never be reopened by accident and no payment can be taken for it.
UPDATE public.vendors
SET open = false,
    is_restaurant = false
WHERE id IN ('bookshop', 'campus-bookshop')
   OR lower(btrim(coalesce(type, ''))) = 'bookshop';

-- 3. Report the outcome (notice/warning only — never fails the migration, so a
--    database that never had Bookshop rows stays green).
DO $$
DECLARE
  v_active_products integer;
  v_open_vendors integer;
BEGIN
  SELECT count(*) INTO v_active_products
  FROM public.products
  WHERE active IS TRUE
    AND (vendor_id IN ('bookshop', 'campus-bookshop')
         OR lower(btrim(coalesce(category, ''))) = 'bookshop');

  SELECT count(*) INTO v_open_vendors
  FROM public.vendors
  WHERE open IS TRUE
    AND (id IN ('bookshop', 'campus-bookshop')
         OR lower(btrim(coalesce(type, ''))) = 'bookshop');

  IF v_active_products = 0 AND v_open_vendors = 0 THEN
    RAISE NOTICE 'Bookshop removal complete: no active Bookshop product and no open Bookshop storefront remains.';
  ELSE
    RAISE WARNING 'Bookshop removal incomplete: % active Bookshop product(s), % open Bookshop storefront(s) still flagged.',
      v_active_products, v_open_vendors;
  END IF;
END $$;
