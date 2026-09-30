-- Recover ambiguous customer reimbursement transfers by verifying their
-- existing Paystack attempt. This claims reconciliation work only; it never
-- creates or resubmits a transfer.

CREATE OR REPLACE FUNCTION public.claim_stale_customer_reimbursement_transfers(
  p_batch_size integer DEFAULT 25
)
RETURNS TABLE (
  transfer_id uuid,
  paystack_reference text,
  transfer_code text,
  amount_kobo bigint,
  currency text,
  recipient_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
    RAISE EXCEPTION 'invalid reimbursement reconciliation batch size';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT t.id
      FROM public.transfers t
     WHERE t.transfer_kind = 'customer_reimbursement'
       AND t.payee_type = 'customer'
       AND t.cancellation_id IS NOT NULL
       AND NULLIF(t.paystack_reference, '') IS NOT NULL
       AND t.status = 'processing'
       AND t.updated_at < now() - interval '30 minutes'
       AND (t.provider_reconciliation_claimed_at IS NULL
            OR t.provider_reconciliation_claimed_at < now() - interval '30 minutes')
       AND EXISTS (
         SELECT 1 FROM public.cancellations c
          WHERE c.id = t.cancellation_id
       )
     ORDER BY t.updated_at, t.id
     FOR UPDATE OF t SKIP LOCKED
     LIMIT p_batch_size
  ), claimed AS (
    UPDATE public.transfers t
       SET provider_reconciliation_claimed_at = now()
      FROM candidates c
     WHERE t.id = c.id
     RETURNING t.id, t.paystack_reference, t.transfer_code, t.amount,
               t.currency, t.recipient_code
  )
  SELECT c.id, c.paystack_reference, c.transfer_code,
         round(c.amount * 100)::bigint, c.currency, c.recipient_code
    FROM claimed c;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stale_customer_reimbursement_transfers(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stale_customer_reimbursement_transfers(integer)
  TO service_role;
