-- Paystack fee capture only. Existing payment amounts remain unchanged.
-- Paystack monetary fields are stored in kobo, matching the provider payload;
-- public.payments.amount continues to use the existing ledger convention.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paystack_fee numeric,
  ADD COLUMN IF NOT EXISTS paystack_net_amount numeric,
  ADD COLUMN IF NOT EXISTS paystack_channel text,
  ADD COLUMN IF NOT EXISTS paystack_paid_at timestamptz;

-- Extend the existing server-only success handlers. Trailing defaults retain
-- compatibility for existing callers while allowing the verified webhook to
-- persist Paystack fee metadata. raw_payload is intentionally unchanged:
-- existing customer-owned payment SELECT access could expose provider data.
DROP FUNCTION IF EXISTS public.handle_paystack_payment_success(text, text, uuid);
CREATE OR REPLACE FUNCTION public.handle_paystack_payment_success(
  p_reference text, p_transaction_id text, p_order_id uuid, p_paystack_amount numeric DEFAULT NULL,
  p_paystack_fee numeric DEFAULT NULL, p_paystack_channel text DEFAULT NULL,
  p_paystack_paid_at timestamptz DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payment public.payments%ROWTYPE; v_existing_txn uuid;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment with reference % not found', p_reference; END IF;
  IF v_payment.status='success' THEN RETURN; END IF;
  IF v_payment.order_id != p_order_id THEN RAISE EXCEPTION 'Payment reference % does not belong to order %', p_reference, p_order_id; END IF;
  IF p_transaction_id IS NOT NULL THEN
    SELECT id INTO v_existing_txn FROM public.payments WHERE transaction_id::text=p_transaction_id AND id<>v_payment.id LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Transaction ID % already used by another payment', p_transaction_id; END IF;
  END IF;
  PERFORM set_config('app.order_server_update','on',true);
  UPDATE public.payments SET status='success', transaction_id=p_transaction_id::bigint,
    paystack_fee=p_paystack_fee,
    paystack_net_amount=CASE WHEN p_paystack_fee IS NULL THEN NULL ELSE v_payment.amount - p_paystack_fee END,
    paystack_channel=p_paystack_channel, paystack_paid_at=p_paystack_paid_at,
    updated_at=now() WHERE id=v_payment.id;
  UPDATE public.orders SET payment_status='success', payment_reference=p_reference, transaction_id=p_transaction_id, paid_at=now() WHERE id=p_order_id;
END; $$;
REVOKE ALL ON FUNCTION public.handle_paystack_payment_success(text,text,uuid,numeric,numeric,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_paystack_payment_success(text,text,uuid,numeric,numeric,text,timestamptz) TO service_role;

DROP FUNCTION IF EXISTS public.handle_vendor_delivery_payment_success(text, text, uuid);
CREATE OR REPLACE FUNCTION public.handle_vendor_delivery_payment_success(
  p_reference text, p_transaction_id text, p_order_id uuid, p_paystack_amount numeric DEFAULT NULL,
  p_paystack_fee numeric DEFAULT NULL, p_paystack_channel text DEFAULT NULL,
  p_paystack_paid_at timestamptz DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_payment public.payments%ROWTYPE; v_existing_txn uuid; v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE reference=p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment with reference % not found', p_reference; END IF;
  IF v_payment.status='success' THEN RETURN; END IF;
  IF v_payment.payment_type<>'vendor_delivery' THEN RAISE EXCEPTION 'Payment % is not a vendor delivery payment', p_reference; END IF;
  IF v_payment.order_id<>p_order_id THEN RAISE EXCEPTION 'Payment reference % does not belong to order %', p_reference,p_order_id; END IF;
  IF p_transaction_id IS NOT NULL THEN
    SELECT id INTO v_existing_txn FROM public.payments WHERE transaction_id::text=p_transaction_id AND id<>v_payment.id LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Transaction ID % already used by another payment', p_transaction_id; END IF;
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
  IF v_order.request_type<>'vendor_request' OR v_order.delivery_method<>'rider' THEN RAISE EXCEPTION 'Order % is not an eligible vendor rider delivery', p_order_id; END IF;
  PERFORM set_config('app.order_server_update','on',true);
  UPDATE public.payments SET status='success', transaction_id=p_transaction_id::bigint,
    paystack_fee=p_paystack_fee,
    paystack_net_amount=CASE WHEN p_paystack_fee IS NULL THEN NULL ELSE v_payment.amount - p_paystack_fee END,
    paystack_channel=p_paystack_channel, paystack_paid_at=p_paystack_paid_at,
    updated_at=now() WHERE id=v_payment.id;
  UPDATE public.orders SET delivery_payment_status='success', delivery_payment_id=v_payment.id WHERE id=p_order_id;
  PERFORM set_config('app.order_server_update','off',true);
END; $$;
REVOKE ALL ON FUNCTION public.handle_vendor_delivery_payment_success(text,text,uuid,numeric,numeric,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_success(text,text,uuid,numeric,numeric,text,timestamptz) TO service_role;
