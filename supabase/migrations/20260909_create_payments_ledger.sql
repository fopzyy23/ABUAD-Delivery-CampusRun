-- ============================================================
-- 20260909_create_payments_ledger.sql
-- B4A - Paystack payment ledger + server-side payment-state handling
-- ============================================================
-- Creates the payments ledger table and secure server-side
-- functions for handling Paystack payment events.
--
-- Depends on:
--   20260907_lock_order_payment_columns.sql (B1)
--   20260908_order_identifier_uniqueness.sql (B2)
--
-- DOES NOT: settlement, refunds, transfers, rider 80/20, frontend.
-- ============================================================

-- 1. payments ledger table
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  reference text NOT NULL UNIQUE,
  transaction_id bigint UNIQUE,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','failed','refunded')),
  gateway text NOT NULL DEFAULT 'paystack',
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON public.payments (reference);

-- 2. orders.paid_at
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- 3. Auto-update payments.updated_at
CREATE OR REPLACE FUNCTION public.set_payments_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_payments_set_updated_at ON public.payments;
CREATE TRIGGER trg_payments_set_updated_at
  BEFORE UPDATE ON public.payments FOR EACH ROW
  EXECUTE FUNCTION public.set_payments_updated_at();

-- 4. RLS on payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'customers_read_own_payments'
      AND polrelid = 'public.payments'::regclass
  ) THEN
    CREATE POLICY "customers_read_own_payments" ON public.payments
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = payments.order_id AND o.user_id = auth.uid()));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'no_client_insert_payments'
      AND polrelid = 'public.payments'::regclass
  ) THEN
    CREATE POLICY "no_client_insert_payments" ON public.payments
      FOR INSERT TO authenticated WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'no_client_update_payments'
      AND polrelid = 'public.payments'::regclass
  ) THEN
    CREATE POLICY "no_client_update_payments" ON public.payments
      FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'no_client_delete_payments'
      AND polrelid = 'public.payments'::regclass
  ) THEN
    CREATE POLICY "no_client_delete_payments" ON public.payments
      FOR DELETE TO authenticated USING (false);
  END IF;
END $$;-- 5. Secure server-side payment-handling RPCs (use app.order_server_update GUC from B1)

CREATE OR REPLACE FUNCTION public.handle_paystack_payment_success(
  p_reference text, p_transaction_id text, p_order_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
  v_existing_txn uuid;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment with reference % not found', p_reference; END IF;
  IF v_payment.status = 'success' THEN RETURN; END IF;
  IF v_payment.order_id != p_order_id THEN RAISE EXCEPTION 'Payment reference % does not belong to order %', p_reference, p_order_id; END IF;
  IF p_transaction_id IS NOT NULL THEN
    SELECT id INTO v_existing_txn FROM public.payments
    WHERE transaction_id::text = p_transaction_id AND id != v_payment.id LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Transaction ID % already used by another payment', p_transaction_id; END IF;
  END IF;
  PERFORM set_config('app.order_server_update', 'on', true);
  UPDATE public.payments SET status = 'success', transaction_id = p_transaction_id::bigint, updated_at = now() WHERE id = v_payment.id;
  UPDATE public.orders SET payment_status = 'success', payment_reference = p_reference, transaction_id = p_transaction_id, paid_at = now() WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_paystack_payment_failed(
  p_reference text, p_order_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payment payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment with reference % not found', p_reference; END IF;
  IF v_payment.status = 'success' THEN RETURN; END IF;
  IF v_payment.order_id != p_order_id THEN RAISE EXCEPTION 'Payment reference % does not belong to order %', p_reference, p_order_id; END IF;
  PERFORM set_config('app.order_server_update', 'on', true);
  UPDATE public.payments SET status = 'failed', updated_at = now() WHERE id = v_payment.id;
  UPDATE public.orders SET payment_status = 'failed' WHERE id = p_order_id AND payment_status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_pending_payment(
  p_order_id uuid, p_reference text, p_amount numeric, p_currency text DEFAULT 'NGN'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
  INSERT INTO public.payments (order_id, reference, amount, currency, status)
  VALUES (p_order_id, p_reference, p_amount, p_currency, 'pending')
  RETURNING id INTO v_payment_id;
  RETURN v_payment_id;
END;
$$;

-- 6. Restrict direct writes
REVOKE ALL ON public.payments FROM anon, authenticated;
GRANT SELECT ON public.payments TO authenticated;