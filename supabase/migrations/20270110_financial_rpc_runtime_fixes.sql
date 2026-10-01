-- Forward-only corrections. Pricing, cancellation eligibility and provider behavior are unchanged.
BEGIN;
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
      SELECT SUM(tr.amount) FROM public.transfers AS tr
      WHERE tr.cancellation_id IN (SELECT ca.id FROM public.cancellations AS ca WHERE ca.order_id=o.id)
        AND tr.status IN ('success','processing')
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

REVOKE ALL ON FUNCTION public.request_customer_cancellation(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_customer_cancellation(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.store_replacement_payment_checkout(
  p_order_id uuid,
  p_reference text,
  p_amount numeric,
  p_authorization_url text,
  p_access_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  o public.orders%ROWTYPE;
  p public.payments%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.additional_amount_due IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'replacement amount mismatch';
  END IF;

  -- Find the existing obligation payment row (created by create_replacement_payment_obligation)
  SELECT * INTO p
  FROM public.payments
  WHERE replacement_obligation_id = o.id
    AND status IN ('pending', 'success')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Update the existing obligation payment with checkout details
    UPDATE public.payments AS checkout
    SET
      reference = p_reference,
      authorization_url = p_authorization_url,
      access_code = p_access_code,
      updated_at = now()
    WHERE checkout.id = p.id;
    RETURN p.id;
  ELSE
    -- Fallback: if no obligation exists yet (shouldn't happen in normal flow),
    -- create a new payment row. This maintains backward compatibility.
    INSERT INTO public.payments (
      order_id, reference, amount, currency, status, payment_type,
      replacement_obligation_id, authorization_url, access_code
    ) VALUES (
      p_order_id, p_reference, p_amount, 'NGN', 'pending', 'replacement',
      p_order_id, p_authorization_url, p_access_code
    ) RETURNING payments.id INTO v_payment_id;
    RETURN v_payment_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.store_replacement_payment_checkout(uuid,text,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.store_replacement_payment_checkout(uuid,text,numeric,text,text) TO service_role;
COMMIT;
