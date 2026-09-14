-- ============================================================
-- 20261014_vendor_delivery_payment_ownership.sql
-- Vendor-owned vendor_delivery payment initialization
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_vendor_delivery_payment(
  p_order_id uuid,
  p_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_vendor_id text;
  v_vendor_email text;
  v_order public.orders%ROWTYPE;
  v_reference text;
  v_amount numeric := 1500;
  v_payment_id uuid;
  v_existing payments%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT vendor_id, email INTO v_vendor_id, v_vendor_email
  FROM public.profiles
  WHERE id = v_user;

  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user is not linked to a vendor account';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.request_type <> 'vendor_request' THEN
    RAISE EXCEPTION 'Delivery payment only allowed for vendor requests';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.vendor_id = v_vendor_id
  ) THEN
    RAISE EXCEPTION 'this order does not belong to your vendor account';
  END IF;

  IF v_order.status <> 'Preparing' THEN
    RAISE EXCEPTION 'order must be in Preparing state';
  END IF;

  IF v_order.delivery_method <> 'rider'
     OR v_order.vendor_delivery_requested IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'order is not configured for vendor rider delivery';
  END IF;

  IF v_order.delivery_payment_status = 'success' THEN
    RAISE EXCEPTION 'Delivery payment already successful';
  END IF;

  SELECT * INTO v_existing
  FROM public.payments
  WHERE order_id = p_order_id
    AND payment_type = 'vendor_delivery'
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'payment_id', v_existing.id,
      'reference', v_existing.reference,
      'amount', v_existing.amount,
      'currency', v_existing.currency,
      'status', v_existing.status,
      'email', COALESCE(v_vendor_email, ''),
      'reused', true
    );
  END IF;

  v_reference := 'dropzyy_delivery_' || v_order.order_number || '_' || floor(extract(epoch from now()) * 1000)::text;

  INSERT INTO public.payments (order_id, reference, amount, currency, status, payment_type)
  VALUES (p_order_id, v_reference, v_amount, 'NGN', 'pending', 'vendor_delivery')
  RETURNING id INTO v_payment_id;

  UPDATE public.orders
  SET delivery_payment_id = v_payment_id,
      delivery_payment_status = 'pending'
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'reference', v_reference,
    'amount', v_amount,
    'currency', 'NGN',
    'status', 'pending',
    'email', COALESCE(v_vendor_email, ''),
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_vendor_delivery_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vendor_delivery_payment(uuid, text) TO authenticated;
