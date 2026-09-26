-- Phase E3: final-lock automatic 8 PM cutoff cancellation.
-- The scheduler/worker and Paystack execution remain outside the database.

ALTER TABLE public.automatic_cutoff_claims
  ADD COLUMN IF NOT EXISTS cancellation_id uuid REFERENCES public.cancellations(id),
  ADD COLUMN IF NOT EXISTS reimbursement_transfer_id uuid REFERENCES public.transfers(id);

-- Re-declare E1 without checking session_user inside a SECURITY DEFINER
-- function. The established project authorization mechanism for internal RPCs
-- is REVOKE from client roles plus GRANT to service_role below.
CREATE OR REPLACE FUNCTION public.claim_automatic_8pm_cutoff_orders(p_batch_size integer DEFAULT 50)
RETURNS TABLE (claim_id uuid, order_id uuid, claimed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
  v_now timestamp;
  v_cutoff time;
  v_batch_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 50), 1), 250);
  v_order public.orders%ROWTYPE;
  v_claim public.automatic_cutoff_claims%ROWTYPE;
BEGIN
  SELECT COALESCE(NULLIF(trim(s.timezone), ''), 'Africa/Lagos'),
         CASE
           WHEN EXTRACT(ISODOW FROM (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(trim(s.timezone), ''), 'Africa/Lagos'))) BETWEEN 1 AND 5
             THEN s.weekday_delivery_end
           ELSE s.weekend_delivery_end
         END
    INTO v_timezone, v_cutoff
    FROM public.site_settings s
   WHERE s.id = 1;

  v_timezone := COALESCE(v_timezone, 'Africa/Lagos');
  v_cutoff := COALESCE(v_cutoff, '20:00'::time);
  v_now := CURRENT_TIMESTAMP AT TIME ZONE v_timezone;
  IF v_now::time < v_cutoff THEN RETURN; END IF;

  UPDATE public.automatic_cutoff_claims
     SET status = 'expired', updated_at = now()
   WHERE status IN ('claimed','processing')
     AND lease_until <= CURRENT_TIMESTAMP;

  FOR v_order IN
    SELECT o.*
      FROM public.orders o
     WHERE o.status IN ('Order confirmed','Preparing')
       AND o.rider_id IS NULL
       AND (
         (o.request_type = 'restaurant' AND o.delivery_method = 'rider' AND o.payment_status = 'success')
         OR
         (o.request_type = 'vendor_request' AND o.delivery_method = 'rider'
          AND o.vendor_delivery_requested = true AND o.delivery_payment_status = 'success')
       )
       AND o.cancellation_stage = 'none'
       AND o.cancellation_requested_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.cancellations c WHERE c.order_id = o.id)
       AND NOT EXISTS (
         SELECT 1 FROM public.automatic_cutoff_claims ac
          WHERE ac.order_id = o.id
            AND ac.status IN ('claimed','processing')
            AND ac.lease_until > CURRENT_TIMESTAMP
       )
     ORDER BY o.created_at, o.id
     FOR UPDATE OF o SKIP LOCKED
     LIMIT v_batch_size
  LOOP
    INSERT INTO public.automatic_cutoff_claims(order_id)
    VALUES (v_order.id)
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_claim;
    IF FOUND THEN
      claim_id := v_claim.id;
      order_id := v_claim.order_id;
      claimed_at := v_claim.claimed_at;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_automatic_8pm_cutoff_claim(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.automatic_cutoff_claims%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_funding public.purchase_funding%ROWTYPE;
  v_existing public.cancellations%ROWTYPE;
  v_funding_transfer public.transfers%ROWTYPE;
  v_cancellation public.cancellations%ROWTYPE;
  v_transfer_id uuid;
  v_stage text;
  v_amount numeric;
  v_paid numeric;
  v_error text;
BEGIN
  SELECT * INTO v_claim
    FROM public.automatic_cutoff_claims
   WHERE id = p_claim_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'automatic cutoff claim not found'; END IF;

  IF v_claim.status = 'completed' THEN
    RETURN jsonb_build_object('claim_id', v_claim.id, 'order_id', v_claim.order_id, 'status', v_claim.status);
  END IF;
  IF v_claim.status = 'processing' AND v_claim.lease_until > CURRENT_TIMESTAMP THEN
    RETURN jsonb_build_object('claim_id', v_claim.id, 'order_id', v_claim.order_id, 'status', v_claim.status);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_claim.order_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.automatic_cutoff_claims
       SET status = 'failed', last_error = 'order not found', updated_at = now()
     WHERE id = v_claim.id;
    RETURN jsonb_build_object('claim_id', v_claim.id, 'status', 'failed');
  END IF;

  -- Every eligibility value is read again after the order lock.
  IF v_order.status NOT IN ('Order confirmed','Preparing')
     OR v_order.rider_id IS NOT NULL
     OR v_order.cancellation_stage <> 'none'
     OR v_order.cancellation_requested_at IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.cancellations c WHERE c.order_id = v_order.id)
     OR NOT (
       (v_order.request_type = 'restaurant' AND v_order.delivery_method = 'rider' AND v_order.payment_status = 'success')
       OR
       (v_order.request_type = 'vendor_request' AND v_order.delivery_method = 'rider'
        AND v_order.vendor_delivery_requested = true AND v_order.delivery_payment_status = 'success')
     ) THEN
    UPDATE public.automatic_cutoff_claims
       SET status = 'completed', processed_at = now(), last_error = CASE
         WHEN v_order.rider_id IS NOT NULL THEN 'rider accepted before final lock'
         WHEN v_order.status = 'Cancelled' THEN 'order already cancelled'
         ELSE 'order no longer eligible'
       END, updated_at = now()
     WHERE id = v_claim.id;
    RETURN jsonb_build_object('claim_id', v_claim.id, 'order_id', v_order.id, 'status', 'completed', 'cancelled', false);
  END IF;

  SELECT * INTO v_existing FROM public.cancellations WHERE order_id = v_order.id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.automatic_cutoff_claims
       SET status = 'completed', cancellation_id = v_existing.id, processed_at = now(), updated_at = now()
     WHERE id = v_claim.id;
    RETURN jsonb_build_object('claim_id', v_claim.id, 'order_id', v_order.id, 'status', 'completed', 'cancellation_id', v_existing.id, 'cancelled', false);
  END IF;

  SELECT * INTO v_funding FROM public.purchase_funding WHERE order_id = v_order.id FOR UPDATE;
  SELECT * INTO v_funding_transfer FROM public.transfers
   WHERE purchase_funding_id = v_funding.id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND v_funding_transfer.status IN ('processing','success') THEN
    v_stage := 'admin_resolution_required';
  ELSE
    v_stage := 'eligible_for_reimbursement';
  END IF;

  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
    FROM public.payments p
   WHERE p.order_id = v_order.id
     AND p.status = 'success'
     AND p.payment_type IN ('product','replacement');
  v_amount := GREATEST(
    LEAST(v_paid, COALESCE(v_order.final_order_total, v_order.total))
    - COALESCE((SELECT SUM(amount) FROM public.transfers
                WHERE cancellation_id IN (SELECT id FROM public.cancellations WHERE order_id = v_order.id)
                  AND status IN ('success','processing')), 0),
    0
  );

  INSERT INTO public.cancellations(order_id, initiated_by, reason, stage, reimbursement_amount)
  VALUES (v_order.id, v_order.user_id, 'Automatic 8 PM cutoff', v_stage, NULLIF(v_amount, 0))
  RETURNING * INTO v_cancellation;

  -- Use the existing customer-authorized transition rule while holding the
  -- order lock. This makes a later rider claim fail because the order is
  -- already Cancelled; no direct trigger bypass is introduced.
  PERFORM set_config('request.jwt.claim.sub', v_order.user_id::text, true);
  UPDATE public.orders
     SET status = 'Cancelled', cancellation_stage = v_stage,
         cancellation_requested_at = now(), final_financial_status = 'cancelled'
   WHERE id = v_order.id;

  IF v_cancellation.reimbursement_amount IS NULL OR v_stage <> 'eligible_for_reimbursement' THEN
    UPDATE public.automatic_cutoff_claims
       SET status = 'processing', cancellation_id = v_cancellation.id,
           processed_at = now(), updated_at = now()
     WHERE id = v_claim.id;
    RETURN jsonb_build_object('claim_id', v_claim.id, 'order_id', v_order.id, 'cancellation_id', v_cancellation.id, 'status', 'processing', 'cancelled', true, 'reimbursement_transfer_id', NULL);
  END IF;

  BEGIN
    v_transfer_id := public.create_pending_customer_reimbursement_transfer(v_cancellation.id);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
    UPDATE public.automatic_cutoff_claims
       SET status = 'failed', cancellation_id = v_cancellation.id,
           last_error = v_error, updated_at = now()
     WHERE id = v_claim.id;
    RETURN jsonb_build_object('claim_id', v_claim.id, 'order_id', v_order.id, 'cancellation_id', v_cancellation.id, 'status', 'failed', 'cancelled', true, 'reimbursement_transfer_id', NULL, 'error', v_error);
  END;

  UPDATE public.automatic_cutoff_claims
     SET status = 'processing', cancellation_id = v_cancellation.id,
         reimbursement_transfer_id = v_transfer_id, processed_at = now(), updated_at = now()
   WHERE id = v_claim.id;
  RETURN jsonb_build_object('claim_id', v_claim.id, 'order_id', v_order.id, 'cancellation_id', v_cancellation.id, 'status', 'processing', 'cancelled', true, 'reimbursement_transfer_id', v_transfer_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_automatic_8pm_cutoff_orders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automatic_8pm_cutoff_orders(integer) TO service_role;
REVOKE ALL ON FUNCTION public.finalize_automatic_8pm_cutoff_claim(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_automatic_8pm_cutoff_claim(uuid) TO service_role;
REVOKE ALL ON TABLE public.automatic_cutoff_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.automatic_cutoff_claims TO service_role;
