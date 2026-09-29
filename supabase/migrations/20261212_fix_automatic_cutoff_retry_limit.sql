-- ============================================================
-- 20261212_fix_automatic_cutoff_retry_limit.sql
-- ============================================================
-- Fixes infinite automatic 8 PM cutoff reimbursement retries by:
-- 1. Adding retry_count and max_retry_count to automatic_cutoff_claims
-- 2. Modifying retry function to respect max retries
-- 3. On max retries reached, set status to 'admin_resolution_required'
-- ============================================================

-- Add retry tracking columns to automatic_cutoff_claims
ALTER TABLE public.automatic_cutoff_claims
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_retry_count integer NOT NULL DEFAULT 5;

-- Create index for retry tracking
CREATE INDEX IF NOT EXISTS idx_automatic_cutoff_claims_retry
  ON public.automatic_cutoff_claims(status, retry_count);

-- Update retry_automatic_8pm_cutoff_reimbursement to respect max retries
CREATE OR REPLACE FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim public.automatic_cutoff_claims%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_cancellation public.cancellations%ROWTYPE;
  v_transfer public.transfers%ROWTYPE;
  v_transfer_id uuid;
  v_error text;
BEGIN
  SELECT * INTO v_claim FROM public.automatic_cutoff_claims
   WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'automatic cutoff claim not found'; END IF;

  -- Check if claim is in a retryable state
  IF v_claim.status NOT IN ('failed','processing') THEN
    RETURN jsonb_build_object('claim_id',v_claim.id,'status',v_claim.status,'retryable',false);
  END IF;
  
  -- Don't retry if already in flight
  IF v_claim.status = 'processing' AND v_claim.lease_until > CURRENT_TIMESTAMP THEN
    RETURN jsonb_build_object('claim_id',v_claim.id,'status',v_claim.status,'retryable',false,'in_flight',true);
  END IF;

  -- Check max retry limit
  IF v_claim.retry_count >= v_claim.max_retry_count THEN
    UPDATE public.automatic_cutoff_claims
       SET status = 'admin_resolution_required',
           last_error = 'Max retry count exceeded (' || v_claim.max_retry_count || ')',
           updated_at = now()
     WHERE id = v_claim.id;
    RETURN jsonb_build_object(
      'claim_id', v_claim.id,
      'status', 'admin_resolution_required',
      'retryable', false,
      'error', 'Max retry count exceeded (' || v_claim.max_retry_count || ')'
    );
  END IF;

  IF v_claim.cancellation_id IS NULL THEN
    UPDATE public.automatic_cutoff_claims SET status='failed',last_error='automatic cancellation reference is missing',updated_at=now() WHERE id=v_claim.id;
    RETURN jsonb_build_object('claim_id',v_claim.id,'status','failed','retryable',false);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id=v_claim.order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'Cancelled' THEN
    UPDATE public.automatic_cutoff_claims SET status='failed',last_error='automatic cancellation order is not Cancelled',updated_at=now() WHERE id=v_claim.id;
    RETURN jsonb_build_object('claim_id',v_claim.id,'status','failed','retryable',false);
  END IF;

  SELECT * INTO v_cancellation FROM public.cancellations
   WHERE id=v_claim.cancellation_id AND order_id=v_order.id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.automatic_cutoff_claims SET status='failed',last_error='automatic cancellation record not found',updated_at=now() WHERE id=v_claim.id;
    RETURN jsonb_build_object('claim_id',v_claim.id,'status','failed','retryable',false);
  END IF;

  SELECT * INTO v_transfer FROM public.transfers
   WHERE cancellation_id=v_cancellation.id
   ORDER BY attempt_no DESC,created_at DESC LIMIT 1 FOR UPDATE;

  IF FOUND AND v_transfer.status='success' THEN
    UPDATE public.automatic_cutoff_claims
       SET status='completed',reimbursement_transfer_id=v_transfer.id,
           processed_at=COALESCE(processed_at,now()),last_error=NULL,updated_at=now()
     WHERE id=v_claim.id;
    RETURN jsonb_build_object('claim_id',v_claim.id,'order_id',v_order.id,
      'cancellation_id',v_cancellation.id,'reimbursement_transfer_id',v_transfer.id,
      'status','completed','reimbursement_status','success','retryable',false);
  END IF;

  -- A processing transfer is already in flight
  IF FOUND AND v_transfer.status='processing' THEN
    UPDATE public.automatic_cutoff_claims
       SET status='processing',reimbursement_transfer_id=v_transfer.id,
           last_error=NULL,updated_at=now()
     WHERE id=v_claim.id;
    RETURN jsonb_build_object('claim_id',v_claim.id,'order_id',v_order.id,
      'cancellation_id',v_cancellation.id,'reimbursement_transfer_id',v_transfer.id,
      'status','processing','reimbursement_status','processing','retryable',false,'in_flight',true);
  END IF;

  -- Increment retry count before attempting
  UPDATE public.automatic_cutoff_claims
     SET retry_count = retry_count + 1,
         updated_at = now()
   WHERE id = v_claim.id;

  BEGIN
    v_transfer_id := public.create_pending_customer_reimbursement_transfer(v_cancellation.id);
  EXCEPTION
    WHEN SQLSTATE '40P01' OR SQLSTATE '40001' THEN RAISE;  -- Re-raise deadlocks/serialization failures
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_error=MESSAGE_TEXT;
      UPDATE public.automatic_cutoff_claims
         SET status='failed',last_error=left(v_error,500),updated_at=now()
       WHERE id=v_claim.id;
      RETURN jsonb_build_object('claim_id',v_claim.id,'order_id',v_order.id,
        'cancellation_id',v_cancellation.id,'status','failed',
        'retryable',true,'error',left(v_error,500));
  END;

  SELECT * INTO v_transfer FROM public.transfers WHERE id=v_transfer_id FOR UPDATE;
  UPDATE public.automatic_cutoff_claims
     SET status=CASE WHEN v_transfer.status='success' THEN 'completed' ELSE 'processing' END,
         reimbursement_transfer_id=v_transfer.id,processed_at=now(),last_error=NULL,updated_at=now()
   WHERE id=v_claim.id;
  RETURN jsonb_build_object('claim_id',v_claim.id,'order_id',v_order.id,
    'cancellation_id',v_cancellation.id,'reimbursement_transfer_id',v_transfer.id,
    'status',CASE WHEN v_transfer.status='success' THEN 'completed' ELSE 'processing' END,
    'reimbursement_status',v_transfer.status,'retryable',false);
END;
$$;

REVOKE ALL ON FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(uuid)
  TO service_role;