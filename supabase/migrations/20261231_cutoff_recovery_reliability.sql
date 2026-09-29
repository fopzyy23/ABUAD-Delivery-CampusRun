-- 20261231_cutoff_recovery_reliability.sql
-- Align cutoff states with the bounded retry model and restore attempt-aware
-- reimbursement retries without weakening financial-resolution ownership.

ALTER TABLE public.automatic_cutoff_claims DROP CONSTRAINT IF EXISTS automatic_cutoff_claims_status_check;
ALTER TABLE public.automatic_cutoff_claims ADD CONSTRAINT automatic_cutoff_claims_status_check
  CHECK (status IN ('claimed','processing','completed','failed','expired','admin_resolution_required'));

CREATE OR REPLACE FUNCTION public.create_pending_customer_reimbursement_transfer(p_cancellation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; r public.transfer_recipients%ROWTYPE; f public.purchase_funding%ROWTYPE; existing public.transfers%ROWTYPE; t uuid; next_attempt integer;
BEGIN
  SELECT * INTO c FROM public.cancellations WHERE id=p_cancellation_id FOR UPDATE;
  IF NOT FOUND OR c.stage NOT IN ('eligible_for_reimbursement','reimbursement_pending','reimbursement_failed','reimbursement_reversed','reimbursement_processing') THEN RAISE EXCEPTION 'cancellation is not eligible for reimbursement'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
  SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
  IF FOUND AND f.status IN ('transferred','processing') THEN RAISE EXCEPTION 'purchase funding is transferred or unresolved'; END IF;
  IF c.reimbursement_amount IS NULL OR c.reimbursement_amount<=0 THEN RAISE EXCEPTION 'no authoritative reimbursement amount'; END IF;
  SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='customer' AND profile_id=o.user_id AND is_active=true AND recipient_status='verified' ORDER BY updated_at DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.cancellations SET stage='admin_resolution_required',updated_at=now(),reimbursement_failure_reason='No active verified customer transfer recipient' WHERE id=c.id;
    UPDATE public.orders SET cancellation_stage='admin_resolution_required' WHERE id=o.id;
    RETURN NULL;
  END IF;
  SELECT * INTO existing FROM public.transfers WHERE cancellation_id=c.id ORDER BY attempt_no DESC,created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND existing.status IN ('pending','processing','success') THEN RETURN existing.id; END IF;
  PERFORM public.reserve_financial_resolution(o.id,'reimbursement',NULL,NULL,c.id);
  SELECT COALESCE(MAX(attempt_no),0)+1 INTO next_attempt FROM public.transfers WHERE cancellation_id=c.id;
  UPDATE public.cancellations SET stage='reimbursement_pending',updated_at=now() WHERE id=c.id;
  UPDATE public.orders SET cancellation_stage='reimbursement_pending' WHERE id=o.id;
  INSERT INTO public.transfers(transfer_kind,cancellation_id,payee_type,amount,currency,status,paystack_reference,recipient_code,attempt_no)
  VALUES('customer_reimbursement',c.id,'customer',c.reimbursement_amount,'NGN','pending','dropzyy-reimbursement-'||c.id::text||'-attempt-'||next_attempt::text,r.recipient_code,next_attempt) RETURNING id INTO t;
  RETURN t;
END; $$;
REVOKE ALL ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.automatic_cutoff_claims%ROWTYPE; x public.cancellations%ROWTYPE; t public.transfers%ROWTYPE; id uuid; err text; next_count integer;
BEGIN
  SELECT * INTO c FROM public.automatic_cutoff_claims WHERE id=p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'automatic cutoff claim not found'; END IF;
  IF c.status IN ('completed','admin_resolution_required') THEN RETURN jsonb_build_object('claim_id',c.id,'status',c.status,'retryable',false); END IF;
  IF c.cancellation_id IS NULL THEN
    UPDATE public.automatic_cutoff_claims SET status='admin_resolution_required',last_error='automatic cancellation reference is missing',updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','admin_resolution_required','retryable',false);
  END IF;
  SELECT * INTO x FROM public.cancellations WHERE id=c.cancellation_id AND order_id=c.order_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.automatic_cutoff_claims SET status='admin_resolution_required',last_error='automatic cancellation record not found',updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','admin_resolution_required','retryable',false);
  END IF;
  SELECT * INTO t FROM public.transfers WHERE cancellation_id=x.id ORDER BY attempt_no DESC,created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND t.status='success' THEN
    UPDATE public.automatic_cutoff_claims SET status='completed',reimbursement_transfer_id=t.id,processed_at=COALESCE(processed_at,now()),last_error=NULL,updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','completed','reimbursement_transfer_id',t.id,'retryable',false);
  END IF;
  IF FOUND AND t.status IN ('pending','processing') THEN
    UPDATE public.automatic_cutoff_claims SET status='processing',reimbursement_transfer_id=t.id,last_error=NULL,updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','processing','reimbursement_transfer_id',t.id,'retryable',false,'in_flight',true);
  END IF;
  next_count:=COALESCE(c.retry_count,0)+1;
  IF next_count>COALESCE(c.max_retry_count,5) THEN
    UPDATE public.automatic_cutoff_claims SET status='admin_resolution_required',last_error='Max retry count exceeded ('||COALESCE(c.max_retry_count,5)||')',updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','admin_resolution_required','retryable',false);
  END IF;
  UPDATE public.automatic_cutoff_claims SET retry_count=next_count,status='processing',lease_until=now()+interval '15 minutes',updated_at=now() WHERE id=c.id;
  BEGIN
    id:=public.create_pending_customer_reimbursement_transfer(x.id);
    IF id IS NULL THEN
      UPDATE public.automatic_cutoff_claims SET status='admin_resolution_required',last_error='No active verified customer transfer recipient',updated_at=now() WHERE id=c.id;
      RETURN jsonb_build_object('claim_id',c.id,'status','admin_resolution_required','retryable',false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    UPDATE public.automatic_cutoff_claims SET status=CASE WHEN next_count>=COALESCE(c.max_retry_count,5) THEN 'admin_resolution_required' ELSE 'failed' END,last_error=left(err,500),updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status',CASE WHEN next_count>=COALESCE(c.max_retry_count,5) THEN 'admin_resolution_required' ELSE 'failed' END,'retryable',next_count<COALESCE(c.max_retry_count,5),'error',left(err,500));
  END;
  UPDATE public.automatic_cutoff_claims SET status='processing',reimbursement_transfer_id=id,last_error=NULL,updated_at=now() WHERE id=c.id;
  RETURN jsonb_build_object('claim_id',c.id,'status','processing','reimbursement_transfer_id',id,'retryable',false,'retry_count',next_count);
END; $$;
REVOKE ALL ON FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(uuid) TO service_role;
