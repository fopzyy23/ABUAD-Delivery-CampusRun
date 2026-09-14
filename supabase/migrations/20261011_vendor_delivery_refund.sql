-- ============================================================
-- 20261011_vendor_delivery_refund.sql
-- Stage 4B: Vendor Delivery Payment Refund Workflow
-- ============================================================
-- Extends the existing refund system to support payment_type='vendor_delivery'.
-- Product refunds (restaurant/vendor products) remain unchanged.
-- Vendor product payments (pending_vendor) remain completely separate.
-- ============================================================

-- ------------------------------------------------------------
-- 1. EXTEND REFUNDS TABLE: Add payment_type context
-- ------------------------------------------------------------
-- The refunds table already references payments via payment_id.
-- The payment_type is available via the payment FK, but for
-- query convenience and future-proofing we add a computed view
-- or rely on the FK. No schema change needed for refunds table.

-- ------------------------------------------------------------
-- 2. EXTEND ORDERS.payment_status CHECK for delivery refunds
-- ------------------------------------------------------------
-- delivery_payment_status already has 'refunded' from 20261010
-- No change needed here.

-- ------------------------------------------------------------
-- 3. EXTEND request_refund RPC — Support Vendor Delivery Payments
-- ------------------------------------------------------------
-- Currently request_refund only finds product payments (status='success').
-- Extend to also find vendor_delivery payments with delivery_payment_status='success'.
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

  -- Find the relevant successful payment for this order
  -- Priority: vendor_delivery payment (if delivery was paid), then product payment
  SELECT * INTO v_payment
  FROM public.payments
  WHERE order_id = p_order_id
    AND status = 'success'
    AND (
      -- Vendor delivery payment (for rider delivery fee)
      (payment_type = 'vendor_delivery' AND v_order.delivery_payment_status = 'success')
      OR
      -- Product payment (restaurant or vendor products)
      (payment_type = 'product' AND v_order.payment_status = 'success')
    )
  ORDER BY
    -- Prefer vendor_delivery if delivery was paid
    CASE WHEN payment_type = 'vendor_delivery' THEN 1 ELSE 2 END,
    created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % has no successful payment — cannot request refund', p_order_id;
  END IF;

  -- Idempotency: return existing refund if one already exists for this payment
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

GRANT EXECUTE ON FUNCTION public.request_refund(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_refund(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_refund(uuid, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- 4. EXTEND initiate_refund RPC — Support Vendor Delivery Payments
-- ------------------------------------------------------------
-- Allow refund initiation for vendor_delivery payments (status='success')
-- and product payments. The payment_type is checked via the payment record.
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

GRANT EXECUTE ON FUNCTION public.initiate_refund(uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.initiate_refund(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.initiate_refund(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.initiate_refund(uuid, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- 5. EXTEND apply_refund_result RPC — Handle Vendor Delivery Refunds
-- ------------------------------------------------------------
-- When refunding a vendor_delivery payment:
-- * Update delivery_payment_status to 'refunded'
-- * Do NOT change payment_status (stays pending_vendor)
-- * Do NOT cascade to product payment_status
-- For product payments: existing behavior preserved
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
  v_order public.orders%ROWTYPE;
  v_order_payment_status text;
  v_order_delivery_payment_status text;
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

    -- Get the order to determine which payment status to update
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_refund.order_id;

    IF v_payment.payment_type = 'vendor_delivery' THEN
      -- VENDOR DELIVERY REFUND: Update delivery_payment_status only
      -- Product payment_status (pending_vendor) remains UNCHANGED
      -- FIX: orders has no updated_at column; do NOT set it. Only delivery_payment_status.
      UPDATE public.orders
      SET delivery_payment_status = 'refunded'
      WHERE id = v_refund.order_id
        AND delivery_payment_status = 'success';

      RETURN json_build_object(
        'refund_id', v_refund.id,
        'status', 'processed',
        'terminal', false,
        'payment_refunded', true,
        'order_delivery_payment_refunded', true,
        'order_product_payment_unchanged', true
      );
    ELSE
      -- PRODUCT PAYMENT REFUND: Existing behavior
      SELECT payment_status INTO v_order_payment_status
      FROM public.orders
      WHERE id = v_refund.order_id;

      UPDATE public.payments
      SET status = 'refunded',
          updated_at = now()
      WHERE id = v_refund.payment_id;

      -- Cascade to the order's payment_status. Only flip when it is still 'success'
      -- — never silently overwrite a different terminal state.
      -- FIX: orders has no updated_at column; do NOT set it. Only payment_status.
      IF v_order_payment_status = 'success' THEN
        UPDATE public.orders
        SET payment_status = 'refunded'
        WHERE id = v_refund.order_id
          AND payment_status = 'success';
      END IF;

      RETURN json_build_object(
        'refund_id', v_refund.id,
        'status', 'processed',
        'terminal', false,
        'payment_refunded', true,
        'order_refunded', (v_order_payment_status = 'success')
      );
    END IF;

    -- CORRECTED: reset to 'off' (equivalent to unset for the B1 check).
    PERFORM set_config('app.order_server_update', 'off', true);
  ELSE
    -- Failed refund: update refund status, leave payment/order unchanged
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

GRANT EXECUTE ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- 6. EXTEND claim_refund_for_execution — No changes needed
-- ------------------------------------------------------------
-- The existing claim_refund_for_execution works for both payment types
-- since it operates on the refunds table (which references payments via payment_id).
-- The payment_type is resolved at execution time in the Edge Function.

-- ------------------------------------------------------------
-- 7. REFUND NOTIFICATIONS — Already work for both types
-- ------------------------------------------------------------
-- The handle_refund_status_notifications trigger already fires on
-- refunds table INSERT/UPDATE and looks up the customer via order_id.
-- It works for both payment types since refunds.order_id links to orders.

-- ------------------------------------------------------------
-- 8. REFUND WORKFLOW RPCs (approve/reject) — No changes needed
-- ------------------------------------------------------------
-- approve_refund and reject_refund operate on refunds table only.
-- They validate status='requested' and are admin-only.
-- Payment type is irrelevant at approval stage.

-- ------------------------------------------------------------
-- 9. UPDATE VALIDATORS (no schema changes, just behavioral updates above)
-- ------------------------------------------------------------

-- ============================================================
-- SUMMARY
-- ============================================================
-- * request_refund: Now finds vendor_delivery payments (delivery_payment_status='success')
--   AND product payments (payment_status='success'). Prefers delivery payment if both exist.
-- * initiate_refund: Already works for vendor_delivery (checks payment.status='success')
-- * apply_refund_result: Branches on payment_type:
--     - vendor_delivery: updates delivery_payment_status='refunded', preserves payment_status=pending_vendor
--     - product: existing behavior (updates payment_status='refunded')
-- * initiate_refund, claim_refund_for_execution, approve_refund, reject_refund: No changes needed
-- * paystack-refund Edge Function: Needs update to handle vendor_delivery payments
-- * Notifications: Already work via existing trigger on refunds table
-- * Admin workflow (approve/reject): No changes needed
-- * Restaurant refunds: Completely unchanged
-- * Vendor product payments (pending_vendor): Completely separate, unaffected