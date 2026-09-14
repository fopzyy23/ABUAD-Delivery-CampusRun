-- 20261013_reconcile_vendor_delivery_security.sql
-- Final local reconciliation for the pending vendor-delivery migrations.
-- This migration preserves the hardened payment, refund, settlement, and
-- authorization architecture established before the vendor work.

-- Vendor rider delivery may enter the pool only after its delivery payment
-- succeeds.  These policies retain the existing approved/available-rider and
-- assignment checks while adding the delivery-payment gate.
DROP POLICY IF EXISTS "orders_select_unassigned" ON public.orders;
CREATE POLICY "orders_select_unassigned" ON public.orders
  FOR SELECT USING (
    rider_id IS NULL
    AND delivery_method = 'rider'
    AND (
      (request_type = 'restaurant' AND payment_status = 'success')
      OR (request_type = 'vendor_request'
          AND vendor_delivery_requested = true
          AND delivery_payment_status = 'success')
    )
    AND public.is_approved_rider()
  );

DROP POLICY IF EXISTS "orders_update_claim" ON public.orders;
CREATE POLICY "orders_update_claim" ON public.orders
  FOR UPDATE USING (
    rider_id IS NULL
    AND delivery_method = 'rider'
    AND (
      (request_type = 'restaurant' AND payment_status = 'success')
      OR (request_type = 'vendor_request'
          AND vendor_delivery_requested = true
          AND delivery_payment_status = 'success')
    )
    AND public.is_available_rider()
  )
  WITH CHECK (
    public.caller_owns_rider(rider_id)
    AND status = 'Rider assigned'
  );

DROP POLICY IF EXISTS "order_items_select_rider" ON public.order_items;
CREATE POLICY "order_items_select_rider" ON public.order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM public.orders
      WHERE rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
    )
    OR order_id IN (
      SELECT id FROM public.orders
      WHERE rider_id IS NULL
        AND delivery_method = 'rider'
        AND (
          (request_type = 'restaurant' AND payment_status = 'success')
          OR (request_type = 'vendor_request'
              AND vendor_delivery_requested = true
              AND delivery_payment_status = 'success')
        )
        AND EXISTS (
          SELECT 1 FROM public.riders
          WHERE user_id = auth.uid() AND status = 'approved'
        )
    )
  );

-- The hardened settlement engine is retained, with vendor requests using the
-- successful delivery payment as their payment gate.  Vendor product payment
-- remains private and therefore creates no Dropzyy product settlement.
CREATE OR REPLACE FUNCTION public._settle_order_core(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_item record;
  v_vendor_settlement_id uuid;
  v_delivery_settlement_id uuid;
  v_recipient public.transfer_recipients%ROWTYPE;
  v_transfer_result jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
  IF v_order.status <> 'Delivered' THEN
    RAISE EXCEPTION 'Order % is not Delivered (status: %)', p_order_id, v_order.status;
  END IF;

  IF v_order.request_type = 'vendor_request' AND v_order.delivery_method = 'vendor_self' THEN
    -- Vendor product payment is private; there is no Dropzyy settlement.
    RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', true);
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE order_id = p_order_id AND status = 'success'
    AND (v_order.request_type = 'restaurant' AND payment_type = 'product'
         OR v_order.request_type = 'vendor_request' AND payment_type = 'vendor_delivery')
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % has no successful settlement payment', p_order_id; END IF;

  IF v_order.request_type = 'vendor_request'
     AND (v_order.delivery_method <> 'rider'
          OR v_order.vendor_delivery_requested IS DISTINCT FROM true
          OR v_order.delivery_payment_status <> 'success') THEN
    RAISE EXCEPTION 'Vendor rider order % is not eligible for settlement', p_order_id;
  END IF;

  IF v_order.request_type = 'restaurant' THEN
    FOR v_item IN
      SELECT oi.vendor_id, SUM(oi.price * oi.qty) AS total
      FROM public.order_items oi WHERE oi.order_id = p_order_id GROUP BY oi.vendor_id
    LOOP
      INSERT INTO public.vendor_settlements (order_id, vendor_id, amount, status)
      VALUES (p_order_id, v_item.vendor_id, v_item.total, 'pending')
      ON CONFLICT (order_id, vendor_id) DO NOTHING
      RETURNING id INTO v_vendor_settlement_id;
      IF v_vendor_settlement_id IS NOT NULL THEN
        SELECT * INTO v_recipient FROM public.transfer_recipients
        WHERE payee_type = 'vendor' AND vendor_id = v_item.vendor_id;
        IF FOUND THEN
          BEGIN
            v_transfer_result := public.create_pending_transfer(
              p_vendor_settlement_id := v_vendor_settlement_id,
              p_paystack_reference := gen_random_uuid()::text,
              p_recipient_code := v_recipient.recipient_code);
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to create vendor transfer for %: %', v_vendor_settlement_id, SQLERRM;
          END;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Only rider deliveries create a delivery settlement. Restaurant +
  -- vendor_self has no Dropzyy delivery economics to settle.
  IF v_order.delivery_method = 'rider' THEN
    INSERT INTO public.delivery_settlements
      (order_id, rider_id, delivery_fee, rider_amount, platform_amount, status)
    VALUES (
      p_order_id,
      v_order.rider_id,
      v_order.fee,
      v_order.rider_delivery_share,
      v_order.company_delivery_share,
      'pending'
    )
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id INTO v_delivery_settlement_id;

  IF v_delivery_settlement_id IS NOT NULL AND v_order.rider_id IS NOT NULL THEN
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'rider'
      AND profile_id = (SELECT user_id FROM public.riders WHERE id = v_order.rider_id);
    IF FOUND THEN
      BEGIN
        v_transfer_result := public.create_pending_transfer(
          p_delivery_settlement_id := v_delivery_settlement_id,
          p_paystack_reference := gen_random_uuid()::text,
          p_recipient_code := v_recipient.recipient_code);
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create delivery transfer for %: %', v_delivery_settlement_id, SQLERRM;
      END;
    END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('settled', true, 'order_id', p_order_id,
                            'already_exists', v_delivery_settlement_id IS NULL);
END;
$func$;

REVOKE ALL ON FUNCTION public._settle_order_core(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._settle_order_core(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.auto_settle_delivered_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
BEGIN
  IF NEW.status = 'Delivered' AND (
      (NEW.request_type = 'restaurant' AND NEW.payment_status = 'success')
      OR (NEW.request_type = 'vendor_request' AND NEW.delivery_method = 'vendor_self')
      OR (NEW.request_type = 'vendor_request' AND NEW.delivery_method = 'rider'
          AND NEW.delivery_payment_status = 'success')
    )
    AND (OLD.status IS DISTINCT FROM 'Delivered'
         OR OLD.payment_status IS DISTINCT FROM 'success'
         OR OLD.delivery_payment_status IS DISTINCT FROM 'success') THEN
    BEGIN
      PERFORM public._settle_order_core(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto settlement skipped for order %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_auto_settle_on_status ON public.orders;
DROP TRIGGER IF EXISTS trg_auto_settle_on_payment ON public.orders;
DROP TRIGGER IF EXISTS trg_auto_settle_on_delivery_payment ON public.orders;
CREATE TRIGGER trg_auto_settle_on_status AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.auto_settle_delivered_order();
CREATE TRIGGER trg_auto_settle_on_payment AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.auto_settle_delivered_order();
CREATE TRIGGER trg_auto_settle_on_delivery_payment AFTER UPDATE OF delivery_payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.auto_settle_delivered_order();

-- Notify riders only when the delivery payment has actually succeeded.
DROP TRIGGER IF EXISTS trg_notify_riders_vendor_delivery ON public.orders;
DROP TRIGGER IF EXISTS trg_notify_riders_vendor_delivery_payment ON public.orders;
CREATE OR REPLACE FUNCTION public.notify_riders_vendor_delivery_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pickup_location text;
BEGIN
  IF NEW.request_type = 'vendor_request' AND NEW.delivery_method = 'rider'
     AND NEW.vendor_delivery_requested = true
     AND NEW.delivery_payment_status = 'success'
     AND OLD.delivery_payment_status IS DISTINCT FROM 'success' THEN
    SELECT pickup_location INTO v_pickup_location FROM public.vendors
    WHERE id = (SELECT vendor_id FROM public.order_items WHERE order_id = NEW.id LIMIT 1);
    INSERT INTO public.notifications (user_id, title, message, type, related_order_id)
    SELECT r.user_id, 'New delivery available',
      'Vendor delivery for order ' || NEW.order_number || ' is ready for pickup at '
      || COALESCE(v_pickup_location, 'vendor location') || '. Open the Rider Hub to accept it.',
      'rider', NEW.id
    FROM public.riders r WHERE r.status = 'approved' AND r.available = true;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_riders_vendor_delivery_payment
AFTER UPDATE OF delivery_payment_status ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.notify_riders_vendor_delivery_payment();

-- Safe refund selection.  A two-argument request is allowed only when exactly
-- one payment type is refundable; callers must select explicitly when both
-- product and delivery payments succeeded.
CREATE OR REPLACE FUNCTION public.request_refund(
  p_order_id uuid, p_reason text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE v_type text; v_payment_id uuid; v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.payments p JOIN public.orders o ON o.id = p.order_id
  WHERE p.order_id = p_order_id AND p.status = 'success'
    AND ((p.payment_type = 'product' AND o.payment_status = 'success')
      OR (p.payment_type = 'vendor_delivery' AND o.delivery_payment_status = 'success'));
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Order % has multiple or no refundable payments; select payment_type explicitly', p_order_id;
  END IF;
  SELECT p.payment_type, p.id INTO v_type, v_payment_id FROM public.payments p
  WHERE p.order_id = p_order_id AND p.status = 'success'
  ORDER BY p.created_at DESC LIMIT 1;
  RETURN public.request_refund(p_order_id, v_type, p_reason);
END;
$func$;

CREATE OR REPLACE FUNCTION public.request_refund(
  p_order_id uuid, p_payment_type text, p_reason text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE v_order public.orders%ROWTYPE; v_payment public.payments%ROWTYPE; v_refund public.refunds%ROWTYPE;
BEGIN
  IF p_payment_type NOT IN ('product', 'vendor_delivery') THEN RAISE EXCEPTION 'invalid payment type'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> auth.uid() THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  SELECT p.* INTO v_payment FROM public.payments p WHERE p.order_id = p_order_id
    AND p.payment_type = p_payment_type AND p.status = 'success'
    AND ((p_payment_type = 'product' AND v_order.payment_status = 'success')
      OR (p_payment_type = 'vendor_delivery' AND v_order.delivery_payment_status = 'success'))
  ORDER BY p.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected payment is not refundable'; END IF;
  SELECT * INTO v_refund FROM public.refunds WHERE payment_id = v_payment.id ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN json_build_object('refund_id', v_refund.id, 'payment_id', v_payment.id,
    'order_id', p_order_id, 'amount', v_payment.amount, 'status', v_refund.status, 'already_existed', true); END IF;
  INSERT INTO public.refunds(payment_id, order_id, amount, status, reason)
  VALUES(v_payment.id, p_order_id, v_payment.amount, 'requested', p_reason) RETURNING * INTO v_refund;
  RETURN json_build_object('refund_id', v_refund.id, 'payment_id', v_payment.id, 'order_id', p_order_id,
    'amount', v_payment.amount, 'status', v_refund.status, 'reason', p_reason, 'already_existed', false);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.request_refund(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_refund(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_refund(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_refund(uuid, text, text) FROM anon, PUBLIC;

-- Preserve the hardened refund workflow and fix the early-return marker leak.
CREATE OR REPLACE FUNCTION public.apply_refund_result(
  p_refund_id uuid, p_success boolean, p_gateway_refund_id text DEFAULT NULL, p_reason text DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $func$
DECLARE v_refund public.refunds%ROWTYPE; v_payment public.payments%ROWTYPE; v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_refund FROM public.refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund % not found', p_refund_id; END IF;
  IF v_refund.status IN ('processed', 'rejected') THEN
    RETURN json_build_object('refund_id', v_refund.id, 'status', v_refund.status, 'terminal', true);
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = v_refund.payment_id FOR UPDATE;
  SELECT * INTO v_order FROM public.orders WHERE id = v_refund.order_id FOR UPDATE;
  IF NOT p_success THEN
    UPDATE public.refunds SET status = 'failed', reason = COALESCE(p_reason, reason), updated_at = now()
    WHERE id = p_refund_id;
    RETURN json_build_object('refund_id', v_refund.id, 'status', 'failed', 'payment_refunded', false);
  END IF;
  UPDATE public.refunds SET status = 'processed', gateway_refund_id = COALESCE(p_gateway_refund_id, gateway_refund_id), updated_at = now()
  WHERE id = p_refund_id;
  PERFORM set_config('app.order_server_update', 'on', true);
  UPDATE public.payments SET status = 'refunded', updated_at = now() WHERE id = v_payment.id AND status = 'success';
  IF v_payment.payment_type = 'vendor_delivery' THEN
    UPDATE public.orders SET delivery_payment_status = 'refunded'
    WHERE id = v_order.id AND delivery_payment_status = 'success';
    PERFORM set_config('app.order_server_update', 'off', true);
    RETURN json_build_object('refund_id', v_refund.id, 'status', 'processed', 'payment_refunded', true,
      'order_delivery_payment_refunded', true, 'order_product_payment_unchanged', true);
  END IF;
  UPDATE public.orders SET payment_status = 'refunded'
  WHERE id = v_order.id AND payment_status = 'success';
  PERFORM set_config('app.order_server_update', 'off', true);
  RETURN json_build_object('refund_id', v_refund.id, 'status', 'processed', 'payment_refunded', true,
    'order_refunded', true);
END;
$func$;

REVOKE ALL ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_refund_result(uuid, boolean, text, text) TO service_role;
