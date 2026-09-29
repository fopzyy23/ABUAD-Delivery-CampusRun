-- ============================================================
-- 20261220_demo_tracking_sync.sql
-- ============================================================
-- Connects the homepage "Demo tracking" waybill to the REAL, persisted
-- delivery progress of one explicitly flagged order instead of a simulated
-- animation that advanced on its own.
--
-- AUTHORITATIVE FIELD (already existed — nothing new is introduced)
--   public.orders.status        written by the rider hub
--                               (assets/js/app.js runRiderStatusUpdate) and by
--                               the vendor/admin flows through the existing
--                               enforce_order_status_transitions() trigger.
--   public.orders.rider_id      set when a rider accepts a delivery.
--   Status values: 'Order confirmed' → 'Preparing' → 'Ready for pickup' →
--   'Rider assigned' → 'Picked up' → 'On the Way' → 'Delivered'
--   (plus the existing terminal 'Rated' / 'Cancelled'). NO new status value
--   is added by this migration — the demo card maps this existing set onto the
--   stages the tracking UI already renders.
--
-- WHAT THIS ADDS
--   1. orders.demo_tracking_enabled (boolean, default false) + a partial
--      UNIQUE index, so AT MOST ONE order can ever be the public demo order.
--   2. get_demo_tracking_status() — SECURITY DEFINER, callable by anon +
--      authenticated, returning ONLY privacy-safe fields for that one flagged
--      order: order_number, status, delivery_method, rider_assigned,
--      reported_at. It deliberately does NOT expose user_id, profiles,
--      rider_id, rider name/phone, spot/hostel or totals, so no customer data
--      becomes publicly readable and existing RLS on orders/order_items/
--      profiles/riders is untouched.
--      It is the "fetch the latest persisted status" path for the tracking
--      card (page load + reconnect + poll fallback).
--   3. set_demo_tracking_order(order_number) — admin-only + AAL2-gated RPC to
--      flag/clear the demo order (opting an order in/out is an explicit admin
--      decision, exactly like vendor assignment).
--   4. broadcast_demo_tracking_change() trigger — pushes the SAME safe payload
--      over Supabase Realtime (public topic 'demo-tracking', event
--      'demo_status') whenever the flagged order's status or rider assignment
--      changes, so the customer-facing card updates with no refresh and no
--      polling-only latency. It never broadcasts the order row itself, so
--      unrelated customer information is never published.
--      The trigger body is guarded with to_regprocedure(): on a Realtime
--      version without broadcast-from-database it simply does nothing, and the
--      client's poll fallback keeps the card correct.
--   5. If no order is flagged, the RPC returns no rows and the client shows an
--      EXPLICIT simulation mode — simulated motion is never presented as real
--      rider progress, and no GPS data is used or claimed anywhere.
--
-- UNCHANGED: rider workflow, status transition rules, order placement,
-- payments, settlements, refunds and every historical row.
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Exactly one public demo order.
-- ------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS demo_tracking_enabled boolean NOT NULL DEFAULT false;

-- Partial UNIQUE index on a constant expression: PostgreSQL allows at most one
-- row with demo_tracking_enabled = true. (Admin flagging always clears the
-- previous order first — see set_demo_tracking_order below.)
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_demo_tracking_order_idx
  ON public.orders ((demo_tracking_enabled))
  WHERE demo_tracking_enabled;

-- ------------------------------------------------------------
-- 2. Privacy-safe public read of the demo order's progress.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_demo_tracking_status()
RETURNS TABLE (
  order_number    text,
  status          text,
  delivery_method text,
  rider_assigned  boolean,
  reported_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.order_number,
         o.status,
         o.delivery_method,
         (o.rider_id IS NOT NULL) AS rider_assigned,
         now()                    AS reported_at
  FROM public.orders o
  WHERE o.demo_tracking_enabled IS TRUE
  ORDER BY o.created_at DESC
  LIMIT 1
$$;

-- Public on purpose (the homepage is signed-out by default) but limited to the
-- five safe columns above for the single admin-flagged order.
REVOKE ALL ON FUNCTION public.get_demo_tracking_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_demo_tracking_status() TO anon, authenticated;


-- ------------------------------------------------------------
-- 3. Admin control: flag / clear the demo order.
--    Mirrors the existing admin RPC pattern (is_admin() + AAL2). NULL or an
--    empty string clears the flag, which is what switches the customer-facing
--    card back to its explicitly-labelled simulation mode.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_demo_tracking_order(p_order_number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id     uuid;
  v_order_number text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;
  IF public.is_admin_aal2() IS NOT TRUE THEN
    RAISE EXCEPTION 'AAL2/MFA is required for this admin operation';
  END IF;

  -- One demo order at a time: always clear the previous flag first.
  UPDATE public.orders
     SET demo_tracking_enabled = false
   WHERE demo_tracking_enabled IS TRUE;

  IF p_order_number IS NULL OR btrim(p_order_number) = '' THEN
    RETURN NULL;                       -- cleared: client falls back to simulation
  END IF;

  SELECT o.id, o.order_number
    INTO v_order_id, v_order_number
  FROM public.orders o
  WHERE o.order_number = btrim(p_order_number)
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION 'Order % not found', p_order_number;
  END IF;

  UPDATE public.orders
     SET demo_tracking_enabled = true
   WHERE id = v_order_id;

  RETURN v_order_number;
END $$;

REVOKE ALL ON FUNCTION public.set_demo_tracking_order(text) FROM PUBLIC, anon;

-- ------------------------------------------------------------
-- 4. Realtime push of the same safe payload.
--    Broadcast-from-database is available on Realtime >= 2.x; the calls are
--    guarded so the migration applies cleanly either way. Failures NEVER block
--    a rider's status update (the body catches and warns), and the payload is
--    built field-by-field so no customer row is ever published.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_demo_tracking_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF NEW.demo_tracking_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'order_number',    NEW.order_number,
    'status',          NEW.status,
    'delivery_method', NEW.delivery_method,
    'rider_assigned',  (NEW.rider_id IS NOT NULL),
    'reported_at',     now()
  );

  BEGIN
    IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
      PERFORM realtime.send(v_payload, 'demo_status', 'demo-tracking', false);
    ELSIF to_regprocedure('realtime.send(jsonb,text,text)') IS NOT NULL THEN
      PERFORM realtime.send(v_payload, 'demo_status', 'demo-tracking');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'demo tracking broadcast failed (non-fatal): %', SQLERRM;
  END;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_broadcast_demo_tracking ON public.orders;
CREATE TRIGGER trg_broadcast_demo_tracking
AFTER UPDATE ON public.orders
FOR EACH ROW
WHEN (
  NEW.demo_tracking_enabled IS TRUE
  AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.rider_id IS DISTINCT FROM OLD.rider_id)
)
EXECUTE FUNCTION public.broadcast_demo_tracking_change();

GRANT EXECUTE ON FUNCTION public.set_demo_tracking_order(text) TO authenticated;


-- ------------------------------------------------------------
-- 5. OPERATIONS + VERIFICATION (Supabase dashboard)
-- ------------------------------------------------------------
-- Flag / clear the public demo order (admin, AAL2 session):
--   select public.set_demo_tracking_order('DZ-4417LG');   -- flag
--   select public.set_demo_tracking_order(null);          -- clear → simulation
--   select * from public.get_demo_tracking_status();      -- what visitors read
--
-- Then, with the flagged order in hand, have the rider advance it from the
-- Rider hub ('Rider assigned' → 'Picked up' → 'On the Way' → 'Delivered').
-- The homepage card must move with it, with no page refresh.
-- Refreshing, reconnecting (DevTools → offline → online) and leaving/returning
-- to the homepage must all re-read the persisted status and NEVER move the
-- card backwards.
--
-- Reminder: no GPS coordinates are stored, read or displayed by this feature —
-- the card only mirrors order status stages.
-- ============================================================
