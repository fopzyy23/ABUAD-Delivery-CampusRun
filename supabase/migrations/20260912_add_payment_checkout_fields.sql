-- ============================================================
-- 20260912_add_payment_checkout_fields.sql
-- Paystack checkout: store authorization_url/access_code for safe reuse
-- ============================================================
-- Adds authorization_url and access_code columns to payments so that
-- an existing pending payment can be safely reused (redirecting the
-- customer to the same Paystack checkout) rather than creating a
-- duplicate charge.
--
-- Depends on: 20260909_create_payments_ledger.sql (B4A)
-- ============================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS authorization_url text,
  ADD COLUMN IF NOT EXISTS access_code text;

-- Update create_pending_payment to store checkout fields for reuse
CREATE OR REPLACE FUNCTION public.create_pending_payment(
  p_order_id uuid,
  p_reference text,
  p_amount numeric,
  p_currency text DEFAULT 'NGN',
  p_authorization_url text DEFAULT NULL,
  p_access_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id uuid;
  v_existing payments%ROWTYPE;
  v_order_total numeric;
BEGIN
  SELECT total INTO v_order_total FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
  IF p_amount != v_order_total THEN RAISE EXCEPTION 'Payment amount % does not match order total %', p_amount, v_order_total; END IF;

  SELECT * INTO v_existing FROM public.payments WHERE reference = p_reference;
  IF FOUND THEN
    IF v_existing.order_id != p_order_id THEN RAISE EXCEPTION 'Reference % already used by another order', p_reference; END IF;
    RETURN v_existing.id;
  END IF;

  INSERT INTO public.payments (order_id, reference, amount, currency, status, authorization_url, access_code)
  VALUES (p_order_id, p_reference, p_amount, p_currency, 'pending', p_authorization_url, p_access_code)
  RETURNING id INTO v_payment_id;
  RETURN v_payment_id;
END;
$$;