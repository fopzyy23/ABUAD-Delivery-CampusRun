-- Paystack fees arrive in kobo; payments.amount is stored in naira.
-- Keep paystack_fee and paystack_net_amount in naira so ledger arithmetic is
-- unit-consistent. The RPC inputs remain provider-shaped kobo for webhook and
-- verifier compatibility, and conversion happens exactly once here.

CREATE OR REPLACE FUNCTION public.handle_paystack_payment_success(
  p_reference text, p_transaction_id text, p_order_id uuid,
  p_paystack_amount numeric DEFAULT NULL, p_paystack_fee numeric DEFAULT NULL,
  p_paystack_channel text DEFAULT NULL, p_paystack_paid_at timestamptz DEFAULT NULL
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
    paystack_fee=CASE WHEN p_paystack_fee IS NULL THEN NULL ELSE p_paystack_fee / 100 END,
    paystack_net_amount=CASE WHEN p_paystack_fee IS NULL THEN NULL ELSE v_payment.amount - (p_paystack_fee / 100) END,
    paystack_channel=p_paystack_channel, paystack_paid_at=p_paystack_paid_at,
    updated_at=now() WHERE id=v_payment.id;
  UPDATE public.orders SET payment_status='success', payment_reference=p_reference, transaction_id=p_transaction_id, paid_at=now() WHERE id=p_order_id;
END; $$;
REVOKE ALL ON FUNCTION public.handle_paystack_payment_success(text,text,uuid,numeric,numeric,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_paystack_payment_success(text,text,uuid,numeric,numeric,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.handle_vendor_delivery_payment_success(
  p_reference text, p_transaction_id text, p_order_id uuid,
  p_paystack_amount numeric DEFAULT NULL, p_paystack_fee numeric DEFAULT NULL,
  p_paystack_channel text DEFAULT NULL, p_paystack_paid_at timestamptz DEFAULT NULL
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
    paystack_fee=CASE WHEN p_paystack_fee IS NULL THEN NULL ELSE p_paystack_fee / 100 END,
    paystack_net_amount=CASE WHEN p_paystack_fee IS NULL THEN NULL ELSE v_payment.amount - (p_paystack_fee / 100) END,
    paystack_channel=p_paystack_channel, paystack_paid_at=p_paystack_paid_at,
    updated_at=now() WHERE id=v_payment.id;
  UPDATE public.orders SET delivery_payment_status='success', delivery_payment_id=v_payment.id WHERE id=p_order_id;
  PERFORM set_config('app.order_server_update','off',true);
END; $$;
REVOKE ALL ON FUNCTION public.handle_vendor_delivery_payment_success(text,text,uuid,numeric,numeric,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_vendor_delivery_payment_success(text,text,uuid,numeric,numeric,text,timestamptz) TO service_role;
