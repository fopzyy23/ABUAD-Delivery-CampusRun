-- ============================================================
-- 20260916_require_paid_orders_for_rider_claim.sql
-- ============================================================
-- Closes the server-side Rider Hub payment-eligibility gap.

-- PROBLEM
--   The frontend rider pool now requires payment_status = 'success' (app.js:
--   loadOrdersFromSupabase() pool query + rider() pending filter), but the
--   database `orders_update_claim` RLS policy did NOT require
--   payment_status = 'success'. An authenticated client could therefore bypass
--   the frontend and directly UPDATE an unpaid, unassigned rider-delivery
--   order into 'Rider assigned' (claim its)..
--
-- FIX (smallest safe change)
--   Recreate ONLY `orders_update_claim`, preserving every existing condition
--   and adding one server-side requirement: `payment_status = 'success'`
--   in the USING clause (the old row must already be paid before a rider can
--   claim its). No other policy, function, trigger, table, grant, or column is
--   changed. No frontend change is required (the app already does both filters)..
--
-- PREVIOUS POLICY (canonical definition: 20260821_fix_orders_rls_recursion.sql,
--   which replaced the 20260815 / 20260818 / 20260820 variants; no later
--   migration redefines it)..
--   USING:
--     1. status IN ('Order confirmed', 'Ready for pickup')
--     2. rider_id IS NULL
--     3. delivery_method = 'rider'
--     4. public.is_available_rider()   (EXISTS riders WHERE user_id = auth.uid()
--                                             AND status = 'approved' AND available = true)
--   WITH CHECK:
--     5. public.caller_owns_rider(rider_id)  (EXISTS riders WHERE id = rider_id
--                                               AND user_id = auth.uid()))
--     6. status = 'Rider assigned'
--
-- NEW POLICY: identical to the above + `AND payment_status = 'success'` in USING.
-- ============================================================

DROP POLICY IF EXISTS "orders_update_claim" ON public.orders;

CREATE POLICY "orders_update_claim" ON public.orders
  FOR UPDATE
  USING (
    status IN ('Order confirmed', 'Ready for pickup')
    AND rider_id IS NULL
    AND delivery_method = 'rider'
    AND payment_status = 'success'
    AND public.is_available_rider()
  )
  WITH CHECK (
    public.caller_owns_rider(rider_id)
    AND status = 'Rider assigned'
  );

-- ============================================================
-- SUMMARY
-- ============================================================
-- * All previous claim restrictions preserved: eligible-pool status whitelist,
--   rider_id IS NULL, delivery_method = 'rider', approved+available rider
--   check, WITH CHECK caller_owns_rider(rider_id) + status = 'Rider assigned'.
-- * New: an unassigned rider-delivery order can be claimed ONLY when
--   payment_status = 'success' — matching the frontend Rider Hub eligibility and
--   the intended business rule (unpaid orders must never be claimable by riders).
-- * Ownership model untouched: claim still requires the caller's OWN riders.row
--   (riders.user_id = auth.uid())。 RLS on orders / riders / order_items is unchanged..
-- ============================================================