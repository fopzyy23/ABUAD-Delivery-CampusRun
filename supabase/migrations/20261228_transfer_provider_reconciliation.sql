-- 20261228_transfer_provider_reconciliation.sql
-- A3: provider identity checks and recovery for ambiguous settlement transfers.

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS provider_reconciliation_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_transfers_provider_reconciliation
  ON public.transfers(status, provider_reconciliation_claimed_at, updated_at)
  WHERE status='processing';

CREATE OR REPLACE FUNCTION public.validate_transfer_provider_event(
  p_reference text, p_transfer_code text DEFAULT NULL, p_amount_kobo bigint DEFAULT NULL,
  p_currency text DEFAULT NULL, p_recipient_code text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transfers%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.transfers WHERE paystack_reference=p_reference FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('valid',false,'reason','transfer reference not found'); END IF;
  IF NULLIF(p_transfer_code,'') IS NOT NULL AND t.transfer_code IS NOT NULL AND p_transfer_code<>t.transfer_code THEN
    RETURN jsonb_build_object('valid',false,'reason','transfer code mismatch');
  END IF;
  IF p_amount_kobo IS NOT NULL AND p_amount_kobo <> round(t.amount*100) THEN
    RETURN jsonb_build_object('valid',false,'reason','amount mismatch');
  END IF;
  IF p_currency IS NOT NULL AND upper(p_currency) <> upper(t.currency) THEN
    RETURN jsonb_build_object('valid',false,'reason','currency mismatch');
  END IF;
  IF NULLIF(p_recipient_code,'') IS NOT NULL AND p_recipient_code<>t.recipient_code THEN
    RETURN jsonb_build_object('valid',false,'reason','recipient mismatch');
  END IF;
  RETURN jsonb_build_object('valid',true,'transfer_id',t.id,'status',t.status);
END; $$;
REVOKE ALL ON FUNCTION public.validate_transfer_provider_event(text,text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.validate_transfer_provider_event(text,text,bigint,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_stale_settlement_transfers(p_batch_size integer DEFAULT 25)
RETURNS TABLE(transfer_id uuid, paystack_reference text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_batch_size IS NULL OR p_batch_size<1 OR p_batch_size>100 THEN RAISE EXCEPTION 'invalid transfer reconciliation batch size'; END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT t.id FROM public.transfers t
     WHERE t.status='processing'
       AND (t.vendor_settlement_id IS NOT NULL OR t.delivery_settlement_id IS NOT NULL)
       AND t.updated_at < now()-interval '30 minutes'
       AND (t.provider_reconciliation_claimed_at IS NULL OR t.provider_reconciliation_claimed_at < now()-interval '30 minutes')
     ORDER BY t.updated_at FOR UPDATE SKIP LOCKED LIMIT p_batch_size
  ), claimed AS (
    UPDATE public.transfers t SET provider_reconciliation_claimed_at=now(),updated_at=now()
      FROM candidates c WHERE t.id=c.id RETURNING t.id,t.paystack_reference
  ) SELECT id,paystack_reference FROM claimed;
END; $$;
REVOKE ALL ON FUNCTION public.claim_stale_settlement_transfers(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stale_settlement_transfers(integer) TO service_role;
