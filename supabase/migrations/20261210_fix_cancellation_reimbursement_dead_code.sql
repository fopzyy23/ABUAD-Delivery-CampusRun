-- ============================================================
-- 20261210_fix_cancellation_reimbursement_dead_code.sql
-- ============================================================
-- Fixes the dead code pattern in create_pending_customer_reimbursement_transfer
-- where admin_resolution_required stage was set but then rolled back by RAISE EXCEPTION.
--
-- The original code:
--   UPDATE public.cancellations SET stage='admin_resolution_required'...
--   RAISE EXCEPTION 'no verified customer transfer recipient';
-- This was a bug because the UPDATE was in the same transaction that rolled back.
--
-- Fix: Split into two cases:
-- 1. If no transfer recipient exists and we CAN'T create one -> persist admin_resolution_required WITHOUT raising
-- 2. Only raise for truly exceptional conditions that should rollback
-- ============================================================

-- Fix create_pending_customer_reimbursement_transfer to properly persist admin_resolution_required
CREATE OR REPLACE FUNCTION public.create_pending_customer_reimbursement_transfer(p_cancellation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.cancellations%ROWTYPE;
  o public.orders%ROWTYPE;
  r public.transfer_recipients%ROWTYPE;
  f public.purchase_funding%ROWTYPE;
  t uuid;
BEGIN
  SELECT * INTO c FROM public.cancellations WHERE id=p_cancellation_id FOR UPDATE;
  IF NOT FOUND OR c.stage NOT IN ('eligible_for_reimbursement','reimbursement_pending') THEN
    RAISE EXCEPTION 'cancellation is not eligible for reimbursement';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
  SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
  IF FOUND AND f.status IN ('transferred','processing') THEN
    RAISE EXCEPTION 'purchase funding is transferred or unresolved';
  END IF;
  IF c.reimbursement_amount IS NULL OR c.reimbursement_amount<=0 THEN
    RAISE EXCEPTION 'no authoritative reimbursement amount';
  END IF;
  SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='customer' AND profile_id=o.user_id FOR SHARE;
  IF NOT FOUND THEN
    -- Persist admin_resolution_required WITHOUT raising (so it commits)
    UPDATE public.cancellations
    SET stage='admin_resolution_required', updated_at=now(),
        reimbursement_failure_reason='No verified customer transfer recipient'
    WHERE id=c.id;
    UPDATE public.orders SET cancellation_stage='admin_resolution_required' WHERE id=o.id;
    -- Return null to signal admin resolution needed (no exception = transaction commits)
    RETURN NULL;
  END IF;
  SELECT id INTO t FROM public.transfers WHERE cancellation_id=c.id FOR UPDATE;
  IF FOUND THEN RETURN t; END IF;
  INSERT INTO public.transfers(transfer_kind,cancellation_id,payee_type,amount,currency,status,paystack_reference,recipient_code)
  VALUES('customer_reimbursement',c.id,'customer',c.reimbursement_amount,'NGN','pending','dropzyy-reimbursement-'||c.id::text,r.recipient_code) RETURNING id INTO t;
  UPDATE public.cancellations SET stage='reimbursement_pending',updated_at=now() WHERE id=c.id;
  UPDATE public.orders SET cancellation_stage='reimbursement_pending' WHERE id=o.id;
  RETURN t;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) TO service_role;