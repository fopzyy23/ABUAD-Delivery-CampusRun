-- Repair derived reservation metadata only. No payments/refunds/transfers are
-- deleted or rewritten. Table locks serialize this one-time evidence snapshot.
BEGIN;
-- Obsolete 20261024 constraint knows only settlements/withdrawals and blocks
-- the later purchase-funding and customer-reimbursement transfer kinds.
ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_one_payout_source_check;
LOCK TABLE public.orders, public.refunds, public.cancellations, public.transfers,
  public.financial_resolution_reservations IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.financial_resolution_repair_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL,
  before_state jsonb,
  after_state jsonb,
  repaired_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.financial_resolution_repair_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_resolution_repair_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.financial_resolution_repair_audit TO service_role;

CREATE TEMP TABLE resolution_before ON COMMIT DROP AS
SELECT order_id,to_jsonb(r) AS value FROM public.financial_resolution_reservations r;

-- The historical bug created evidence-free reimbursement reservations. Remove
-- only that exact shape on orders with NO refund or cancellation history at all.
DELETE FROM public.financial_resolution_reservations r
WHERE r.owner='reimbursement' AND r.state='reserved'
  AND r.payment_id IS NULL AND r.refund_id IS NULL AND r.cancellation_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.refunds f WHERE f.order_id=r.order_id)
  AND NOT EXISTS (SELECT 1 FROM public.cancellations c WHERE c.order_id=r.order_id);

INSERT INTO public.financial_resolution_reservations AS existing
  (order_id,owner,state,payment_id,refund_id,cancellation_id)
SELECT o.id,
  CASE WHEN f.present AND t.present THEN 'conflict' WHEN f.present THEN 'refund' ELSE 'reimbursement' END,
  CASE WHEN f.present AND t.present THEN 'admin_resolution_required'
       WHEN f.terminal OR t.terminal THEN 'terminal' ELSE 'reserved' END,
  f.payment_id,f.refund_id,t.cancellation_id
FROM public.orders o
CROSS JOIN LATERAL (
  SELECT count(*)>0 AS present,COALESCE(bool_or(status='processed'),false) AS terminal,
    min(payment_id::text)::uuid AS payment_id,min(id::text)::uuid AS refund_id
  FROM public.refunds WHERE order_id=o.id AND status IN ('approved','processing','processed')
) f
CROSS JOIN LATERAL (
  SELECT count(*)>0 AS present,COALESCE(bool_or(tr.status='success'),false) AS terminal,
    min(c.id::text)::uuid AS cancellation_id
  FROM public.cancellations c JOIN public.transfers tr ON tr.cancellation_id=c.id
  WHERE c.order_id=o.id AND tr.transfer_kind='customer_reimbursement' AND tr.status IN ('pending','processing','success')
) t
WHERE f.present OR t.present
ON CONFLICT (order_id) DO UPDATE SET
  owner=CASE WHEN existing.owner='conflict' THEN 'conflict' ELSE EXCLUDED.owner END,
  state=CASE WHEN existing.owner='conflict' OR EXCLUDED.owner='conflict' THEN 'admin_resolution_required'
             WHEN existing.state IN ('terminal','admin_resolution_required') THEN existing.state ELSE EXCLUDED.state END,
  payment_id=COALESCE(EXCLUDED.payment_id,existing.payment_id),
  refund_id=COALESCE(EXCLUDED.refund_id,existing.refund_id),
  cancellation_id=COALESCE(EXCLUDED.cancellation_id,existing.cancellation_id),updated_at=now();

INSERT INTO public.financial_resolution_repair_audit(order_id,before_state,after_state)
SELECT COALESCE(b.order_id,a.order_id),b.value,to_jsonb(a)
FROM resolution_before b FULL JOIN public.financial_resolution_reservations a USING(order_id)
WHERE (b.value - 'updated_at') IS DISTINCT FROM (to_jsonb(a) - 'updated_at');
COMMIT;
