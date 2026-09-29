-- 20261227_financial_resolution_proof_hardening.sql
-- A2: tighten the existing order-scoped reservation authority. This does not
-- create a parallel ownership model or alter refund/reimbursement accounting.

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
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id=p_order_id) THEN
    RAISE EXCEPTION 'financial resolution order not found';
  END IF;
  IF p_owner='refund' AND p_refund_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.refunds WHERE id=p_refund_id AND order_id=p_order_id AND payment_id=p_payment_id) THEN
    RAISE EXCEPTION 'refund reservation identity mismatch';
  END IF;
  IF p_owner='reimbursement' AND p_cancellation_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.cancellations WHERE id=p_cancellation_id AND order_id=p_order_id) THEN
    RAISE EXCEPTION 'reimbursement reservation identity mismatch';
  END IF;

  SELECT * INTO v FROM public.financial_resolution_reservations
   WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.financial_resolution_reservations
      (order_id,owner,state,payment_id,refund_id,cancellation_id)
    VALUES (p_order_id,p_owner,'reserved',p_payment_id,p_refund_id,p_cancellation_id);
    RETURN true;
  END IF;
  IF v.owner = p_owner AND v.state IN ('reserved','terminal','admin_resolution_required') THEN
    RETURN true;
  END IF;
  RAISE EXCEPTION 'financial resolution is already owned by %', v.owner;
END; $$;

REVOKE ALL ON FUNCTION public.reserve_financial_resolution(uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_financial_resolution(uuid,text,uuid,uuid,uuid) TO service_role;
