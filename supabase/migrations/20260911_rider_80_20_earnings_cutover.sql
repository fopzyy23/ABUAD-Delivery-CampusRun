-- ============================================================
-- 20260911_rider_80_20_earnings_cutover.sql
-- B5 � Rider 80/20 earnings cutover
-- ============================================================
-- Shifts rider earnings from 100% of orders.fee to the authoritative
-- 80% rider share stored in delivery_settlements.rider_amount.
--
-- Business rule: delivery fee (currently ?1,000) is split
--   rider   = 80% = ?800
--   platform = 20% = ?200
--
-- Depends on: 20260910_create_settlement_ledger.sql (B4B)
-- ============================================================

-- Secure RPC: authoritative rider earnings from the settlement model.
-- The browser never calculates the rider amount � it reads the
-- server-authoritative rider_amount from delivery_settlements.
CREATE OR REPLACE FUNCTION public.get_rider_earnings(p_rider_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_earnings numeric;
  v_pending_withdrawals numeric;
  v_available numeric;
  v_orders jsonb;
BEGIN
  -- Security: caller must own this rider row.
  IF NOT EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = p_rider_id AND r.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to view earnings for this rider';
  END IF;

  -- Authoritative pending earnings = sum of rider_amount from the
  -- settlement model (the 80% rider share), NOT 100% of orders.fee.
  SELECT COALESCE(SUM(ds.rider_amount), 0)
  INTO v_pending_earnings
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = p_rider_id AND ds.status = 'pending';

  -- Pending withdrawal requests already submitted by this rider.
  SELECT COALESCE(SUM(w.amount), 0)
  INTO v_pending_withdrawals
  FROM public.withdrawal_requests w
  WHERE w.rider_id = p_rider_id AND w.status = 'pending';

  v_available := GREATEST(v_pending_earnings - v_pending_withdrawals, 0);

  -- Per-order breakdown for display (authoritative rider_amount each).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id', ds.order_id, 'rider_amount', ds.rider_amount)), '[]'::jsonb)
  INTO v_orders
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = p_rider_id AND ds.status = 'pending';

  RETURN jsonb_build_object(
    'pending_earnings', v_pending_earnings,
    'pending_withdrawals', v_pending_withdrawals,
    'available_balance', v_available,
    'orders', v_orders
  );
END;
$$;

-- Grant execute to authenticated riders.
GRANT EXECUTE ON FUNCTION public.get_rider_earnings(uuid) TO authenticated;