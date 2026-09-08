-- ============================================================
-- 20260924_fix_refund_guc_value.sql
-- ============================================================
-- LAUNCH-BLOCKING FIX: wrong GUC value in apply_refund_result()
--
-- ROOT CAUSE (verified against code, see 20260919 lines 176/197 vs
-- 20260907 line 66):
--   apply_refund_result() set the B1 server-update guard to 'true':
--       set_config('app.order_server_update', 'true', true)
--   but the B1 trigger prevent_order_unauthorized_changes()
--   (20260907_lock_order_payment_columns.sql) only accepts 'on':
--       COALESCE(current_setting('app.order_server_update', true), 'off') = 'on'
--   'true' <> 'on' => guard false => the orders.payment_status='refunded'
--   update inside a SUCCESSFUL refund raised
--     'payment_status is server-managed and cannot be changed by clients'
--   aborting the whole RPC transaction (including the refunds.status
--   update). Paystack had already refunded the customer while the DB row
--   stayed 'approved' — reopening the duplicate-refund window.
--
-- THIS MIGRATION (value-only correction):
--   * Recreates public.apply_refund_result(uuid, boolean, text, text)
--     with the IDENTICAL body from 20260919, changing ONLY:
--         'true'  -> 'on'    (before the protected-column updates)
--         'false' -> 'off'   (reset after the protected-column updates)
--     ('off' is equivalent to unset for the trigger's
--     COALESCE(..., 'off') = 'on' comparison — the trigger cannot fire
--     outside the opted-in window either way.)
--   * No business logic, refund amount logic, status logic, Paystack
--     logic, signature, LANGUAGE, SECURITY DEFINER, or search_path change.
--   * Re-asserts the identical REVOKE/GRANT lockdown from 20260919
--     (CREATE OR REPLACE does not alter privileges; the statements are
--     repeated to preserve the exact lockdown state idempotently).
--   * Idempotent: CREATE OR REPLACE + IF EXISTS grants are re-runnable.
--   * The original 20260919 migration is NOT modified.
-- ============================================================

-- ------------------------------------------------------------
-- apply_refund_result — records Paystack refund outcome
-- (body identical to 20260919 except the two GUC values)
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
    -- CORRECTED: the B1 trigger (20260907) accepts exactly 'on'.
    PERFORM set_config('app.order_server_update', 'on', true);

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

    -- CORRECTED: reset to 'off' (equivalent to unset for the B1 check).
    PERFORM set_config('app.order_server_update', 'off', true);

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
-- EXECUTE lockdown — identical to 20260919 (server-only RPCs)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.initiate_refund(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_refund(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) TO service_role;
