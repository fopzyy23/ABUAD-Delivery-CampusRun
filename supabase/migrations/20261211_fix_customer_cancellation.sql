-- ============================================================
-- 20261211_fix_customer_cancellation.sql
-- ============================================================
-- Fixes request_customer_cancellation to:
-- 1. Set order status = 'Cancelled' (not just cancellation_stage)
-- 2. Properly handle unpaid vs paid orders
-- 3. For unpaid orders: cancel without creating reimbursement
-- 4. For paid orders: create cancellation with appropriate stage
-- ============================================================

-- First, let's check the current cancellation_stage values and ensure 'Cancelled' is a valid order status
-- The orders table should already have 'Cancelled' in its status check from earlier migrations

-- Update request_customer_cancellation to properly set order status = 'Cancelled'
CREATE OR REPLACE FUNCTION public.request_customer_cancellation(p_order_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  f public.purchase_funding%ROWTYPE;
  c public.cancellations%ROWTYPE;
  t public.transfers%ROWTYPE;
  paid numeric;
  rid uuid;
  stage text;
  amount numeric;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  
  -- Prevent cancellation of already completed/terminal orders
  IF o.status IN ('Delivered','Rated','Cancelled') THEN
    RAISE EXCEPTION 'order is not cancellable';
  END IF;
  
  -- Check for existing cancellation
  SELECT * INTO c FROM public.cancellations WHERE order_id=o.id FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('cancellation_id',c.id,'stage',c.stage,'reimbursement_amount',c.reimbursement_amount,'already_exists',true);
  END IF;
  
  -- Check payment funding state
  SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
  SELECT * INTO t FROM public.transfers WHERE purchase_funding_id=f.id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND t.status IN ('processing') THEN stage:='admin_resolution_required';
  ELSIF FOUND AND t.status='success' THEN stage:='admin_resolution_required';
  ELSE stage:='eligible_for_reimbursement'; END IF;
  
  -- Calculate amount paid by customer (product + replacement payments only, not vendor delivery)
  SELECT COALESCE(SUM(p.amount),0) INTO paid
  FROM public.payments p
  WHERE p.order_id=o.id AND p.status='success' AND p.payment_type IN ('product','replacement');
  
  -- Calculate reimbursement amount (paid amount minus any already processed reimbursements)
  amount := GREATEST(
    LEAST(paid, COALESCE(o.final_order_total, o.total))
    - COALESCE((
      SELECT SUM(amount) FROM public.transfers
      WHERE cancellation_id IN (SELECT id FROM public.cancellations WHERE order_id=o.id)
        AND status IN ('success','processing')
    ), 0), 0);
  
  -- For unpaid orders (amount = 0), cancel immediately without reimbursement
  IF amount <= 0 THEN
    stage := 'resolved';
  END IF;
  
  INSERT INTO public.cancellations(order_id, initiated_by, reason, stage, reimbursement_amount)
  VALUES (o.id, auth.uid(), COALESCE(NULLIF(trim(p_reason),''),'Customer cancellation'), stage, NULLIF(amount,0))
  RETURNING * INTO c;
  
  -- IMPORTANT: Set the actual order status to 'Cancelled' so it terminates the order lifecycle
  UPDATE public.orders
  SET status = 'Cancelled',
      cancellation_stage = stage,
      cancellation_requested_at = now(),
      final_financial_status = 'cancelled'
  WHERE id = o.id;
  
  RETURN jsonb_build_object('cancellation_id',c.id,'stage',stage,'reimbursement_amount',c.reimbursement_amount,'already_exists',false);
END;
$$;

REVOKE ALL ON FUNCTION public.request_customer_cancellation(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_customer_cancellation(uuid,text) TO authenticated;