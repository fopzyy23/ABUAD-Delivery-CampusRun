-- 20261005_secure_withdrawal_rpc.sql
-- H-1: server-authoritative withdrawal request creation.
-- Append-only. Closes the direct-INSERT bypass: request_withdrawal() is
-- the ONLY creation path for rider withdrawals after this migration.

-- 1. request_withdrawal RPC.
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_rider public.riders%ROWTYPE;
  v_pending_earnings numeric;
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

  SELECT COALESCE(SUM(ds.rider_amount), 0) INTO v_pending_earnings
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = v_rider.id AND ds.status = 'pending';

  SELECT COALESCE(SUM(w.amount), 0) INTO v_encumbered
  FROM public.withdrawal_requests w
  WHERE w.rider_id = v_rider.id AND w.status <> 'rejected';

  v_available := GREATEST(v_pending_earnings - v_encumbered, 0);

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

-- 2. get_rider_earnings aligned to the same boundary: encumber every
-- non-rejected request so the displayed balance always matches the RPC.
CREATE OR REPLACE FUNCTION public.get_rider_earnings(p_rider_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_pending_earnings numeric;
  v_pending_withdrawals numeric;
  v_available numeric;
  v_orders jsonb;
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

  SELECT COALESCE(SUM(w.amount), 0)
  INTO v_pending_withdrawals
  FROM public.withdrawal_requests w
  WHERE w.rider_id = p_rider_id AND w.status <> 'rejected';

  v_available := GREATEST(v_pending_earnings - v_pending_withdrawals, 0);

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
$func$;

GRANT EXECUTE ON FUNCTION public.get_rider_earnings(uuid) TO authenticated;

-- 3. Close the direct-INSERT bypass.
DROP POLICY IF EXISTS "withdrawal_requests_insert_own" ON public.withdrawal_requests;
REVOKE INSERT ON public.withdrawal_requests FROM authenticated;
