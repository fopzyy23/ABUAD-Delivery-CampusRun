-- One order-scoped reservation for mutually exclusive refund/reimbursement
-- execution. Ownership is acquired before an external provider call and is
-- retained through ambiguous failures for administrative reconciliation.

CREATE TABLE IF NOT EXISTS public.financial_resolution_reservations (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  owner text NOT NULL CHECK (owner IN ('refund','reimbursement','conflict')),
  state text NOT NULL DEFAULT 'reserved'
    CHECK (state IN ('reserved','terminal','admin_resolution_required')),
  payment_id uuid REFERENCES public.payments(id),
  refund_id uuid REFERENCES public.refunds(id),
  cancellation_id uuid REFERENCES public.cancellations(id),
  reserved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_resolution_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financial_resolution_reservations FROM PUBLIC, anon, authenticated;

-- Backfill only deterministic evidence. A conflict is retained as an explicit
-- admin-resolution lock; it is never silently resolved by choosing a winner.
INSERT INTO public.financial_resolution_reservations
  (order_id, owner, state, payment_id, refund_id, cancellation_id)
SELECT x.order_id, CASE WHEN x.has_refund AND x.has_reimbursement THEN 'conflict'
                        WHEN x.has_refund THEN 'refund' ELSE 'reimbursement' END,
       CASE WHEN x.has_refund AND x.has_reimbursement THEN 'admin_resolution_required'
            WHEN x.has_terminal THEN 'terminal' ELSE 'reserved' END,
       x.payment_id, x.refund_id, x.cancellation_id
FROM (
  SELECT o.id AS order_id,
         bool_or(r.id IS NOT NULL) AS has_refund,
         bool_or(t.id IS NOT NULL) AS has_reimbursement,
         bool_or(r.status = 'processed' OR t.status = 'success') AS has_terminal,
         min(r.payment_id::text) FILTER (WHERE r.id IS NOT NULL)::uuid AS payment_id,
         min(r.id::text) FILTER (WHERE r.id IS NOT NULL)::uuid AS refund_id,
         min(c.id::text) FILTER (WHERE t.id IS NOT NULL)::uuid AS cancellation_id
  FROM public.orders o
  LEFT JOIN public.refunds r ON r.order_id=o.id
    AND r.status IN ('approved','processing','processed')
  LEFT JOIN public.cancellations c ON c.order_id=o.id
  LEFT JOIN public.transfers t ON t.cancellation_id=c.id
    AND t.transfer_kind='customer_reimbursement'
    AND t.status IN ('pending','processing','success')
  GROUP BY o.id
) x
ON CONFLICT (order_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reserve_financial_resolution(
  p_order_id uuid, p_owner text, p_payment_id uuid DEFAULT NULL,
  p_refund_id uuid DEFAULT NULL, p_cancellation_id uuid DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.financial_resolution_reservations%ROWTYPE;
BEGIN
  IF p_owner NOT IN ('refund','reimbursement') THEN
    RAISE EXCEPTION 'invalid financial resolution owner';
  END IF;
  SELECT * INTO v FROM public.financial_resolution_reservations
    WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.financial_resolution_reservations
      (order_id,owner,state,payment_id,refund_id,cancellation_id)
    VALUES (p_order_id,p_owner,'reserved',p_payment_id,p_refund_id,p_cancellation_id);
    RETURN true;
  END IF;
  IF v.owner = p_owner THEN
    RETURN true;
  END IF;
  RAISE EXCEPTION 'financial resolution is already owned by %', v.owner;
END; $$;

REVOKE ALL ON FUNCTION public.reserve_financial_resolution(uuid,text,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_financial_resolution(uuid,text,uuid,uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_refund_for_execution(p_refund_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.refunds%ROWTYPE; p public.payments%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.refunds WHERE id=p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund % not found', p_refund_id; END IF;
  SELECT * INTO p FROM public.payments WHERE id=r.payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment for refund % not found', p_refund_id; END IF;
  IF r.status='processing' THEN
    RETURN json_build_object('refund_id',r.id,'status','processing','claim',false);
  END IF;
  IF r.status<>'approved' THEN
    RAISE EXCEPTION 'Refund % has status % — only approved refunds can be claimed',p_refund_id,r.status;
  END IF;
  PERFORM public.reserve_financial_resolution(r.order_id,'refund',r.payment_id,r.id,NULL);
  UPDATE public.refunds SET status='processing',updated_at=now() WHERE id=r.id;
  RETURN json_build_object('refund_id',r.id,'status','processing','claim',true,'previous_status','approved');
END; $$;
REVOKE ALL ON FUNCTION public.claim_refund_for_execution(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_refund_for_execution(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_financial_resolution_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_order_id uuid; v_payment_id uuid; v_refund_id uuid; v_cancel_id uuid;
BEGIN
  IF TG_TABLE_NAME='refunds' THEN
    IF NEW.status='processed' THEN
      PERFORM public.reserve_financial_resolution(NEW.order_id,'refund',NEW.payment_id,NEW.id,NULL);
      UPDATE public.financial_resolution_reservations SET state='terminal',updated_at=now()
        WHERE order_id=NEW.order_id AND owner='refund';
    ELSIF NEW.status='failed' AND OLD.status IS DISTINCT FROM 'processed' THEN
      DELETE FROM public.financial_resolution_reservations
        WHERE order_id=NEW.order_id AND owner='refund' AND state='reserved';
    END IF;
  ELSIF TG_TABLE_NAME='transfers' AND NEW.transfer_kind='customer_reimbursement' THEN
    SELECT order_id INTO v_order_id FROM public.cancellations WHERE id=NEW.cancellation_id;
    IF v_order_id IS NULL THEN RAISE EXCEPTION 'reimbursement cancellation has no order'; END IF;
    IF NEW.status IN ('pending','processing','success') THEN
      PERFORM public.reserve_financial_resolution(v_order_id,'reimbursement',NULL,NULL,NEW.cancellation_id);
    END IF;
    IF NEW.status='success' THEN
      UPDATE public.financial_resolution_reservations SET state='terminal',updated_at=now()
        WHERE order_id=v_order_id AND owner='reimbursement';
    ELSIF NEW.status IN ('failed','reversed')
      AND OLD.status IS DISTINCT FROM 'success' THEN
      DELETE FROM public.financial_resolution_reservations
        WHERE order_id=v_order_id AND owner='reimbursement' AND state='reserved';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_refund_financial_resolution ON public.refunds;
CREATE TRIGGER trg_guard_refund_financial_resolution
BEFORE INSERT OR UPDATE OF status ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.guard_financial_resolution_write();

DROP TRIGGER IF EXISTS trg_guard_reimbursement_financial_resolution ON public.transfers;
CREATE TRIGGER trg_guard_reimbursement_financial_resolution
BEFORE INSERT OR UPDATE OF status ON public.transfers
FOR EACH ROW WHEN (NEW.transfer_kind='customer_reimbursement')
EXECUTE FUNCTION public.guard_financial_resolution_write();

REVOKE ALL ON FUNCTION public.guard_financial_resolution_write() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_financial_resolution_write() TO service_role;

-- Paystack acceptance is not provider-confirmed refund completion. Preserve
-- processing ownership and the provider identifier until a trusted terminal
-- reconciliation path records success or failure.
CREATE OR REPLACE FUNCTION public.mark_refund_provider_pending(
  p_refund_id uuid, p_gateway_refund_id text, p_reason text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.refunds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.refunds WHERE id=p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund % not found', p_refund_id; END IF;
  IF r.status IN ('processed','rejected') THEN
    RETURN json_build_object('refund_id',r.id,'status',r.status,'terminal',true);
  END IF;
  IF r.status <> 'processing' THEN
    RAISE EXCEPTION 'Refund % is not processing', p_refund_id;
  END IF;
  UPDATE public.refunds SET gateway_refund_id=COALESCE(p_gateway_refund_id,gateway_refund_id),
    reason=COALESCE(p_reason,reason),updated_at=now() WHERE id=r.id;
  RETURN json_build_object('refund_id',r.id,'status','processing','terminal',false,
    'gateway_refund_id',p_gateway_refund_id);
END; $$;
REVOKE ALL ON FUNCTION public.mark_refund_provider_pending(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_refund_provider_pending(uuid,text,text) TO service_role;
