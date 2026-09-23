-- ============================================================
-- 20261022_rider_earnings_foundation.sql
-- Rider earnings foundation: 2-active-delivery cap + lifetime balance.
-- ============================================================
-- SCOPE (targeted only):
--   1. ACTIVE CAP: a rider may hold at most 2 active deliveries at once.
--      Active = status IN ('Rider assigned','Picked up','On the Way').
--      Delivered / Rated / Cancelled never count. Enforced in the existing
--      BEFORE UPDATE trigger (enforce_order_status_transitions), which is
--      the single server choke point every rider claim already passes
--      through. Admin bypass preserved. No RPC/RLS/checkout/vendor/
--      Paystack change.
--   2. LIFETIME BALANCE: get_rider_earnings() and request_withdrawal()
--      previously summed ONLY delivery_settlements with status='pending',
--      so a settlement flipped to 'settled' by a payout made earnings
--      disappear. They now credit every settlement row EXCEPT 'reversed'
--      (the table's status CHECK allows only 'pending'/'settled'/'reversed',
--      so every earned settlement stays in the balance until it is actually
--      reversed), and report the breakdown. Paid-out transfers are NOT
--      subtracted anywhere yet (withdrawal flow is the next task), so
--      'settled' rows remain in the available balance by design.
--   3. SUPPORTING INDEX for the cap count.
-- NOT CHANGED: auth, checkout, vendor, Paystack, referral, coupon,
-- transfers, transfer_recipients, RLS policies, settlement creation.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Supporting index for the active-delivery count.
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_rider_active_cap
  ON public.orders (rider_id, status)
  WHERE rider_id IS NOT NULL
    AND status IN ('Rider assigned', 'Picked up', 'On the Way');

-- ------------------------------------------------------------
-- 2. Active-delivery cap inside the existing status-transition trigger.
-- ------------------------------------------------------------
-- Canonical body copied from 20261007_vendor_followup.sql:41-115, plus
-- ONE injected cap check in the rider-claim branch only. Every other
-- branch (admin bypass, customer, progression, vendor, delivery-method
-- guard) is byte-identical so existing validators keep passing. The
-- trigger itself (trg_enforce_order_status_transitions, BEFORE UPDATE
-- ON orders) stays attached; same-signature CREATE OR REPLACE needs no
-- trigger recreation.
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
    IF OLD.rider_id IS NULL
       AND OLD.status IN ('Order confirmed', 'Ready for pickup')
       AND OLD.delivery_method = 'rider'
       AND (
         (OLD.request_type = 'restaurant' AND OLD.payment_status = 'success')
         OR
         (OLD.request_type = 'vendor_request' AND OLD.vendor_delivery_requested = true)
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

-- ------------------------------------------------------------
-- 3. Lifetime earnings: request_withdrawal() credits every non-reversed
-- settlement (was: pending only). Body identical to
-- 20261005_secure_withdrawal_rpc.sql:7-62 except: (a) the earnings
-- subquery boundary and (b) the variable rename v_pending_earnings ->
-- v_earned (the sum is no longer 'pending'-only).
-- 'reversed' is the only settlement state that must NOT count as owed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_rider public.riders%ROWTYPE;
  v_earned numeric;
  v_encumbered numeric;
  v_available numeric;
  v_withdrawal_id bigint;
BEGIN
  SELECT * INTO v_rider
  FROM public.riders
  WHERE user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No rider application found for this account';
  END IF;
  IF v_rider.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved riders can request withdrawals';
  END IF;
  IF p_amount IS NULL OR NOT (p_amount > 0 AND p_amount < 1000000) THEN
    RAISE EXCEPTION 'Amount must be a valid positive naira value';
  END IF;
  -- LIFETIME (20261022): every delivery settlement that was ever earned
  -- counts (pending + settled); only 'reversed' rows are excluded — the
  -- table CHECK allows no other states. No payout is subtracted here yet
  -- — withdrawal flow is next.
  SELECT COALESCE(SUM(ds.rider_amount), 0) INTO v_earned
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = v_rider.id AND ds.status <> 'reversed';
  SELECT COALESCE(SUM(w.amount), 0) INTO v_encumbered
  FROM public.withdrawal_requests w
  WHERE w.rider_id = v_rider.id AND w.status <> 'rejected';
  v_available := GREATEST(v_earned - v_encumbered, 0);
  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Requested amount exceeds your available balance (available: %)', v_available;
  END IF;
  INSERT INTO public.withdrawal_requests (rider_id, amount, status)
  VALUES (v_rider.id, p_amount, 'pending')
  RETURNING id INTO v_withdrawal_id;
  RETURN json_build_object(
    'withdrawal_id', v_withdrawal_id,
    'amount', p_amount,
    'status', 'pending',
    'available_balance', v_available
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.request_withdrawal(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric) TO authenticated;

-- ------------------------------------------------------------
-- 4. Lifetime earnings: get_rider_earnings() reports the same lifetime
-- boundary plus the legacy pending-only figure for continuity.
-- New keys are ADDITIVE (old keys unchanged), so existing readers keep
-- working: pending_earnings / pending_withdrawals / available_balance /
-- orders are exactly as before.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_rider_earnings(p_rider_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_pending_earnings numeric;
  v_lifetime_earnings numeric;
  v_pending_withdrawals numeric;
  v_available numeric;
  v_lifetime_available numeric;
  v_orders jsonb;
  v_all_orders jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = p_rider_id AND r.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to view earnings for this rider';
  END IF;
  SELECT COALESCE(SUM(ds.rider_amount), 0)
  INTO v_pending_earnings
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = p_rider_id AND ds.status = 'pending';
  -- LIFETIME (20261022): same exclusion rule as request_withdrawal above.
  SELECT COALESCE(SUM(ds.rider_amount), 0)
  INTO v_lifetime_earnings
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = p_rider_id AND ds.status <> 'reversed';
  SELECT COALESCE(SUM(w.amount), 0)
  INTO v_pending_withdrawals
  FROM public.withdrawal_requests w
  WHERE w.rider_id = p_rider_id AND w.status <> 'rejected';
  v_available := GREATEST(v_pending_earnings - v_pending_withdrawals, 0);
  v_lifetime_available := GREATEST(v_lifetime_earnings - v_pending_withdrawals, 0);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', ds.order_id, 'rider_amount', ds.rider_amount)), '[]'::jsonb)
  INTO v_orders
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = p_rider_id AND ds.status = 'pending';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', ds.order_id, 'rider_amount', ds.rider_amount, 'status', ds.status)), '[]'::jsonb)
  INTO v_all_orders
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = p_rider_id AND ds.status <> 'reversed';
  RETURN jsonb_build_object(
    'pending_earnings', v_pending_earnings,
    'lifetime_earnings', v_lifetime_earnings,
    'pending_withdrawals', v_pending_withdrawals,
    'available_balance', v_available,
    'lifetime_available_balance', v_lifetime_available,
    'orders', v_orders,
    'all_orders', v_all_orders
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.get_rider_earnings(uuid) TO authenticated;

