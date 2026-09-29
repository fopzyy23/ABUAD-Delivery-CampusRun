-- ============================================================
-- 20261207_fix_rider_claim_delivery_payment_gate.sql
-- ============================================================
-- Fixes the enforce_order_status_transitions trigger to require
-- delivery_payment_status = 'success' for vendor rider claims.
--
-- The current trigger (20261022_rider_earnings_foundation) only checks
-- vendor_delivery_requested = true for vendor_request orders with
-- delivery_method = 'rider'. This allows riders to claim orders before
-- the vendor has paid the delivery fee.
--
-- The correct gate is: vendor_delivery_requested = true AND
-- delivery_payment_status = 'success', matching the auto-settlement
-- trigger (20261112_a7_vendor_rider_settlement_repair) and the rider
-- pool query (20261123_automatic_8pm_cutoff_finalize).
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count integer;
BEGIN
  -- Delivery-method hijack guard (from 20261002)
  IF NOT public.is_admin()
     AND NEW.delivery_method IS DISTINCT FROM OLD.delivery_method THEN
    IF OLD.delivery_method <> 'both'
       OR NEW.delivery_method NOT IN ('rider', 'vendor_self') THEN
      RAISE EXCEPTION 'delivery_method can only be changed from ''both'' (vendor choice)';
    END IF;
  END IF;
  -- No status change: nothing to validate
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  -- Admins keep full control
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  -- Customer transitions on their OWN order
  IF OLD.user_id = auth.uid() THEN
    IF (OLD.status = 'Delivered' AND NEW.status = 'Rated')
       OR (OLD.status IN ('Order confirmed', 'Preparing') AND NEW.status = 'Cancelled') THEN
      RETURN NEW;
    END IF;
  END IF;
  -- Assigned-rider transitions (rider_id must be the caller's rider row)
  IF NEW.rider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.riders
    WHERE id = NEW.rider_id AND user_id = auth.uid()
  ) THEN
    -- Claiming an unassigned rider-delivery order
    -- Restaurant orders: require payment_status = 'success'
    -- Vendor delivery requests: require vendor_delivery_requested = true
    --                        AND delivery_payment_status = 'success'
    IF OLD.rider_id IS NULL
       AND OLD.status IN ('Order confirmed', 'Ready for pickup')
       AND OLD.delivery_method = 'rider'
       AND (
         (OLD.request_type = 'restaurant' AND OLD.payment_status = 'success')
         OR
         (OLD.request_type = 'vendor_request'
            AND OLD.vendor_delivery_requested = true
            AND OLD.delivery_payment_status = 'success')
       )
       AND NEW.status = 'Rider assigned' THEN
      -- ACTIVE CAP (20261022): at most 2 active deliveries per rider.
      -- Active = the three in-progress rider states only; Delivered /
      -- Rated / Cancelled never count. The claim row itself is still
      -- unassigned at this point (OLD.rider_id IS NULL), so no
      -- self-exclusion is needed: count rows already held by NEW.rider_id.
      -- Lock the rider row first so two concurrent claims by the SAME
      -- rider serialize here and cannot both pass the count (TOCTOU).
      PERFORM 1 FROM public.riders WHERE id = NEW.rider_id FOR UPDATE;
      SELECT count(*) INTO v_active_count
      FROM public.orders
      WHERE rider_id = NEW.rider_id
        AND status IN ('Rider assigned', 'Picked up', 'On the Way');
      IF v_active_count >= 2 THEN
        RAISE EXCEPTION 'Rider already has % active deliveries (maximum 2)', v_active_count;
      END IF;
      RETURN NEW;
    END IF;
    -- Linear delivery progression
    IF (OLD.status = 'Rider assigned' AND NEW.status = 'Picked up')
       OR (OLD.status = 'Picked up' AND NEW.status = 'On the Way')
       OR (OLD.status = 'On the Way' AND NEW.status = 'Delivered') THEN
      RETURN NEW;
    END IF;
  END IF;
  -- Vendor transitions on orders containing their own order_items
  IF public.order_has_vendor_item(OLD.id) THEN
    IF (OLD.status = 'Order confirmed' AND NEW.status IN ('Preparing', 'Cancelled'))
       OR (OLD.status = 'Preparing' AND NEW.status = 'Ready for pickup')
       OR (OLD.status = 'Preparing' AND NEW.status = 'Delivered'
           AND NEW.delivery_method = 'vendor_self') THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Illegal order status transition % -> % for this role', OLD.status, NEW.status;
END;
$$;

-- No trigger re-bind: trg_enforce_order_status_transitions keeps its name,
-- BEFORE UPDATE timing and binding, so existing references still hold and
-- there is exactly one guard trigger.