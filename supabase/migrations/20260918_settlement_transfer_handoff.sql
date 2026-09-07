-- ============================================================
-- 20260918_settlement_transfer_handoff.sql
-- GAP 2: Settlement -> Transfer handoff
-- ============================================================
-- Connects generate_settlement() to the B6/B7 transfer
-- infrastructure so that eligible settlements create pending
-- transfer ledger records when a transfer recipient exists.
--
-- Depends on:
--   20260910_create_settlement_ledger.sql (B4B)
--   20260913_create_transfer_ledger.sql (B6)
--
-- Business rule:
--   - When a vendor/rider settlement is created and a transfer
--     recipient exists, a pending transfer record is created.
--   - If no recipient exists, the settlement is still created
--     successfully (transfer creation is best-effort).
--   - Settlement amounts remain authoritative from the database.
--   - The change is idempotent: rerunning settlement generation
--     does not create duplicate transfers.
--
-- NOTE: create_pending_transfer() requires a paystack_reference
-- (NOT NULL). At settlement time, no Paystack transfer has been
-- initiated, so a UUID placeholder is generated. The
-- paystack_reference column is NOT in the B6 immutability guard
-- (only vendor_settlement_id, delivery_settlement_id,
-- payee_type, amount, recipient_code are immutable), so the
-- reference can be updated when the actual transfer is
-- initiated (B7).
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_settlement(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_item record;
  v_count integer;
  v_vendor_settlement_id uuid;
  v_delivery_settlement_id uuid;
  v_recipient public.transfer_recipients%ROWTYPE;
  v_transfer_result jsonb;
BEGIN
  -- Lock the order row to serialize concurrent settlement attempts
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Verify payment is successful
  SELECT * INTO v_payment FROM public.payments
  WHERE order_id = p_order_id AND status = 'success' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % has no successful payment - cannot settle', p_order_id;
  END IF;

  -- Verify order is delivered (eligible for settlement)
  IF v_order.status != 'Delivered' THEN
    RAISE EXCEPTION 'Order % is not Delivered (status: %) - cannot settle', p_order_id, v_order.status;
  END IF;

  -- Idempotency: if vendor settlements already exist, return summary
  SELECT count(*) INTO v_count FROM public.vendor_settlements WHERE order_id = p_order_id;
  IF v_count > 0 THEN
    RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', true, 'vendor_settlements', v_count);
  END IF;

  -- Create one vendor settlement per vendor on the order
  -- Amount = authoritative SUM(price * qty) from order_items
  FOR v_item IN
    SELECT oi.vendor_id, SUM(oi.price * oi.qty) AS total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.vendor_id
  LOOP
    INSERT INTO public.vendor_settlements (order_id, vendor_id, amount, status)
    VALUES (p_order_id, v_item.vendor_id, v_item.total, 'pending')
    RETURNING id INTO v_vendor_settlement_id;

    -- Look for existing transfer recipient for this vendor
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'vendor' AND vendor_id = v_item.vendor_id;

    IF FOUND THEN
      -- Create pending transfer if recipient exists (best-effort).
      -- Settlement generation must succeed even if this fails.
      BEGIN
        v_transfer_result := public.create_pending_transfer(
          p_vendor_settlement_id := v_vendor_settlement_id,
          p_paystack_reference := gen_random_uuid()::text,
          p_recipient_code := v_recipient.recipient_code
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create pending transfer for vendor settlement %: %', v_vendor_settlement_id, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Create delivery settlement using authoritative orders.fee
  -- Split: rider = 80%, platform = 20%
  INSERT INTO public.delivery_settlements (order_id, rider_id, delivery_fee, rider_amount, platform_amount, status)
  VALUES (
    p_order_id,
    v_order.rider_id,
    v_order.fee,
    round(v_order.fee * 0.8, 2),
    v_order.fee - round(v_order.fee * 0.8, 2),
    'pending'
  )
  RETURNING id INTO v_delivery_settlement_id;

  -- Look for existing transfer recipient for the rider (if assigned).
  -- vendor_self / unassigned-rider orders have rider_id NULL: no rider payout.
  IF v_order.rider_id IS NOT NULL THEN
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'rider' AND profile_id = v_order.rider_id;

    IF FOUND THEN
      BEGIN
        v_transfer_result := public.create_pending_transfer(
          p_delivery_settlement_id := v_delivery_settlement_id,
          p_paystack_reference := gen_random_uuid()::text,
          p_recipient_code := v_recipient.recipient_code
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create pending transfer for delivery settlement %: %', v_delivery_settlement_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', false);
END;
$$;
