-- ============================================================
-- Dropzyy — Add 'On the Way' order status + rider/customer transitions
-- ============================================================
-- Scope (order-management workflow only):
--   1. Extend the orders.status CHECK constraint with 'On the Way'.
--   2. Allow an ASSIGNED rider to progress:
--        Rider assigned → Picked up → On the Way → Delivered
--      (extends the existing orders_update_assigned policy; the USING clause
--      still restricts updates to the rider assigned to the order).
--   3. Allow a CUSTOMER to cancel their own order while it is still
--      cancellable (status 'Order confirmed' or 'Preparing'). The order is
--      never deleted — status becomes 'Cancelled'.
--   4. Add a transition-guard trigger so that the permissive RLS policies
--      (which Postgres OR-combines across policies) can never be combined to
--      perform an illegal status jump (e.g. customer: confirmed → Rated).
--
-- NOT changed:
--   * Vendor policy (orders_update_vendor) — vendors still cannot perform
--     rider-only transitions ('Rider assigned', 'Picked up', 'On the Way').
--   * Admin policy (orders_update_admin) — admins keep full control.
--   * Claim policy (orders_update_claim) — unchanged.
--   * delivery_method, financial columns, and all other schema objects.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend orders.status CHECK with 'On the Way'.
--    Drops any existing status check constraint and re-adds the full set.
-- ------------------------------------------------------------
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
      CHECK (status IN (
        'Order confirmed','Preparing','Ready for pickup',
        'Rider assigned','Picked up','On the Way',
        'Delivered','Rated','Cancelled'
      ));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Rider delivery progression: extend orders_update_assigned so the
--    assigned rider can move through Picked up → On the Way → Delivered.
--    USING/WITH CHECK still require rider_id to be the caller's own rider row,
--    so only the ASSIGNED rider can perform these transitions.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "orders_update_assigned" ON public.orders;
CREATE POLICY "orders_update_assigned" ON public.orders
  FOR UPDATE
  USING (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
  )
  WITH CHECK (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
    AND status IN ('Picked up', 'On the Way', 'Delivered')
  );

-- ------------------------------------------------------------
-- 3. Customer cancellation: the customer may cancel their own order ONLY
--    while it is still cancellable ('Order confirmed' / 'Preparing') and the
--    resulting status must be 'Cancelled'. Combined with the transition-guard
--    trigger below, no other customer status change is possible.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "orders_update_own_cancel" ON public.orders;
CREATE POLICY "orders_update_own_cancel" ON public.orders
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND status IN ('Order confirmed', 'Preparing')
  )
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Cancelled'
  );

-- ------------------------------------------------------------
-- 4. Transition-guard trigger.
--    Postgres OR-combines USING and WITH CHECK expressions across permissive
--    policies independently, which would otherwise allow cross-policy jumps
--    (e.g. customer: 'Order confirmed' → 'Rated' via orders_update_own_cancel
--    USING + orders_update_own_rating WITH CHECK). This SECURITY DEFINER
--    trigger enforces the exact legal transitions per role for non-admins:
--
--      customer (own order):
--        Delivered → Rated
--        Order confirmed | Preparing → Cancelled
--      assigned rider:
--        Order confirmed | Ready for pickup (rider_id NULL) → Rider assigned  (claim)
--        Rider assigned → Picked up
--        Picked up → On the Way
--        On the Way → Delivered
--      vendor (order contains their order_items):
--        Order confirmed → Preparing | Cancelled
--        Preparing → Ready for pickup | Delivered
--      admin: any transition (unchanged).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_order_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- No status change: nothing to validate here (other triggers/policies
  -- already guard user_id, order_number, total, fee, spot).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Admins keep full control (unchanged behaviour).
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Customer transitions on their OWN order.
  IF OLD.user_id = auth.uid() THEN
    IF (OLD.status = 'Delivered' AND NEW.status = 'Rated')
       OR (OLD.status IN ('Order confirmed', 'Preparing') AND NEW.status = 'Cancelled') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Assigned-rider transitions (rider_id must be the caller's rider row).
  IF NEW.rider_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.riders
    WHERE id = NEW.rider_id AND user_id = auth.uid()
  ) THEN
    -- Claiming an unassigned rider-delivery order.
    IF OLD.rider_id IS NULL
       AND OLD.status IN ('Order confirmed', 'Ready for pickup')
       AND NEW.status = 'Rider assigned' THEN
      RETURN NEW;
    END IF;
    -- Linear delivery progression.
    IF (OLD.status = 'Rider assigned' AND NEW.status = 'Picked up')
       OR (OLD.status = 'Picked up' AND NEW.status = 'On the Way')
       OR (OLD.status = 'On the Way' AND NEW.status = 'Delivered') THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Vendor transitions on orders containing their own order_items.
  IF EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = OLD.id
      AND oi.vendor_id IN (
        SELECT vendor_id FROM public.profiles
        WHERE id = auth.uid() AND role = 'vendor'
      )
  ) THEN
    IF (OLD.status = 'Order confirmed' AND NEW.status IN ('Preparing', 'Cancelled'))
       OR (OLD.status = 'Preparing' AND NEW.status IN ('Ready for pickup', 'Delivered')) THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Illegal order status transition % -> % for this role', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_status_transitions ON public.orders;
CREATE TRIGGER trg_enforce_order_status_transitions
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_status_transitions();

-- ============================================================
-- SUMMARY
-- ============================================================
-- * Rider flow:   Order confirmed/Ready for pickup → Rider assigned
--                 → Picked up → On the Way → Delivered   (assigned rider only)
-- * Vendor flow:  Order confirmed → Preparing → Ready for pickup | Delivered
--                 Order confirmed → Cancelled (reject)   (vendor only)
-- * Vendor-self:  Order confirmed → Preparing → Delivered (unchanged)
-- * Customer:     Delivered → Rated (unchanged)
--                 Order confirmed | Preparing → Cancelled (NEW, never deleted)
-- * Admin:        any transition (unchanged)
-- * 'On the Way' added to the status CHECK constraint.
-- ============================================================