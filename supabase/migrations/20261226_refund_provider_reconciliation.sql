-- 20261226_refund_provider_reconciliation.sql
-- Provider-authenticated refund terminal reconciliation. No new refund states.

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS provider_reconciliation_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_refunds_provider_reconciliation
  ON public.refunds (status, provider_reconciliation_claimed_at, updated_at)
  WHERE status IN ('pending','processing');

CREATE OR REPLACE FUNCTION public.claim_stale_refunds_for_reconciliation(p_batch_size integer DEFAULT 25)
RETURNS TABLE(refund_id uuid, gateway_refund_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
    RAISE EXCEPTION 'invalid reconciliation batch size';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT r.id
      FROM public.refunds r
     WHERE r.status IN ('pending','processing')
       AND r.gateway_refund_id IS NOT NULL
       AND r.updated_at < now() - interval '10 minutes'
       AND (r.provider_reconciliation_claimed_at IS NULL
            OR r.provider_reconciliation_claimed_at < now() - interval '10 minutes')
     ORDER BY r.updated_at
     FOR UPDATE SKIP LOCKED
     LIMIT p_batch_size
  ), claimed AS (
    UPDATE public.refunds r
       SET provider_reconciliation_claimed_at=now(), updated_at=now()
      FROM candidates c
     WHERE r.id=c.id
     RETURNING r.id, r.gateway_refund_id
  )
  SELECT id, gateway_refund_id FROM claimed;
END; $$;
REVOKE ALL ON FUNCTION public.claim_stale_refunds_for_reconciliation(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stale_refunds_for_reconciliation(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_provider_refund_event(
  p_provider_status text, p_provider_ref text DEFAULT NULL,
  p_transaction_ref text DEFAULT NULL, p_amount_kobo bigint DEFAULT NULL,
  p_currency text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.refunds%ROWTYPE; p public.payments%ROWTYPE; v_success boolean;
BEGIN
  IF p_provider_status NOT IN ('pending','processing','processed','failed') THEN
    RETURN json_build_object('ignored',true,'reason','unsupported provider refund status');
  END IF;
  SELECT r0.* INTO r FROM public.refunds r0
   WHERE (p_provider_ref IS NOT NULL AND r0.gateway_refund_id=p_provider_ref)
      OR (p_transaction_ref IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.payments px
         WHERE px.id=r0.payment_id AND (px.transaction_id=p_transaction_ref OR px.reference=p_transaction_ref)))
   ORDER BY r0.updated_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('ignored',true,'reason','refund identity not found'); END IF;
  SELECT * INTO p FROM public.payments WHERE id=r.payment_id FOR UPDATE;
  IF p.currency IS DISTINCT FROM COALESCE(NULLIF(p_currency,''),p.currency)
     OR (p_amount_kobo IS NOT NULL AND p_amount_kobo <> round(r.amount * 100))
     OR (p_transaction_ref IS NOT NULL AND p.transaction_id IS DISTINCT FROM p_transaction_ref AND p.reference IS DISTINCT FROM p_transaction_ref) THEN
    RETURN json_build_object('ignored',true,'reason','provider identity or amount mismatch','refund_id',r.id);
  END IF;
  IF r.status IN ('processed','failed','rejected') THEN
    RETURN json_build_object('refund_id',r.id,'status',r.status,'terminal',true);
  END IF;
  IF p_provider_status IN ('pending','processing') THEN
    RETURN json_build_object('refund_id',r.id,'status',r.status,'terminal',false);
  END IF;
  v_success := p_provider_status='processed';
  RETURN public.apply_refund_result(r.id,v_success,CASE WHEN p_provider_ref IS NULL THEN r.gateway_refund_id ELSE p_provider_ref END,CASE WHEN v_success THEN NULL ELSE 'Paystack refund failed' END);
END; $$;
REVOKE ALL ON FUNCTION public.apply_provider_refund_event(text,text,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_refund_event(text,text,text,bigint,text) TO service_role;
