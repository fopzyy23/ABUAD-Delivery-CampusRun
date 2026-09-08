-- ============================================================
-- 20260921_create_refund_notifications.sql
-- Refund status-change notifications (server-authoritative)
-- ============================================================
-- Creates a trigger function + trigger on the refunds table so that
-- meaningful status transitions automatically create a notification for
-- the customer who owns the underlying order.
--
-- Relationship chain: refunds → orders (order_id) → customer (orders.user_id)
--
-- Duplicate prevention:
--   - Trigger only fires when status actually changes on UPDATE (OLD.status IS DISTINCT FROM NEW.status)
--   - For INSERT, only fires for status 'requested' (initial customer request)
--   - No-op updates (same status) are silently skipped
--   - Retry/webhook safe: repeated identical UPDATEs produce no duplicate notifications
--
-- Supported statuses:
--   requested → "Your refund request has been submitted." (INSERT)
--   approved  → "Your refund request has been approved."
--   rejected  → "Your refund request was rejected."
--   processed → "Your refund has been processed."
--   failed    → "Your refund could not be processed."
--
-- Depends on:
--   20260903_create_notifications.sql (notifications table + handle_order_notifications)
--   20260910_create_settlement_ledger.sql (refunds table)
--   20260920_create_refund_workflow.sql (approve_refund, reject_refund RPCs)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Trigger function: handle_refund_status_notifications
--    SECURITY DEFINER to bypass RLS (same pattern as handle_order_notifications)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_refund_status_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_title text;
  v_message text;
  v_should_notify boolean := false;
BEGIN
  -- Determine if we should create a notification
  IF TG_OP = 'INSERT' THEN
    -- Only notify on INSERT if status is 'requested' (customer-initiated)
    IF NEW.status = 'requested' THEN
      v_should_notify := true;
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only notify when status actually changes (prevents duplicates on retry)
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      v_should_notify := true;
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Look up the customer who owns this refund's order
  SELECT o.user_id INTO v_customer
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  -- If we can't resolve the customer, silently skip (defensive)
  IF v_customer IS NULL THEN
    RETURN NEW;
  END IF;

  -- Build notification content based on the new status
  CASE NEW.status
    WHEN 'requested' THEN
      v_title := 'Refund requested';
      v_message := 'Your refund request has been submitted and is awaiting review.';
    WHEN 'approved' THEN
      v_title := 'Refund approved';
      v_message := 'Your refund request has been approved.';
    WHEN 'rejected' THEN
      v_title := 'Refund rejected';
      v_message := 'Your refund request was rejected.';
    WHEN 'processed' THEN
      v_title := 'Refund processed';
      v_message := 'Your refund has been processed.';
    WHEN 'failed' THEN
      v_title := 'Refund failed';
      v_message := 'Your refund could not be processed.';
    ELSE
      -- For any other status (e.g., 'pending'), no notification
      RETURN NEW;
  END CASE;

  -- Insert the notification (server-authoritative, bypasses RLS via SECURITY DEFINER)
  INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
  VALUES (v_customer, v_title, v_message, 'order_status', NEW.order_id);

  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. Trigger: fires AFTER INSERT OR UPDATE on refunds
--    INSERT: only for status 'requested' (customer request)
--    UPDATE: only when status actually changes
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_refund_status_notify ON public.refunds;
CREATE TRIGGER trg_refund_status_notify
  AFTER INSERT OR UPDATE ON public.refunds
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_refund_status_notifications();

-- ============================================================
-- SUMMARY
-- ============================================================
-- * handle_refund_status_notifications: SECURITY DEFINER trigger function
--   that creates customer notifications on meaningful refund status changes
-- * Trigger fires AFTER INSERT OR UPDATE on refunds
-- * INSERT: only notifies for status 'requested' (customer-initiated request)
-- * UPDATE: only notifies when status actually changes (prevents duplicates)
-- * Notifications: requested, approved, rejected, processed, failed
-- * Duplicate prevention:
--     - INSERT only fires for 'requested' status
--     - UPDATE only fires when OLD.status IS DISTINCT FROM NEW.status
--     - Retry-safe: repeated identical UPDATEs produce no duplicate
-- * Frontend duplicate: the redundant addNotification() call in app.js
--   should be removed since this trigger is now authoritative
-- ============================================================