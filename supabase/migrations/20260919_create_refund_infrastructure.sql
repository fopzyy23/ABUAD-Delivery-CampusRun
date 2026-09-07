-- ============================================================
-- 20260919_create_refund_infrastructure.sql
-- GAP 1 — Refund database infrastructure (Stage 1: RPCs only)
-- ============================================================
-- Creates the server-side refund RPCs that the future paystack-refund
-- Edge Function will call. Does NOT create the Edge Function, does
-- NOT touch admin.js, does NOT modify settlements/transfers.
--
-- Depends on:
--   20260902 (orders.payment_status)
--   20260907 (app.order_server_update GUC trigger guard)
--   20260909 (payments table + payment RPCs)
--   20260910 (refunds table)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Extend orders.payment_status to allow 'refunded'
-- ------------------------------------------------------------
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%payment_status%IN%'
    AND pg_get_constraintdef(oid) NOT LIKE '%refunded%';
  IF FOUND THEN
    EXECUTE format(
      'ALTER TABLE public.orders DROP CONSTRAINT %I',
      v_conname
    );
  END IF;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('pending', 'success', 'failed', 'refunded'));

-- ------------------------------------------------------------
-- 2. initiate_refund — creates a pending refund idempotently
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initiate_refund(
  p_payment_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_refund public.refunds%ROWTYPE;
  v_refund_id uuid;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id;
  END IF;

  IF v_payment.status != 'success' THEN
    RAISE EXCEPTION 'Payment % has status % — only payments with status ''success'' can be refunded',
      p_payment_id, v_payment.status;
  END IF;

  IF v_payment.transaction_id IS NULL THEN
    RAISE EXCEPTION 'Payment % has no transaction_id — cannot refund via Paystack',
      p_payment_id;
  END IF;

  -- Idempotency: return existing refund if one already exists.
  SELECT * INTO v_refund
  FROM public.refunds
  WHERE payment_id = p_payment_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object(
      'refund_id', v_refund.id,
      'payment_id', v_payment.id,
      'order_id', v_payment.order_id,
      'amount', v_payment.amount,
      'status', v_refund.status,
      'transaction_id', v_payment.transaction_id,
      'gateway_refund_id', v_refund.gateway_refund_id,
      'reason', v_refund.reason,
      'already_existed', true
    );
  END IF;

  INSERT INTO public.refunds (payment_id, order_id, amount, status, reason)
  VALUES (p_payment_id, v_payment.order_id, v_payment.amount, 'pending', p_reason)
  RETURNING id INTO v_refund_id;

  RETURN json_build_object(
    'refund_id', v_refund_id,
    'payment_id', v_payment.id,
    'order_id', v_payment.order_id,
    'amount', v_payment.amount,
    'status', 'pending',
    'transaction_id', v_payment.transaction_id,
    'gateway_refund_id', NULL,
    'reason', p_reason,
    'already_existed', false
  );
END;
$$;

-- ------------------------------------------------------------
-- 3. apply_refund_result — records Paystack refund outcome
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_refund_result(
  p_refund_id uuid,
  p_success boolean,
  p_gateway_refund_id text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_order_status text;
BEGIN
  -- Lock the refund row first; we lock the payment via the FK below.
  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

  -- Terminal-state idempotency: a processed refund never changes.
  IF v_refund.status = 'processed' THEN
    RETURN json_build_object(
      'refund_id', v_refund.id,
      'status', v_refund.status,
      'terminal', true,
      'message', 'Refund already processed; state unchanged'
    );
  END IF;

  -- Lock the linked payment row.
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = v_refund.payment_id
  FOR UPDATE;

  IF p_success THEN
    IF p_gateway_refund_id IS NOT NULL THEN
      UPDATE public.refunds
      SET status = 'processed',
          gateway_refund_id = p_gateway_refund_id,
          updated_at = now()
      WHERE id = p_refund_id;
    ELSE
      UPDATE public.refunds
      SET status = 'processed',
          updated_at = now()
      WHERE id = p_refund_id;
    END IF;

    -- Use the server-update guard to mutate protected payment columns.
    PERFORM set_config('app.order_server_update', 'true', true);

    UPDATE public.payments
    SET status = 'refunded',
        updated_at = now()
    WHERE id = v_refund.payment_id;

    -- Cascade to the order's payment_status. Only flip when it is still 'success'
    -- — never silently overwrite a different terminal state.
    SELECT payment_status INTO v_order_status
    FROM public.orders
    WHERE id = v_refund.order_id;

    IF v_order_status = 'success' THEN
      UPDATE public.orders
      SET payment_status = 'refunded',
          updated_at = now()
      WHERE id = v_refund.order_id
        AND payment_status = 'success';
    END IF;

    PERFORM set_config('app.order_server_update', 'false', true);

    RETURN json_build_object(
      'refund_id', v_refund.id,
      'status', 'processed',
      'terminal', false,
      'payment_refunded', true,
      'order_refunded', (v_order_status = 'success')
    );
  ELSE
    UPDATE public.refunds
    SET status = 'failed',
        reason = COALESCE(p_reason, v_refund.reason),
        updated_at = now()
    WHERE id = p_refund_id;

    -- payment.status and orders.payment_status are intentionally left
    -- unchanged: a failed Paystack attempt leaves the original success state
    -- intact so a retry (or manual review) can proceed.

    RETURN json_build_object(
      'refund_id', v_refund.id,
      'status', 'failed',
      'terminal', false,
      'payment_refunded', false,
      'order_refunded', false
    );
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 4. EXECUTE lockdown — server-only RPCs
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.initiate_refund(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_refund(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) TO service_role;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * orders.payment_status CHECK extended to include 'refunded'
-- * initiate_refund: idempotent pending-refund creation (DB-authoritative)
-- * apply_refund_result: records success/failure, guarded state transitions
-- * Both RPCs: SECURITY DEFINER, service_role EXECUTE only
-- * app.order_server_update guard used for protected column writes
-- ============================================================