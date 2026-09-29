-- 20261230_finalize_transfer_reconciliation_entrypoints.sql
-- Replace the old webhook-only reconciliation placeholders. PostgreSQL never
-- contacts Paystack; the trusted paystack-transfer-reconcile Edge Function
-- performs provider verification and calls apply_transfer_webhook_event.

CREATE OR REPLACE FUNCTION public.reconcile_transfer(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transfers%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.transfers WHERE id=p_transfer_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transfer % not found',p_transfer_id; END IF;
  RETURN jsonb_build_object(
    'transfer_id',t.id,
    'reference',t.paystack_reference,
    'status',t.status,
    'needs_provider_verification',t.status='processing',
    'reconciled',false,
    'provider_call_required',t.status='processing'
  );
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_transfer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_transfer(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_stuck_transfers(p_max_age_minutes integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;
BEGIN
  IF p_max_age_minutes IS NULL OR p_max_age_minutes < 1 OR p_max_age_minutes > 1440 THEN
    RAISE EXCEPTION 'invalid transfer reconciliation age';
  END IF;
  -- Claim only; provider verification is performed by the trusted Edge
  -- worker using the immutable Paystack reference. The returned count is
  -- explicitly a claim count, never a false reconciliation count.
  SELECT count(*) INTO v_count
    FROM public.claim_stale_settlement_transfers(25);
  RETURN jsonb_build_object(
    'claimed_for_provider_verification',v_count,
    'reconciled',0,
    'provider_verification_required',v_count
  );
END; $$;
REVOKE ALL ON FUNCTION public.reconcile_stuck_transfers(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stuck_transfers(integer) TO service_role;
