-- ============================================================
-- 20260920_create_refund_workflow.sql
-- Refund request/approval workflow (GAP 2 — RPCs only)
-- ============================================================
-- Creates the customer-facing refund request RPC and the
-- admin approval/rejection RPCs. Works alongside the existing
-- refunds table, initiate_refund(), and apply_refund_result().
--
-- Conceptual lifecycle:
--   requested → approved → [paystack-refund EF] → processed
--   requested → approved → [paystack-refund EF] → failed
--   requested → rejected
--
-- Depends on:
--   20260909 (payments table)
--   20260910 (refunds table)
--   20260919 (initiate_refund, apply_refund_result)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend refunds.status to support the new workflow statuses
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.refunds'::regclass
      AND contype = 'c'
      AND conname = 'refunds_status_check'
  ) THEN
    ALTER TABLE public.refunds DROP CONSTRAINT refunds_status_check;
  END IF;
END $$;

ALTER TABLE public.refunds
  ADD CONSTRAINT refunds_status_check
    CHECK (status IN ('requested', 'approved', 'rejected', 'pending', 'processed', 'failed'));

-- ------------------------------------------------------------
-- 2. request_refund — customer-facing
--    Validates order ownership, validates payment, creates a
--    refund request with status 'requested'. Idempotent.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_refund(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_refund public.refunds%ROWTYPE;
  v_refund_id uuid;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Order % does not belong to you', p_order_id;
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id AND status = 'success'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % has no successful payment — cannot request refund', p_order_id;
  END IF;

  -- Idempotency: return existing refund if one already exists
  SELECT * INTO v_refund
  FROM public.refunds
  WHERE payment_id = v_payment.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'refund_id', v_refund.id,
      'payment_id', v_payment.id,
      'order_id', v_order.id,
      'amount', v_payment.amount,
      'status', v_refund.status,
      'reason', v_refund.reason,
      'already_existed', true
    );
  END IF;

  INSERT INTO public.refunds (payment_id, order_id, amount, status, reason)
  VALUES (v_payment.id, v_order.id, v_payment.amount, 'requested', p_reason)
  RETURNING id INTO v_refund_id;

  RETURN json_build_object(
    'refund_id', v_refund_id,
    'payment_id', v_payment.id,
    'order_id', v_order.id,
    'amount', v_payment.amount,
    'status', 'requested',
    'reason', p_reason,
    'already_existed', false
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. approve_refund — admin-only
--    Transitions 'requested' → 'approved'. Only an admin can
--    approve a refund request.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_refund(
  p_refund_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

  IF v_refund.status != 'requested' THEN
    RAISE EXCEPTION 'Refund % has status % — only ''requested'' refunds can be approved',
      p_refund_id, v_refund.status;
  END IF;

  UPDATE public.refunds
  SET status = 'approved', updated_at = now()
  WHERE id = p_refund_id;

  RETURN json_build_object(
    'refund_id', p_refund_id,
    'status', 'approved',
    'previous_status', 'requested'
  );
END;
$$;

-- ------------------------------------------------------------
-- 4. reject_refund — admin-only
--    Transitions 'requested' → 'rejected'. Records the rejection
--    reason. Only an admin can reject a refund request.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_refund(
  p_refund_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

  IF v_refund.status != 'requested' THEN
    RAISE EXCEPTION 'Refund % has status % — only ''requested'' refunds can be rejected',
      p_refund_id, v_refund.status;
  END IF;

  UPDATE public.refunds
  SET status = 'rejected',
      reason = COALESCE(p_reason, v_refund.reason),
      updated_at = now()
  WHERE id = p_refund_id;

  RETURN json_build_object(
    'refund_id', p_refund_id,
    'status', 'rejected',
    'previous_status', 'requested',
    'reason', COALESCE(p_reason, v_refund.reason)
  );
END;
$$;

-- ------------------------------------------------------------
-- 5. EXECUTE lockdown — server-only RPCs
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.request_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_refund(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_refund(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_refund(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_refund(uuid, text) TO authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * refunds.status CHECK extended to: requested, approved,
--   rejected, pending, processed, failed
-- * request_refund: customer-facing, ownership-validated,
--   idempotent, creates 'requested' refund
-- * approve_refund: admin-only, 'requested' → 'approved'
-- * reject_refund: admin-only, 'requested' → 'rejected'
-- * All three: SECURITY DEFINER, search_path = public,
--   EXECUTE locked down
-- ============================================================