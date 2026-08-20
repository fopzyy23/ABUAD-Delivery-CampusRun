-- ============================================================
-- Dropzyy — Vendor Dashboard & Order Workflow Migration (CORRECTED v2)
-- ============================================================
-- Replaces the earlier broken versions of this file which incorrectly
-- assumed an `orders.vendor_id` column existed and/or forgot to add
-- `orders.delivery_method` before policies referenced it.
--
-- Authoritative relationship (live schema):
--   authenticated vendor
--     → profiles.vendor_id (TEXT) → vendors.id (TEXT)
--     → order_items.vendor_id (TEXT) → vendors.id
--     → orders (via order_items.order_id)
--
-- This migration NEVER creates or references orders.vendor_id.
-- Vendor order access is always derived through order_items.vendor_id.
--
-- Live schema this migration is validated against:
--   orders:      id, order_number, user_id, status, total, fee, spot,
--                created_at, rider_id
--   order_items: id, order_id, product_id, qty, price, name, icon,
--                vendor_id, created_at
--   profiles:    id, created_at, full_name, phone, hostel, email, role
--   vendors:     id, name, icon, type, rating, time, cover, open,
--                delivery_method
--   products:    id, vendor_id, name, desc, price, icon, category,
--                active, created_at
--
-- This migration creates:
--   1. profiles.vendor_id
--   2. orders.delivery_method
--   3. required vendor RLS policies
--   4. required status CHECK values
--   5. vendor product policies
--   6. Ready for pickup rider access
-- ============================================================

-- ============================================================
-- 1. Add profiles.vendor_id (the vendor's link to vendors.id).
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vendor_id text REFERENCES public.vendors(id);

-- ============================================================
-- 2. Add orders.delivery_method BEFORE any policy references it.
--    Allowed values: 'rider' (default), 'vendor_self', 'both'.
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'rider'
  CHECK (delivery_method IN ('rider','vendor_self','both'));

-- ============================================================
-- 3. Extend orders.status CHECK to include the vendor workflow statuses.
--    Drops any existing status check constraint and adds the full set.
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_status_check
      CHECK (status IN ('Order confirmed','Preparing','Ready for pickup','Rider assigned','Picked up','Delivered','Rated','Cancelled'));
  END IF;
END $$;

-- ============================================================
-- 4. Vendor order SELECT: orders containing at least one of the
--    vendor's own order_items. NEVER uses orders.vendor_id.
-- ============================================================
DROP POLICY IF EXISTS "orders_select_vendor" ON public.orders;
CREATE POLICY "orders_select_vendor" ON public.orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = orders.id
        AND oi.vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

-- ============================================================
-- 5. Vendor order UPDATE: same order_items-based scoping, plus the
--    vendor-managed status set and delivery_method choices.
-- ============================================================
DROP POLICY IF EXISTS "orders_update_vendor" ON public.orders;
CREATE POLICY "orders_update_vendor" ON public.orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = orders.id
        AND oi.vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = orders.id
        AND oi.vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
    AND status IN ('Order confirmed','Preparing','Ready for pickup','Delivered','Cancelled')
    AND delivery_method IN ('rider','vendor_self','both')
  );

-- ============================================================
-- 6. Vendor order_items SELECT: only the vendor's OWN items.
--    On a multi-vendor order, each vendor sees only their lines.
-- ============================================================
DROP POLICY IF EXISTS "order_items_select_vendor" ON public.order_items;
CREATE POLICY "order_items_select_vendor" ON public.order_items
  FOR SELECT
  USING (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
  );

-- ============================================================
-- 7. Rider pool: also expose 'Ready for pickup' rider-delivery orders.
--    vendor_self and both-pending orders stay out.
-- ============================================================
DROP POLICY IF EXISTS "orders_select_unassigned" ON public.orders;
CREATE POLICY "orders_select_unassigned" ON public.orders
  FOR SELECT
  USING (
    status IN ('Order confirmed','Ready for pickup') AND rider_id IS NULL
    AND delivery_method = 'rider'
    AND EXISTS (
      SELECT 1 FROM public.riders
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- ============================================================
-- 8. Rider claim: allow claiming 'Ready for pickup' orders too.
-- ============================================================
DROP POLICY IF EXISTS "orders_update_claim" ON public.orders;
CREATE POLICY "orders_update_claim" ON public.orders
  FOR UPDATE
  USING (
    status IN ('Order confirmed','Ready for pickup') AND rider_id IS NULL
    AND delivery_method = 'rider'
    AND EXISTS (
      SELECT 1 FROM public.riders
      WHERE user_id = auth.uid() AND status = 'approved' AND available = true
    )
  )
  WITH CHECK (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
    AND status = 'Rider assigned'
  );

-- ============================================================
-- 9. Rider order_items visibility: include 'Ready for pickup'
--    unassigned rider-delivery orders.
-- ============================================================
DROP POLICY IF EXISTS "order_items_select_rider" ON public.order_items;
CREATE POLICY "order_items_select_rider" ON public.order_items
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
    )
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE status IN ('Order confirmed','Ready for pickup') AND rider_id IS NULL
        AND delivery_method = 'rider'
        AND EXISTS (SELECT 1 FROM public.riders WHERE user_id = auth.uid() AND status = 'approved')
    )
  );

-- ============================================================
-- 10. Vendor product management (own products only).
--     products.vendor_id is valid in the live schema — kept as-is.
-- ============================================================
CREATE POLICY "products_select_vendor" ON public.products
  FOR SELECT
  USING (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
  );

CREATE POLICY "products_insert_vendor" ON public.products
  FOR INSERT
  WITH CHECK (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
  );

CREATE POLICY "products_update_vendor" ON public.products
  FOR UPDATE
  USING (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
  )
  WITH CHECK (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
  );

-- ============================================================
-- SUMMARY
-- ============================================================
-- * Rider delivery:  Order confirmed → Preparing → Ready for pickup
--                    → (rider claims) Rider assigned → Picked up → Delivered
-- * Vendor self:     Order confirmed → Preparing → Delivered
-- * Reject:          Order confirmed → Cancelled
-- * both → rider:    delivery_method = 'rider', status stays 'Order confirmed'
--                    → order enters the rider pool immediately.
-- * both → vendor_self: delivery_method = 'vendor_self', status = 'Preparing'
--                    → order stays out of the rider pool; vendor completes it.
-- * Vendor isolation: every policy derives the vendor from
--   profiles.vendor_id and matches it against order_items.vendor_id /
--   products.vendor_id. orders.vendor_id is NEVER used.
