-- ============================================================
-- 20260925_fix_apply_refund_result_updated_at.sql
-- FIX: Runtime error raised on the SUCCESS path of
--   public.apply_refund_result(uuid, boolean, text, text):
--     42703: column "updated_at" of relation "orders" does not exist
--
-- Root cause: the function (created by 20260919) executes
--   UPDATE public.orders SET payment_status='refunded', updated_at=now() ...
-- but the live `orders` table has NO `updated_at` column (only `payments`
-- does). This error is raised AFTER Paystack has already accepted the
-- refund, leaving refunds stuck in `approved` with gateway_refund_id=null.
--
-- Smallest safe fix: drop ONLY `updated_at = now()` from the `orders`
-- UPDATE. Do NOT add an orders.updated_at column. All other behavior is
-- unchanged.
--
-- Preserved:
--   * signature: apply_refund_result(uuid, boolean, text, text)
--   * SECURITY DEFINER + SET search_path = public
--   * service_role-only EXECUTE permission (REVOKE/GRANT unchanged)
--   * FOR UPDATE locking on refunds + payments
--   * idempotency / terminal-state (processed|rejected) checks
--   * failed-state handling (p_success = false)
--   * app.order_server_update 'on'/'off' GUC (20260924 fix retained)
--   * payments.updated_at = now()  (payments HAS updated_at) unchanged
--   * order payment_status guard: 'success' -> 'refunded' only
--   * refunds.status transition to processed/failed
--
-- 20260919 + 20260924 are NOT modified. Idempotent: safe to re-run.
-- Does NOT touch Paystack credentials, the Edge Function, or any other
-- table/function. No money movement: this finalizes an already-Paystack-
-- accepted refund locally.
-- ============================================================

DROP FUNCTION IF EXISTS public.apply_refund_result(uuid, boolean, text, text);

CREATE OR REPLACE FUNCTION public.apply_refund_result(
  p_refund_id       uuid,
  p_success         boolean,
  p_gateway_refund_id text,
  p_reason          text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund       public.refunds%ROWTYPE;
  v_payment      public.payments%ROWTYPE;
  v_order_status text;
BEGIN
  -- Idempotency / terminal states (unchanged)
  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Refund % not found', p_refund_id;
  END IF;

  IF v_refund.status = 'processed' OR v_refund.status = 'rejected' THEN
    RETURN json_build_object(
      'refund_id', v_refund.id,
      'status',    v_refund.status,
      'terminal',  true,
      'message',   'Refund already processed; state unchanged'
    );
  END IF;

  -- Lock the linked payment row (unchanged)
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

    -- Protected payment column writes (unchanged). GUC MUST stay 'on'
    -- (the 20260924 fix) so the B1 prevent_order_unauthorized_changes
    -- trigger recognizes this as a server-side update.
    PERFORM set_config('app.order_server_update', 'on', true);

    UPDATE public.payments
      SET status = 'refunded',
          updated_at = now()
      WHERE id = v_refund.payment_id;

    -- Cascade to order payment_status. Only flip 'success' -> 'refunded'.
    -- FIX: orders has no updated_at column; do NOT set it. Only payment_status.
    SELECT payment_status INTO v_order_status
    FROM public.orders
    WHERE id = v_refund.order_id;

    IF v_order_status = 'success' THEN
      UPDATE public.orders
        SET payment_status = 'refunded'
        WHERE id = v_refund.order_id
          AND payment_status = 'success';
    END IF;

    PERFORM set_config('app.order_server_update', 'off', true);

    RETURN json_build_object(
      'refund_id',        v_refund.id,
      'status',           'processed',
      'terminal',         false,
      'payment_refunded', true,
      'order_refunded',   (v_order_status = 'success')
    );
  ELSE
    UPDATE public.refunds
      SET status = 'failed',
          reason = COALESCE(p_reason, v_refund.reason),
          updated_at = now()
      WHERE id = p_refund_id;

    -- payment.status and orders.payment_status are intentionally left
    -- unchanged: a failed Paystack attempt leaves the original success
    -- state intact so a retry (or manual review) can proceed.
    RETURN json_build_object(
      'refund_id',        v_refund.id,
      'status',           'failed',
      'terminal',         false,
      'payment_refunded', false,
      'order_refunded',   false
    );
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 4. EXECUTE lockdown — server-only RPCs (unchanged from 20260919)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) TO service_role;

-- ============================================================
-- SUMMARY
-- * apply_refund_result redefined with orders.updated_at write REMOVED
-- * 'on'/'off' app.order_server_update GUC preserved
-- * payments.updated_at write preserved (payments HAS the column)
-- * All refund security + behavior unchanged; no new money movement
-- ============================================================
