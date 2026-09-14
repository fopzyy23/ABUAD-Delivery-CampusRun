-- ============================================================
-- 20261010_vendor_delivery_payment.sql
-- Stage 4: Separate ₦1,500 Vendor Delivery Payment
-- ============================================================
-- Adds a separate delivery payment identity for Vendor rider deliveries.
-- Product payment (pending_vendor) stays private; delivery payment goes through Paystack.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTEND PAYMENTS TABLE: add payment_type to distinguish
-- ------------------------------------------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'product'
  CHECK (payment_type IN ('product', 'vendor_delivery'));

-- Index for delivery payment lookup
CREATE INDEX IF NOT EXISTS idx_payments_type_order
  ON public.payments (payment_type, order_id);

-- ------------------------------------------------------------
-- 2. EXTEND ORDERS TABLE: delivery payment status tracking
-- ------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_payment_status text NOT NULL DEFAULT 'pending'
  CHECK (delivery_payment_status IN ('pending', 'success', 'failed', 'refunded'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_payment_id uuid REFERENCES public.payments(id);

COMMENT ON COLUMN public.orders.delivery_payment_status IS 'Tracks the ₦1,500 delivery payment for vendor rider requests';
COMMENT ON COLUMN public.orders.delivery_payment_id IS 'Links to the payments row for the delivery fee';

-- ------------------------------------------------------------
-- 3. BACKFILL EXISTING ORDERS
-- ------------------------------------------------------------
-- All existing orders are product payments
UPDATE public.payments
SET payment_type = 'product'
WHERE payment_type IS NULL;

-- All existing orders have no delivery payment
UPDATE public.orders
SET delivery_payment_status = 'pending'
WHERE delivery_payment_status IS NULL;

-- ------------------------------------------------------------
-- 4. VENDOR DELIVERY PAYMENT INITIALIZATION RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_vendor_delivery_payment(
  p_order_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_reference text;
  v_amount numeric := 1500;
  v_payment_id uuid;
  v_existing payments%ROWTYPE;
BEGIN
  -- 0. Authenticated customer only
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 1. Fetch and validate order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.user_id != v_user THEN
    RAISE EXCEPTION 'Order % does not belong to you', p_order_id;
  END IF;

  IF v_order.request_type <> 'vendor_request' THEN
    RAISE EXCEPTION 'Delivery payment only allowed for vendor requests';
  END IF;

  IF v_order.delivery_method <> 'rider' THEN
    RAISE EXCEPTION 'Delivery payment only for rider delivery orders';
  END IF;

  IF v_order.vendor_delivery_requested <> true THEN
    RAISE EXCEPTION 'Vendor has not requested rider delivery';
  END IF;

  IF v_order.status IN ('Delivered', 'Cancelled') THEN
    RAISE EXCEPTION 'Cannot create delivery payment for % order', v_order.status;
  END IF;

  IF v_order.delivery_payment_status = 'success' THEN
    RAISE EXCEPTION 'Delivery payment already successful';
  END IF;

  -- 2. Check for existing pending delivery payment (idempotency)
  SELECT * INTO v_existing
  FROM public.payments
  WHERE order_id = p_order_id
    AND payment_type = 'vendor_delivery'
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'payment_id', v_existing.id,
      'reference', v_existing.reference,
      'amount', v_existing.amount,
      'status', v_existing.status,
      'reused', true
    );
  END IF;

  -- 3. Validate email
  IF p_email IS NULL OR p_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'Valid email required for delivery payment';
  END IF;

  -- 4. Generate unique reference
  v_reference := 'dropzyy_delivery_' || v_order.order_number || '_' || floor(extract(epoch from now()) * 1000)::text;

  -- 5. Create pending delivery payment record (amount = ₦1,500)
  INSERT INTO public.payments (order_id, reference, amount, currency, status, payment_type)
  VALUES (p_order_id, v_reference, v_amount, 'NGN', 'pending', 'vendor_delivery')
  RETURNING id INTO v_payment_id;

  -- 4. Link payment to order
  UPDATE public.orders
  SET delivery_payment_id = v_payment_id,
      delivery_payment_status = 'pending'
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'reference', v_reference,
    'amount', v_amount,
    'currency', 'NGN',
    'status', 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_vendor_delivery_payment(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_vendor_delivery_payment(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_vendor_delivery_payment(uuid, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- 5. DELIVERY PAYMENT SUCCESS HANDLER RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_vendor_delivery_payment_success(
  p_reference text,
  p_transaction_id text,
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_existing_txn uuid;
  v_order public.orders%ROWTYPE;
BEGIN
  -- Lock and verify payment
  SELECT * INTO v_payment
  FROM public.payments
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment with reference % not found', p_reference;
  END IF;

  IF v_payment.status = 'success' THEN
    RETURN; -- Idempotent
  END IF;

  IF v_payment.payment_type <> 'vendor_delivery' THEN
    RAISE EXCEPTION 'Payment % is not a vendor delivery payment', p_reference;
  END IF;

  IF v_payment.order_id != p_order_id THEN
    RAISE EXCEPTION 'Payment reference % does not belong to order %', p_reference, p_order_id;
  END IF;

  IF p_transaction_id IS NOT NULL THEN
    SELECT id INTO v_existing_txn
    FROM public.payments
    WHERE transaction_id::text = p_transaction_id AND id != v_payment.id
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Transaction ID % already used by another payment', p_transaction_id;
    END IF;
  END IF;

  -- Lock and verify order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.request_type <> 'vendor_request' THEN
    RAISE EXCEPTION 'Order % is not a vendor request', p_order_id;
  END IF;

  IF v_order.delivery_method <> 'rider' THEN
    RAISE EXCEPTION 'Order % is not a rider delivery', p_order_id;
  END IF;

  -- Mark payment success using GUC for protected columns
  PERFORM set_config('app.order_server_update', 'on', true);

  UPDATE public.payments
  SET status = 'success',
      transaction_id = p_transaction_id::bigint,
      updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET delivery_payment_status = 'success',
      delivery_payment_id = v_payment.id
  WHERE id = p_order_id;

  PERFORM set_config('app.order_server_update', 'off', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_success(text, text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_success(text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_success(text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_success(text, text, uuid) FROM PUBLIC;

-- ------------------------------------------------------------
-- 6. DELIVERY PAYMENT FAILURE HANDLER RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_vendor_delivery_payment_failed(
  p_reference text,
  p_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment with reference % not found', p_reference;
  END IF;

  IF v_payment.status = 'success' THEN
    RETURN;
  END IF;

  IF v_payment.payment_type <> 'vendor_delivery' THEN
    RAISE EXCEPTION 'Payment % is not a vendor delivery payment', p_reference;
  END IF;

  IF v_payment.order_id != p_order_id THEN
    RAISE EXCEPTION 'Payment reference % does not belong to order %', p_reference, p_order_id;
  END IF;

  PERFORM set_config('app.order_server_update', 'on', true);

  UPDATE public.payments
  SET status = 'failed', updated_at = now()
  WHERE id = v_payment.id;

  UPDATE public.orders
  SET delivery_payment_status = 'failed'
  WHERE id = p_order_id
    AND delivery_payment_status = 'pending';

  PERFORM set_config('app.order_server_update', 'off', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_failed(text, uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_failed(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_failed(text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_failed(text, uuid) FROM PUBLIC;

-- ------------------------------------------------------------
-- 7. RIDER POOL ELIGIBILITY: Update orders_select_unassigned
-- ------------------------------------------------------------
-- Vendor delivery requests enter pool only when:
--   request_type='vendor_request' AND delivery_method='rider'
--   AND vendor_delivery_requested=true
--   AND delivery_payment_status='success'
DROP POLICY IF EXISTS "orders_select_unassigned" ON public.orders;
CREATE POLICY "orders_select_unassigned" ON public.orders
  FOR SELECT
  USING (
    rider_id IS NULL
    AND delivery_method = 'rider'
    AND (
      -- Restaurant orders: product payment must be success
      (request_type = 'restaurant' AND payment_status = 'success')
      OR
      -- Vendor delivery: delivery payment must be success
      (request_type = 'vendor_request'
       AND vendor_delivery_requested = true
       AND delivery_payment_status = 'success')
    )
    AND public.is_approved_rider()
  );

-- ------------------------------------------------------------
-- 8. RIDER CLAIM POLICY: Update orders_update_claim
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "orders_update_claim" ON public.orders;
CREATE POLICY "orders_update_claim" ON public.orders
  FOR UPDATE
  USING (
    rider_id IS NULL
    AND delivery_method = 'rider'
    AND (
      (request_type = 'restaurant' AND payment_status = 'success')
      OR
      (request_type = 'vendor_request'
       AND vendor_delivery_requested = true
       AND delivery_payment_status = 'success')
    )
    AND public.is_available_rider()
  )
  WITH CHECK (
    public.caller_owns_rider(rider_id)
    AND status = 'Rider assigned'
  );

-- ------------------------------------------------------------
-- 9. RIDER ORDER_ITEMS VISIBILITY
-- ------------------------------------------------------------
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
          (request_type = 'vendor_request'
           AND vendor_delivery_requested = true
           AND delivery_payment_status = 'success')
        )
        AND EXISTS (SELECT 1 FROM public.riders WHERE user_id = auth.uid() AND status = 'approved')
    )
  );

-- ------------------------------------------------------------
-- 10. RIDER NOTIFICATION TRIGGER UPDATE
-- ------------------------------------------------------------
-- Vendor delivery requests should notify riders only after delivery payment succeeds
-- Create a new trigger that fires on delivery_payment_status change to 'success'
DROP TRIGGER IF EXISTS trg_notify_riders_vendor_delivery ON public.orders;
DROP FUNCTION IF EXISTS public.notify_riders_vendor_delivery_request();

CREATE OR REPLACE FUNCTION public.notify_riders_vendor_delivery_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire when vendor delivery payment becomes successful
  IF NEW.request_type = 'vendor_request'
     AND NEW.delivery_method = 'rider'
     AND NEW.vendor_delivery_requested = true
     AND NEW.delivery_payment_status = 'success'
     AND OLD.delivery_payment_status IS DISTINCT FROM 'success' THEN

    -- Get vendor pickup location
    DECLARE
      v_pickup_location text;
    BEGIN
      SELECT pickup_location INTO v_pickup_location
      FROM public.vendors
      WHERE id = (
        SELECT vendor_id FROM public.order_items
        WHERE order_id = NEW.id
        LIMIT 1
      );

      INSERT INTO public.notifications
        (user_id, title, message, type, related_order_id)
      SELECT
        r.user_id,
        'New delivery available',
        'Vendor delivery for order ' || NEW.order_number ||
          ' is ready for pickup at ' || COALESCE(v_pickup_location, 'vendor location') ||
          '. Open the Rider Hub to accept it.',
        'rider',
        NEW.id
      FROM public.riders r
      WHERE r.status = 'approved'
        AND r.available = true;
    END;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_riders_vendor_delivery_payment
AFTER UPDATE OF delivery_payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_riders_vendor_delivery_payment();

-- ------------------------------------------------------------
-- 11. SETTLEMENT: No vendor product settlement for vendor requests
-- ------------------------------------------------------------
-- The _settle_order_core function (from 20261004) already skips vendor settlement
-- for vendor_request orders and skips delivery settlement for vendor_self.
-- No changes needed - already handled in 20261007_vendor_followup.sql

-- ------------------------------------------------------------
-- 12. AUTO-SETTLEMENT TRIGGER: Include delivery_payment_status
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_auto_settle_on_status ON public.orders;
DROP TRIGGER IF EXISTS trg_auto_settle_on_payment ON public.orders;

CREATE OR REPLACE FUNCTION public.auto_settle_delivered_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_result jsonb;
BEGIN
  -- Only settle when order becomes Delivered AND:
  -- Restaurant: payment_status = 'success'
  -- Vendor self-delivery: status = 'Delivered' (no delivery payment needed)
  -- Vendor rider delivery: delivery_payment_status = 'success'
  IF NEW.status = 'Delivered' AND (
      (NEW.request_type = 'restaurant' AND NEW.payment_status = 'success')
      OR
      (NEW.request_type = 'vendor_request' AND NEW.delivery_method = 'vendor_self')
      OR
      (NEW.request_type = 'vendor_request' AND NEW.delivery_method = 'rider' AND NEW.delivery_payment_status = 'success')
    )
    AND (OLD.status IS DISTINCT FROM 'Delivered'
         OR OLD.payment_status IS DISTINCT FROM 'success'
         OR OLD.delivery_payment_status IS DISTINCT FROM 'success') THEN
    BEGIN
      v_result := public._settle_order_core(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto settlement skipped for order %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$func$;

CREATE TRIGGER trg_auto_settle_on_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_settle_delivered_order();

CREATE TRIGGER trg_auto_settle_on_delivery_payment
AFTER UPDATE OF delivery_payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_settle_delivered_order();

-- ------------------------------------------------------------
-- SUMMARY
-- ------------------------------------------------------------
-- * payments.payment_type: 'product' | 'vendor_delivery'
-- * orders.delivery_payment_status: pending/success/failed/refunded
-- * orders.delivery_payment_id: FK to payments
-- * create_vendor_delivery_payment RPC: creates ₦1,500 delivery payment
-- * handle_vendor_delivery_payment_success/failed: service-role only
-- * Rider pool: vendor requests require delivery_payment_status='success'
-- * Rider notification: fires on delivery_payment_status change to 'success'
-- * Auto-settlement: includes delivery_payment_status check
-- * Product payment (pending_vendor) remains separate and untouched
-- * Restaurant flow unchanged: uses payment_status='success'