-- ============================================================
-- Dropzyy — Notifications table, RLS, and system-event triggers
-- ============================================================
-- Creates:
--   1. public.notifications table
--        id, user_id, title, message, type, related_order_id (nullable),
--        is_read, created_at   (exactly the required minimum set)
--   2. RLS policies:
--        - users can SELECT / UPDATE only their OWN notifications
--        - users can never read another user's notifications
--        - clients can INSERT only notifications addressed to THEMSELVES
--          (their own action confirmations). Cross-user / system-generated
--          notifications are created EXCLUSIVELY by the SECURITY DEFINER
--          trigger function below, so a normal client user can never create
--          (or spoof) a notification for an arbitrary user.
--        - no DELETE policy: notifications are retained for the user.
--   3. Triggers (server-side, run as the table owner → bypass RLS safely):
--        - order_items AFTER INSERT: notifies each affected vendor that a new
--          order needs attention (de-duplicated once per vendor per order).
--          A trigger on order_items (not orders) is used because the client
--          inserts the order row and its items in two separate requests; by
--          the time items exist the vendor list can be resolved.
--        - orders AFTER UPDATE: actor-aware notifications (auth.uid()):
--            * rider assigned/claimed        → customer + vendors
--            * Preparing                     → customer
--            * Ready for pickup              → customer
--            * Cancelled by customer         → vendors + assigned rider
--            * Cancelled by vendor/system    → customer
--            * Picked up / On the Way        → customer
--            * Delivered                     → customer
--
-- Type notes (verified against live schema):
--   orders.id / riders.id / profiles.id / auth.users.id are uuid;
--   vendors.id / products.vendor_id / order_items.vendor_id are text.
--
-- No email/SMS/push/realtime is implemented here.
-- Paystack/payment logic and existing order RLS rules are NOT modified.
-- ============================================================

-- ============================================================
-- 1. Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'info'
    CHECK (type IN ('info','order_placed','order_status','rider','warning')),
  related_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_related_order_idx
  ON public.notifications (related_order_id);

-- ============================================================
-- 2. Row Level Security
-- ============================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Read: only your own notifications.
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- Update (e.g. mark as read): only your own notifications, and the row can
-- never be reassigned to another user (WITH CHECK re-asserts ownership).
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Insert: only notifications addressed to YOURSELF. This blocks any client
-- from creating a notification for an arbitrary user. Notifications for other
-- users are inserted exclusively by the SECURITY DEFINER trigger function
-- below (runs as the table owner, which bypasses RLS).
DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
CREATE POLICY "notifications_insert_own" ON public.notifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy for clients: notifications are retained.

-- ============================================================
-- 3. System-event trigger (SECURITY DEFINER)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_order_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_customer uuid;
  v_old_status text;
  v_new_status text;
  v_old_rider uuid;
  v_new_rider uuid;
  v_updater_is_customer boolean;
  v_vendor_users uuid[];
  v_recipient uuid;
  v_rider_user uuid;
  i integer;
BEGIN
  -- ----------------------------------------------------------
  -- order_items INSERT → notify the vendor (once per vendor/order).
  -- ----------------------------------------------------------
  IF TG_TABLE_NAME = 'order_items' THEN
    v_order_id := NEW.order_id;
    SELECT o.order_number, o.user_id INTO v_order_number, v_customer
    FROM public.orders o
    WHERE o.id = v_order_id;
    IF v_customer IS NULL THEN
      RETURN NULL;
    END IF;

    FOR v_recipient IN
      SELECT DISTINCT p.id
      FROM public.profiles p
      WHERE p.role = 'vendor' AND p.vendor_id = NEW.vendor_id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.related_order_id = v_order_id
          AND n.user_id = v_recipient
          AND n.type = 'order_placed'
      ) THEN
        INSERT INTO public.notifications
          (user_id, title, message, type, related_order_id)
        VALUES (
          v_recipient,
          'New order received',
          'Order #' || v_order_number || ' has been placed and needs your attention.',
          'order_placed',
          v_order_id
        );
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  -- ----------------------------------------------------------
  -- orders UPDATE → actor-aware status / rider notifications.
  -- ----------------------------------------------------------
  v_order_id := NEW.id;
  v_order_number := NEW.order_number;
  v_customer := NEW.user_id;
  v_old_status := COALESCE(OLD.status, '');
  v_new_status := COALESCE(NEW.status, '');
  v_old_rider := OLD.rider_id;
  v_new_rider := NEW.rider_id;
  v_updater_is_customer := (auth.uid() IS NOT NULL AND auth.uid() = NEW.user_id);

  -- Nothing notification-worthy changed → exit early.
  IF v_new_status = v_old_status
     AND COALESCE(v_new_rider::text, '') = COALESCE(v_old_rider::text, '') THEN
    RETURN NEW;
  END IF;

  -- Vendor users attached to this order (via its order_items).
  SELECT array_agg(DISTINCT p.id) INTO v_vendor_users
  FROM public.profiles p
  WHERE p.role = 'vendor'
    AND p.vendor_id IN (
      SELECT oi.vendor_id FROM public.order_items oi WHERE oi.order_id = v_order_id
    );

  -- Rider assigned / claimed → customer + vendors.
  IF v_new_rider IS NOT NULL AND v_new_rider IS DISTINCT FROM v_old_rider THEN
    SELECT r.user_id INTO v_rider_user FROM public.riders r WHERE r.id = v_new_rider;
    IF v_customer IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
      VALUES (v_customer, 'Rider assigned',
              'A rider has been assigned to order #' || v_order_number || '.',
              'rider', v_order_id);
    END IF;
    IF v_vendor_users IS NOT NULL THEN
      FOR i IN 1..array_length(v_vendor_users, 1) LOOP
        INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
        VALUES (v_vendor_users[i], 'Rider assigned',
                'A rider has been assigned to order #' || v_order_number || '.',
                'rider', v_order_id);
      END LOOP;
    END IF;
  END IF;

  IF v_new_status = v_old_status THEN
    RETURN NEW;
  END IF;

  -- Customer cancellation → notify the vendors and the assigned rider.
  -- (Actor-aware: auth.uid() = orders.user_id means the customer made the
  --  change; otherwise the transition was made by vendor/rider/admin.)
  IF v_new_status = 'Cancelled' AND v_updater_is_customer THEN
    IF v_vendor_users IS NOT NULL THEN
      FOR i IN 1..array_length(v_vendor_users, 1) LOOP
        INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
        VALUES (v_vendor_users[i], 'Order cancelled by customer',
                'Order #' || v_order_number || ' was cancelled by the customer.',
                'order_status', v_order_id);
      END LOOP;
    END IF;
    IF v_new_rider IS NOT NULL THEN
      SELECT r.user_id INTO v_rider_user FROM public.riders r WHERE r.id = v_new_rider;
      IF v_rider_user IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
        VALUES (v_rider_user, 'Order cancelled by customer',
                'Order #' || v_order_number || ' was cancelled by the customer.',
                'order_status', v_order_id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Vendor / rider / admin-driven status transitions → notify the customer.
  CASE v_new_status
    WHEN 'Preparing' THEN
      INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
      VALUES (v_customer, 'Your order is being prepared',
              'Order #' || v_order_number || ' was accepted and is being prepared.',
              'order_status', v_order_id);
    WHEN 'Ready for pickup' THEN
      INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
      VALUES (v_customer, 'Order ready for pickup',
              'Order #' || v_order_number || ' is ready and waiting for a rider.',
              'order_status', v_order_id);
    WHEN 'Cancelled' THEN
      INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
      VALUES (v_customer, 'Order cancelled',
              'Order #' || v_order_number || ' was cancelled.',
              'order_status', v_order_id);
    WHEN 'Picked up' THEN
      INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
      VALUES (v_customer, 'Order picked up',
              'The rider collected order #' || v_order_number || '.',
              'rider', v_order_id);
    WHEN 'On the Way' THEN
      INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
      VALUES (v_customer, 'Your rider is on the way',
              'Order #' || v_order_number || ' is on the way to you.',
              'rider', v_order_id);
    WHEN 'Delivered' THEN
      INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
      VALUES (v_customer, 'Order delivered',
              'Order #' || v_order_number || ' was delivered. Enjoy!',
              'order_status', v_order_id);
    ELSE
      NULL; -- 'Order confirmed' / 'Rated' / no-op transitions → no notification
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_items_notify_vendor ON public.order_items;
CREATE TRIGGER trg_order_items_notify_vendor
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.handle_order_notifications();

DROP TRIGGER IF EXISTS trg_orders_notify ON public.orders;
CREATE TRIGGER trg_orders_notify
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.handle_order_notifications();

-- ============================================================
-- 4. Realtime (push) support for the notifications table
-- ============================================================
-- Supabase Realtime delivers postgres_changes events only for tables that are
-- part of the `supabase_realtime` publication. Adding the table here lets the
-- customer app subscribe to INSERT/UPDATE events so the unread badge and list
-- update without a manual refresh (the app still keeps pull-based loading as
-- a fallback). The DO block is idempotent and safe on projects where the
-- publication exists (always true on Supabase-hosted projects).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * Recipient mapping per event:
--     order placed            → vendor(s) on the order (order_items trigger)
--     Preparing               → customer
--     Ready for pickup        → customer
--     Cancelled (vendor/admin)→ customer
--     Cancelled (customer)    → vendor(s) + assigned rider
--     Rider assigned/claimed  → customer + vendor(s)
--     Picked up / On the Way  → customer
--     Delivered               → customer
-- * The actor's own UI confirmations are self-notifications written through
--   notifications_insert_own (user_id = auth.uid() only).
-- * No email/SMS/push. Realtime push for the notifications table is enabled
--   via the supabase_realtime publication (section 4); the app keeps the
--   pull-based loader as fallback. Existing order RLS rules are unchanged.
-- ============================================================