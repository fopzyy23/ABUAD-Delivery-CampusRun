-- ============================================================
-- 20260922_multi_role_vendor_capability.sql
-- ============================================================
-- Multi-capability role architecture (smallest safe change)
--
-- ROOT CAUSE BEING FIXED
-- ----------------------
-- assign_user_to_vendor() wrote profiles.role='vendor' directly. The live
-- CHECK constraint profiles_role_check (created by the pre-repo base schema,
-- never redefined in supabase/migrations) rejected that write, so admin
-- vendor assignment failed with:
--   'new row for relation "profiles" violates check constraint
--    "profiles_role_check"'
-- Separately, overwriting the single role column destroyed other
-- capabilities: assigning an admin as vendor silently stripped 'admin',
-- and unassigning demoted an admin to 'user'.
--
-- ARCHITECTURE (mirrors the existing rider pattern)
-- -------------------------------------------------
-- Capability is expressed by a capability-specific link, NOT by the single
-- role string:
--   admin  <=> profiles.role = 'admin'          (unchanged, is_admin())
--   vendor <=> profiles.vendor_id IS NOT NULL   (admin-assigned link to vendors.id)
--   rider  <=> approved row in riders           (unchanged, riders.user_id)
-- Any combination is representable without overwriting anything:
-- Admin+Vendor, Admin+Rider, Vendor+Rider, Admin+Vendor+Rider. This matches
-- how the newer subsystems (withdrawal_requests, vendor_settlements,
-- transfers, transfer_recipients) already authorize vendors by vendor_id.
--
-- SECURITY
-- --------
-- * prevent_profile_role_escalation() now ALSO blocks non-admin changes to
--   profiles.vendor_id (INSERT and UPDATE). Previously only role/id were
--   guarded while profiles_update_own allowed any user to set their own
--   vendor_id — the exact hole the old `AND role = 'vendor'` policy
--   conjuncts were compensating for.
-- * Vendor RLS predicates re-aligned to vendor_id-only: identical
--   authorization to the newer subsystems, safe because vendor_id is now
--   admin-only-writable.
-- * No RLS disabled; no table/grant changes; no data rows modified.
-- * Existing accounts keep working unchanged: legacy role='vendor' rows
--   keep their vendor_id and pass the vendor_id-based predicates.
-- * Normal users still cannot self-promote: role is trigger-guarded,
--   vendor_id is now trigger-guarded, rider approval is trigger-guarded.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Pre-flight: refuse to run if any existing role value would violate
--    the normalized constraint (fail loudly, change nothing).
-- ------------------------------------------------------------
DO $preflight$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(DISTINCT role, ', ') INTO v_bad
  FROM public.profiles
  WHERE role IS NOT NULL AND role NOT IN ('user', 'vendor', 'admin');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'profiles.role contains value(s) outside (user, vendor, admin): %', v_bad;
  END IF;
END
$preflight$;

-- ------------------------------------------------------------
-- 1. Normalize profiles_role_check (the constraint that rejected the
--    vendor assignment). 'user'/'vendor'/'admin' are exactly the values
--    the live policies and code recognize; CHECK passes for NULL
--    (signup may insert role IS NULL, per profiles_insert_own).
-- ------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'vendor', 'admin'));


-- ------------------------------------------------------------
-- 2. Harden escalation protection: vendor_id is admin-only-writable.
--    CREATE OR REPLACE keeps the existing
--    trg_prevent_profile_role_escalation (UPDATE) and
--    trg_prevent_profile_role_escalation_insert (INSERT) triggers bound.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Defend INSERT-time role escalation (unchanged behaviour).
    IF NOT public.is_admin() AND NEW.role IS NOT NULL AND NEW.role <> 'user' THEN
      RAISE EXCEPTION 'Cannot create profile with role %', NEW.role;
    END IF;
    -- Vendor capability is admin-assigned only (multi-role support).
    IF NOT public.is_admin() AND NEW.vendor_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot create profile with a vendor assignment';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE path
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot change profile id';
  END IF;
  IF NOT public.is_admin() AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Cannot change profile role';
  END IF;
  -- Vendor capability is admin-assigned only (multi-role support).
  IF NOT public.is_admin() AND NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    RAISE EXCEPTION 'Cannot change profile vendor assignment';
  END IF;
  RETURN NEW;
END
$fn$;


-- ------------------------------------------------------------
-- 3. Re-align the four older vendor RLS predicates to vendor_id-only,
--    matching the authorization model the newer subsystems
--    (withdrawal_requests / vendor_settlements / transfers /
--    transfer_recipients) already use. Safe now that vendor_id is
--    admin-only-writable (section 2). Effective access for existing
--    vendor accounts is IDENTICAL (they already carry role='vendor' +
--    vendor_id; the role conjunct was redundant for them and only
--    blocked admins with a vendor_id from acting as vendors).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "products_select_vendor" ON public.products;
DROP POLICY IF EXISTS "products_insert_vendor" ON public.products;
DROP POLICY IF EXISTS "products_update_vendor" ON public.products;
DROP POLICY IF EXISTS "order_items_select_vendor" ON public.order_items;

CREATE POLICY "products_select_vendor" ON public.products
  FOR SELECT
  USING (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "products_insert_vendor" ON public.products
  FOR INSERT
  WITH CHECK (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "products_update_vendor" ON public.products
  FOR UPDATE
  USING (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "order_items_select_vendor" ON public.order_items
  FOR SELECT
  USING (
    vendor_id IN (SELECT vendor_id FROM public.profiles WHERE id = auth.uid())
  );


-- order_has_vendor_item(): SECURITY DEFINER helper driving
-- orders_select_vendor / orders_update_vendor (20260821). Same re-alignment.
CREATE OR REPLACE FUNCTION public.order_has_vendor_item(oid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = oid
      AND oi.vendor_id = (
        SELECT vendor_id FROM public.profiles
        WHERE id = auth.uid()
      )
  );
$fn$;

-- ------------------------------------------------------------
-- 4. Rewrite the admin vendor-assignment RPC:
--    * sets/clears ONLY vendor_id — never touches role, so an admin keeps
--      'admin' while gaining vendor capability and a plain user keeps
--      'user' — no capability is ever lost;
--    * keeps is_admin() gate, profile-exists and vendor-exists validation;
--    * admins may be assigned as vendors (Admin+Vendor combination).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_user_to_vendor(
  target_user_id   uuid,
  target_vendor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Admin-only: reuse the existing (untouched) is_admin() SECURITY DEFINER helper.
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  -- The target must have a profile row.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_user_id) THEN
    RAISE EXCEPTION 'Target user has no profile';
  END IF;

  -- Unassign: NULL clears the vendor capability, role stays untouched.
  IF target_vendor_id IS NULL THEN
    UPDATE public.profiles
    SET vendor_id = NULL
    WHERE id = target_user_id;
    RETURN;
  END IF;

  -- The vendor account must exist.
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = target_vendor_id) THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;

  -- Assign: link the vendor account. Role is NEVER modified — multi-role
  -- capable (an admin keeps 'admin', a user keeps 'user').
  UPDATE public.profiles
  SET vendor_id = target_vendor_id
  WHERE id = target_user_id;
END
$fn$;

-- ------------------------------------------------------------
-- 5. Re-grant RPC/helper execute (idempotent; keeps the documented contract).
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.assign_user_to_vendor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_has_vendor_item(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 5b. Vendor notification recipients follow the new vendor definition.
--     Re-emit handle_order_notifications() (20260903) with the ONLY change
--     being the two vendor-recipient lookups: `role = 'vendor'` is dropped
--     and vendor capability is identified by the vendor_id link alone —
--     the same definition used by RLS, the dashboard gate, and the
--     withdrawal/settlement/transfer subsystems.
--       * Vendor (vendor_id set)                  → receives vendor notifications
--         Admin + Vendor (role='admin' + vendor_id) → receives them too
--         Admin without vendor_id                 → NOT a recipient
--         Normal user without vendor_id           → NOT a recipient
--     Everything else in the function (customer, rider, actor-aware
--     cancellation, status transitions, dedup, trigger bindings) is
--     byte-identical to 20260903 and untouched.
-- ------------------------------------------------------------
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
      WHERE p.vendor_id = NEW.vendor_id
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
  WHERE p.vendor_id IN (
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

-- ============================================================
-- 6. SUMMARY
-- ============================================================
-- * profiles_role_check now matches the documented value set exactly
--   ('user','vendor','admin') — legacy vendor assignment no longer errors,
--   and no legitimate value is lost.
-- * profiles.role is no longer written by assignment at all; capabilities:
--     admin  = profiles.role='admin'   (is_admin(), unchanged)
--     vendor = profiles.vendor_id IS NOT NULL (admin-assigned, tamper-proof)
--     rider  = riders row, status='approved'  (unchanged)
-- * All combinations (Admin+Vendor, Admin+Rider, Vendor+Rider,
--   Admin+Vendor+Rider) are representable without overwriting anything.
-- * Escalation trigger now guards role AND id AND vendor_id.
-- * RLS re-aligned to vendor_id-only for products/order_items vendor
--   policies + order_has_vendor_item(); identical effective access for
--   existing vendors; no RLS disabled; no grants weakened.
-- * handle_order_notifications() vendor recipients are now resolved by the
--   vendor_id link alone (20260903 required role='vendor' too): a Vendor and
--   an Admin+Vendor both receive vendor notifications; an admin or normal
--   user without a vendor_id does not. Customer/rider notification behavior
--   is unchanged.
-- * Legacy rows (role='vendor') keep working: they retain vendor_id and
--   pass the vendor_id-based predicates; the check accepts their role.
-- ============================================================
