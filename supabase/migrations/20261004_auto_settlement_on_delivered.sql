-- 20261004_auto_settlement_on_delivered.sql
-- L-B1: automatic idempotent settlement generation on delivered orders.
-- Append-only. No existing migration, policy, grant or RPC is altered.
-- Core settlement logic is byte-identical to the canonical body in
-- 20260930_critical_hardening.sql section 5 (which added the is_admin
-- gate and the riders.user_id recipient fix on top of the 20260927
-- stored-split-column body). This file extracts that body into an
-- internal shared engine and adds a failure-proof AFTER UPDATE trigger.

-- 1. SHARED SETTLEMENT ENGINE (server-side only).
CREATE OR REPLACE FUNCTION public._settle_order_core(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
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
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE order_id = p_order_id AND status = 'success' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % has no successful payment - cannot settle', p_order_id;
  END IF;

  IF v_order.status != 'Delivered' THEN
    RAISE EXCEPTION 'Order % is not Delivered (status: %) - cannot settle', p_order_id, v_order.status;
  END IF;

  SELECT count(*) INTO v_count FROM public.vendor_settlements WHERE order_id = p_order_id;
  IF v_count > 0 THEN
    RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', true, 'vendor_settlements', v_count);
  END IF;

  FOR v_item IN
    SELECT oi.vendor_id, SUM(oi.price * oi.qty) AS total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.vendor_id
  LOOP
    INSERT INTO public.vendor_settlements (order_id, vendor_id, amount, status)
    VALUES (p_order_id, v_item.vendor_id, v_item.total, 'pending')
    RETURNING id INTO v_vendor_settlement_id;

    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'vendor' AND vendor_id = v_item.vendor_id;

    IF FOUND THEN
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

  INSERT INTO public.delivery_settlements (order_id, rider_id, delivery_fee, rider_amount, platform_amount, status)
  VALUES (
    p_order_id,
    v_order.rider_id,
    v_order.fee,
    v_order.rider_delivery_share,
    v_order.company_delivery_share,
    'pending'
  )
  RETURNING id INTO v_delivery_settlement_id;

  IF v_order.rider_id IS NOT NULL THEN
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'rider'
      AND profile_id = (SELECT user_id FROM public.riders WHERE id = v_order.rider_id);

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
$func$;

REVOKE ALL ON FUNCTION public._settle_order_core(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._settle_order_core(uuid) TO service_role;

-- 2. generate_settlement: same signature, same is_admin gate, same grants.
-- Now a thin admin wrapper delegating to the shared core, so manual admin
-- settlement and automatic trigger settlement can never diverge.
CREATE OR REPLACE FUNCTION public.generate_settlement(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin privileges required';
  END IF;

  RETURN public._settle_order_core(p_order_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.generate_settlement(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_settlement(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_settlement(uuid) FROM PUBLIC;

-- 3. AUTOMATIC TRIGGER: settles an order the moment it becomes eligible.
-- Fires AFTER UPDATE OF status (courier/vendor marks Delivered) and AFTER
-- UPDATE OF payment_status (late webhook success on an already-delivered
-- order). Strict guard: Delivered AND paid AND newly eligible only.
-- The core call runs inside its own BEGIN/EXCEPTION block: a settlement
-- failure degrades to a WARNING and can NEVER abort or corrupt the order
-- status transition itself. AFTER triggers cannot modify NEW, so the
-- delivery update always persists exactly as the status-transition trigger
-- approved it.
CREATE OR REPLACE FUNCTION public.auto_settle_delivered_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.status = 'Delivered' AND NEW.payment_status = 'success'
     AND (OLD.status IS DISTINCT FROM 'Delivered' OR OLD.payment_status IS DISTINCT FROM 'success') THEN
    BEGIN
      v_result := public._settle_order_core(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto settlement skipped for order %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_auto_settle_on_status ON public.orders;
CREATE TRIGGER trg_auto_settle_on_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_settle_delivered_order();

DROP TRIGGER IF EXISTS trg_auto_settle_on_payment ON public.orders;
CREATE TRIGGER trg_auto_settle_on_payment
AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_settle_delivered_order();
