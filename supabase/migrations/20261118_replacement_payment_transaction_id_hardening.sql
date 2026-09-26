CREATE OR REPLACE FUNCTION public.handle_replacement_payment_success(p_reference text,p_transaction_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.payments%ROWTYPE; o public.orders%ROWTYPE; r public.order_replacements%ROWTYPE; v_existing_txn uuid;
BEGIN
  SELECT * INTO p FROM public.payments WHERE reference=p_reference AND payment_type='replacement' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'replacement payment not found'; END IF;
  IF p.status='success' THEN RETURN; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p.order_id FOR UPDATE;
  IF p.amount IS DISTINCT FROM o.additional_amount_due THEN RAISE EXCEPTION 'replacement payment amount no longer matches obligation'; END IF;
  IF p_transaction_id IS NOT NULL THEN
    SELECT id INTO v_existing_txn FROM public.payments
    WHERE transaction_id::text = p_transaction_id AND id != p.id LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Transaction ID % already used by another payment', p_transaction_id; END IF;
  END IF;
  PERFORM set_config('app.order_server_update','on',true);
  UPDATE public.payments SET status='success',transaction_id=p_transaction_id::bigint,updated_at=now() WHERE id=p.id;
  UPDATE public.order_replacements SET status='paid',updated_at=now() WHERE order_id=o.id AND customer_decision='accepted' AND status='pending';
  UPDATE public.order_items SET availability_state='replaced' WHERE order_id=o.id AND final_resolution='replaced';
  PERFORM public.recalculate_final_order_financials(o.id);
END; $$;

REVOKE ALL ON FUNCTION public.handle_replacement_payment_success(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_replacement_payment_success(text,text) TO service_role;
