-- ============================================================
-- 20261006_vendor_foundation.sql
-- Vendor System Database Foundation
-- ============================================================
-- Minimal safe schema changes to support Vendor order requests
-- as distinct from Restaurant orders (which use Paystack).
--
-- Vendor products: customer submits request -> vendor contacts customer -> private payment
-- Restaurant orders: existing Dropzyy/Paystack flow unchanged
-- ============================================================

-- ------------------------------------------------------------
-- 1. VENDOR PICKUP LOCATION
-- ------------------------------------------------------------
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS pickup_location text;

COMMENT ON COLUMN public.vendors.pickup_location IS 'Vendor normal pickup/dispatch location for rider delivery requests';

-- ------------------------------------------------------------
-- 2. RESTAURANT SEPARATION FLAG
-- ------------------------------------------------------------
-- Smallest safe change: boolean flag on existing vendors table
-- All existing vendors default to true (restaurant) to preserve behavior
-- Admin will set to false for new Vendor accounts
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_restaurant boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.vendors.is_restaurant IS 'true = restaurant (Paystack flow), false = vendor (private payment + request flow)';

-- ------------------------------------------------------------
-- 3. ORDER REQUEST TYPE
-- ------------------------------------------------------------
-- Distinguishes restaurant orders (Paystack) from vendor requests (private payment)
-- Default 'restaurant' preserves all existing orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'restaurant'
  CHECK (request_type IN ('restaurant', 'vendor_request'));

COMMENT ON COLUMN public.orders.request_type IS 'restaurant = Paystack flow, vendor_request = customer submits request, vendor arranges payment privately';

-- ------------------------------------------------------------
-- 4. VENDOR REQUEST PAYMENT STATUS
-- ------------------------------------------------------------
-- Add 'pending_vendor' to payment_status CHECK constraint
-- This clearly marks vendor requests as unpaid and distinct from paid restaurant orders
-- Existing payment/refund/settlement logic checks for 'success' - pending_vendor is NOT 'success'
DO $$
DECLARE
  v_definition text;
BEGIN
  -- Inspect the specifically named constraint.  Keep it when it already
  -- permits every value required by this migration; replace it only when its
  -- definition is incomplete.  This avoids both duplicate-name failures and
  -- leaving an older definition in place.
  SELECT pg_get_constraintdef(oid)
    INTO v_definition
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_payment_status_check'
    AND contype = 'c';

  IF v_definition IS NULL THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('pending', 'success', 'failed', 'refunded', 'pending_vendor'));
  ELSIF NOT (
    v_definition ILIKE '%pending%'
    AND v_definition ILIKE '%success%'
    AND v_definition ILIKE '%failed%'
    AND v_definition ILIKE '%refunded%'
    AND v_definition ILIKE '%pending_vendor%'
  ) THEN
    ALTER TABLE public.orders
      DROP CONSTRAINT orders_payment_status_check;
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_status_check
      CHECK (payment_status IN ('pending', 'success', 'failed', 'refunded', 'pending_vendor'));
  END IF;
END $$;

COMMENT ON COLUMN public.orders.payment_status IS 'pending_vendor = vendor request (no Paystack payment); vendor contacts customer for private payment';

-- ------------------------------------------------------------
-- 5. VENDOR DELIVERY REQUEST FLAG
-- ------------------------------------------------------------
-- Indicates vendor has explicitly requested a Dropzyy rider for a vendor_request order
-- This is SEPARATE from payment_status - vendor product payment stays private
-- Only meaningful when request_type = 'vendor_request' AND delivery_method = 'rider'
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendor_delivery_requested boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.vendor_delivery_requested IS 'true = vendor requested Dropzyy rider for this vendor_request order; rider delivery fee applies (1500)';

-- Protect the vendor delivery request flag from direct vendor/RLS updates.
CREATE OR REPLACE FUNCTION public.prevent_vendor_delivery_flag_bypass()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin()
     OR OLD.vendor_delivery_requested = NEW.vendor_delivery_requested
     OR current_setting('app.vendor_delivery_server_update', true) = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'vendor_delivery_requested may only be changed by an authorized server operation';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_vendor_delivery_flag_bypass ON public.orders;
CREATE TRIGGER trg_prevent_vendor_delivery_flag_bypass
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_vendor_delivery_flag_bypass();

-- ------------------------------------------------------------
-- 6. DELIVERY FEE FOR VENDOR RIDER REQUESTS
-- ------------------------------------------------------------
-- Vendor requests using rider: fee = 1500 (1000 rider / 500 platform)
-- Self-delivery vendor requests: fee = 0
-- Restaurant orders: existing fee logic unchanged (currently 1500)
-- fee column already exists with CHECK (fee >= 0) from 20261002
-- No schema change needed - application logic sets fee based on request_type + delivery_method + vendor_delivery_requested

-- ------------------------------------------------------------
-- 7. INDEXES
-- ------------------------------------------------------------
-- orders.request_type for filtering vendor requests vs restaurant orders
CREATE INDEX IF NOT EXISTS idx_orders_request_type
  ON public.orders (request_type);

-- vendor delivery request lookup: vendor_request orders where rider requested
CREATE INDEX IF NOT EXISTS idx_orders_vendor_delivery_requested
  ON public.orders (request_type, delivery_method, vendor_delivery_requested)
  WHERE request_type = 'vendor_request' AND delivery_method = 'rider' AND vendor_delivery_requested = true;

-- order_items.vendor_id already indexed by FK; vendor orders lookup uses this
-- Add composite index for vendor order listing
CREATE INDEX IF NOT EXISTS idx_order_items_vendor_order
  ON public.order_items (vendor_id, order_id);

-- ------------------------------------------------------------
-- 8. RLS POLICY UPDATES
-- ------------------------------------------------------------
-- Only add policies needed for new vendor_request flow
-- Do NOT weaken existing restaurant order RLS

-- 8a. Vendor can see their own vendor_request orders
-- Uses existing order_has_vendor_item() helper (vendor_id-based capability)
DROP POLICY IF EXISTS "orders_select_vendor" ON public.orders;
CREATE POLICY "orders_select_vendor" ON public.orders
  FOR SELECT
  USING (
    public.order_has_vendor_item(orders.id)
  );

-- 8b. Vendor can update their vendor_request orders (accept, choose delivery)
-- Status transitions: 'Order confirmed' -> 'Preparing'/'Cancelled'
-- Delivery method choice: 'both' -> 'rider'/'vendor_self'
-- Vendor can set vendor_delivery_requested = true when choosing rider
DROP POLICY IF EXISTS "orders_update_vendor" ON public.orders;
CREATE POLICY "orders_update_vendor" ON public.orders
  FOR UPDATE
  USING (
    public.order_has_vendor_item(orders.id)
  )
  WITH CHECK (
    public.order_has_vendor_item(orders.id)
    AND status IN ('Order confirmed', 'Preparing', 'Ready for pickup', 'Delivered', 'Cancelled')
    AND delivery_method IN ('rider', 'vendor_self', 'both')
    AND (
      -- RLS WITH CHECK can inspect only the proposed row.  A requested
      -- Dropzyy rider is therefore valid only with rider delivery; the
      -- existing order transition trigger/RPC remains responsible for
      -- transition authorization and delivery-method hijack protection.
      vendor_delivery_requested = false
      OR delivery_method = 'rider'
    )
  );

-- 8c. Rider pool: include vendor delivery requests
-- Only when: request_type = 'vendor_request', delivery_method = 'rider',
-- vendor_delivery_requested = true, payment_status is NOT 'success' (vendor payment is private)
-- BUT rider delivery fee IS paid by customer via Paystack (separate from vendor product payment)
-- For now: vendor delivery requests enter pool when vendor_delivery_requested = true
-- and we treat them as "paid for delivery" since delivery fee is separate
-- The delivery fee payment will be handled via Paystack when customer accepts rider delivery
DROP POLICY IF EXISTS "orders_select_unassigned" ON public.orders;
CREATE POLICY "orders_select_unassigned" ON public.orders
  FOR SELECT
  USING (
    rider_id IS NULL
    AND delivery_method = 'rider'
    AND (
      -- Restaurant orders: must be paid
      (request_type = 'restaurant' AND payment_status = 'success')
      OR
      -- Vendor delivery requests: vendor has requested rider, delivery fee payment handled separately
      (request_type = 'vendor_request' AND vendor_delivery_requested = true)
    )
    AND public.is_approved_rider()
  );

-- 8d. Rider claim: allow claiming vendor delivery requests
-- Vendor delivery requests don't have payment_status='success' (product payment is private)
-- But delivery IS paid for (customer pays delivery fee via Paystack when accepting)
-- We use vendor_delivery_requested = true as the gate
DROP POLICY IF EXISTS "orders_update_claim" ON public.orders;
CREATE POLICY "orders_update_claim" ON public.orders
  FOR UPDATE
  USING (
    rider_id IS NULL
    AND delivery_method = 'rider'
    AND (
      (request_type = 'restaurant' AND payment_status = 'success')
      OR
      (request_type = 'vendor_request' AND vendor_delivery_requested = true)
    )
    AND public.is_available_rider()
  )
  WITH CHECK (
    public.caller_owns_rider(rider_id)
    AND status = 'Rider assigned'
  );

-- 8e. Rider order_items visibility: include vendor delivery requests
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
      WHERE rider_id IS NULL
        AND delivery_method = 'rider'
        AND (
          (request_type = 'restaurant' AND payment_status = 'success')
          OR
          (request_type = 'vendor_request' AND vendor_delivery_requested = true)
        )
        AND EXISTS (SELECT 1 FROM public.riders WHERE user_id = auth.uid() AND status = 'approved')
    )
  );

-- 8f. Products: customers see restaurant products; vendor_request products hidden from catalog
-- Restaurant products: is_restaurant = true AND active = true
-- Vendor products: is_restaurant = false AND active = true (shown on vendor dashboard, not public catalog)
-- Admin sees all
DROP POLICY IF EXISTS "products_select_public" ON public.products;
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT
  USING (
    active = true
    AND EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = products.vendor_id
        AND v.is_restaurant = true
    )
  );

-- Admin sees all products (unchanged)
DROP POLICY IF EXISTS "products_select_admin" ON public.products;
CREATE POLICY "products_select_admin" ON public.products
  FOR SELECT
  USING (public.is_admin());

-- ------------------------------------------------------------
-- 9. COMPATIBILITY: ENSURE EXISTING FUNCTIONS WORK
-- ------------------------------------------------------------
-- The following existing functions check payment_status = 'success':
-- - enforce_order_status_transitions() claim branch (20261001/20261002)
-- - notify_riders_new_pool_order() trigger (20260917)
-- - generate_settlement() (20260930/20261004)
--
-- Vendor rider deliveries: delivery fee is paid by customer separately via Paystack
-- When vendor sets vendor_delivery_requested = true, the customer will pay delivery fee
-- The order will get payment_status = 'success' for the DELIVERY FEE payment
-- This is handled by the checkout flow (to be implemented in next stage)
--
-- For now: vendor delivery requests in pool are visible to riders
-- but claim requires vendor_delivery_requested = true (not payment_status)
-- The enforce_order_status_transitions trigger still checks payment_status for restaurant orders
-- We need to update it to allow vendor delivery claims without payment_status='success'

-- Note: 20261001 and 20261002 redefined enforce_order_status_transitions()
-- They will need to be updated in a follow-up migration to handle vendor delivery claims
-- For this foundation migration, we add the columns and RLS; trigger update comes next

-- ------------------------------------------------------------
-- 10. BACKFILL EXISTING DATA
-- ------------------------------------------------------------
-- All existing orders are restaurant orders
UPDATE public.orders
SET request_type = 'restaurant'
WHERE request_type IS NULL;

-- All existing vendors are restaurants
UPDATE public.vendors
SET is_restaurant = true
WHERE is_restaurant IS NULL;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * vendors.pickup_location (nullable text)
-- * vendors.is_restaurant (boolean, default true)
-- * orders.request_type (restaurant|vendor_request, default restaurant)
-- * orders.payment_status: added 'pending_vendor' value
-- * orders.vendor_delivery_requested (boolean, default false)
-- * indexes on request_type, vendor delivery request lookup
-- * RLS: vendor order access, rider pool includes vendor deliveries
-- * products_select_public: only restaurant products visible to customers
-- * Existing restaurant orders/data unchanged
-- * Foundation only - checkout, rider delivery, settlement integration in next stages
