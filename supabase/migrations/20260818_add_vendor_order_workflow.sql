-- ============================================
-- Vendor Order Workflow Migration
-- ============================================
-- Adds delivery_method and vendor_id to orders,
-- vendor_id to profiles, and updates RLS policies
-- to support vendor_self and both delivery modes.
--
-- Delivery method values on orders:
--   'rider'       = order goes to the rider pool
--   'vendor_self' = vendor handles delivery (rider_id stays null)
--   'both'        = vendor decides later (self or rider)
--
-- Existing orders default to 'rider' so the current
-- restaurant → rider → customer workflow is preserved.

-- 1. Add delivery_method to orders (default 'rider' for backward compat)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'rider'
  CHECK (delivery_method IN ('rider', 'vendor_self', 'both'));

-- 2. Add vendor_id to orders (which vendor this order belongs to)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendor_id text REFERENCES public.vendors(id);

-- 3. Add vendor_id to profiles (links a user account to a vendor)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vendor_id text REFERENCES public.vendors(id);

-- ============================================
-- 4. Update RLS policies
-- ============================================

-- 4a. Rider pool: only show orders that are rider-delivery.
--     vendor_self and both (pending vendor decision) orders stay out.
DROP POLICY IF EXISTS "orders_select_unassigned" ON public.orders;
CREATE POLICY "orders_select_unassigned" ON public.orders
  FOR SELECT
  USING (
    status = 'Order confirmed' AND rider_id IS NULL
    AND delivery_method = 'rider'
    AND EXISTS (
      SELECT 1 FROM public.riders
      WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- 4b. Rider claim: only allow claiming rider-delivery orders.
DROP POLICY IF EXISTS "orders_update_claim" ON public.orders;
CREATE POLICY "orders_update_claim" ON public.orders
  FOR UPDATE
  USING (
    status = 'Order confirmed' AND rider_id IS NULL
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

-- 4c. Vendor order visibility: a vendor can see orders assigned to them.
CREATE POLICY "orders_select_vendor" ON public.orders
  FOR SELECT
  USING (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
  );

-- 4d. Vendor order updates: a vendor can update delivery_method (both → rider/vendor_self)
--     and status (Order confirmed → Delivered) on their own orders.
CREATE POLICY "orders_update_vendor" ON public.orders
  FOR UPDATE
  USING (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
  )
  WITH CHECK (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    AND status IN ('Order confirmed', 'Delivered')
    AND delivery_method IN ('rider', 'vendor_self', 'both')
  );

-- 4e. Vendor order_items visibility: a vendor can see items for their orders.
CREATE POLICY "order_items_select_vendor" ON public.order_items
  FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

-- 4f. Rider order_items: exclude vendor_self/both orders from rider-visible
--     unassigned order items.
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
      WHERE status = 'Order confirmed' AND rider_id IS NULL
        AND delivery_method = 'rider'
        AND EXISTS (SELECT 1 FROM public.riders WHERE user_id = auth.uid() AND status = 'approved')
    )
  );

-- ============================================
-- SUMMARY
-- ============================================
-- * rider vendors: unchanged — orders go to rider pool.
-- * vendor_self vendors: orders have delivery_method = 'vendor_self',
--   rider_id stays null, vendor marks delivered via vendor dashboard.
-- * both vendors: orders have delivery_method = 'both', vendor chooses
--   self delivery (→ 'vendor_self') or rider (→ 'rider' → rider pool).
-- * Customer tracking shows vendor vs rider delivery via delivery_method.
-- * Existing orders default to 'rider' — no behavior change.