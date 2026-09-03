-- ============================================================
-- 20260910_create_settlement_ledger.sql
-- B4B — Dropzyy settlement ledger
-- ============================================================
-- Creates vendor_settlements, delivery_settlements, and refunds
-- tables, plus a secure server-side settlement generation RPC.
--
-- Business model:
--   Vendor receives own product-line revenue (price x qty).
--   Delivery fee (orders.fee, currently ?1,000) is split:
--     rider   = 80% = ?800
--     platform = 20% = ?200
--
-- Depends on:
--   20260909_create_payments_ledger.sql (B4A)
--   20260907_lock_order_payment_columns.sql (B1)
--
-- DOES NOT: implement Paystack transfers, modify checkout UI,
-- change rider earnings, or touch withdrawal calculations.
-- ============================================================

-- 1. vendor_settlements
CREATE TABLE IF NOT EXISTS public.vendor_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. delivery_settlements
CREATE TABLE IF NOT EXISTS public.delivery_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  rider_id uuid REFERENCES public.profiles(id),
  delivery_fee numeric NOT NULL,
  rider_amount numeric NOT NULL,
  platform_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. refunds
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  gateway_refund_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);-- 4. Constraints (idempotent via DO blocks)
DO $$
BEGIN
  -- vendor_settlements
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_settlements_order_vendor_key') THEN
    ALTER TABLE public.vendor_settlements ADD CONSTRAINT vendor_settlements_order_vendor_key UNIQUE (order_id, vendor_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_settlements_amount_check') THEN
    ALTER TABLE public.vendor_settlements ADD CONSTRAINT vendor_settlements_amount_check CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendor_settlements_status_check') THEN
    ALTER TABLE public.vendor_settlements ADD CONSTRAINT vendor_settlements_status_check CHECK (status IN ('pending','settled','reversed'));
  END IF;

  -- delivery_settlements
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_settlements_order_key') THEN
    ALTER TABLE public.delivery_settlements ADD CONSTRAINT delivery_settlements_order_key UNIQUE (order_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_settlements_fee_check') THEN
    ALTER TABLE public.delivery_settlements ADD CONSTRAINT delivery_settlements_fee_check CHECK (delivery_fee >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_settlements_rider_check') THEN
    ALTER TABLE public.delivery_settlements ADD CONSTRAINT delivery_settlements_rider_check CHECK (rider_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_settlements_platform_check') THEN
    ALTER TABLE public.delivery_settlements ADD CONSTRAINT delivery_settlements_platform_check CHECK (platform_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_settlements_split_check') THEN
    ALTER TABLE public.delivery_settlements ADD CONSTRAINT delivery_settlements_split_check CHECK (rider_amount + platform_amount = delivery_fee);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_settlements_status_check') THEN
    ALTER TABLE public.delivery_settlements ADD CONSTRAINT delivery_settlements_status_check CHECK (status IN ('pending','settled','reversed'));
  END IF;

  -- refunds
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_amount_check') THEN
    ALTER TABLE public.refunds ADD CONSTRAINT refunds_amount_check CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_status_check') THEN
    ALTER TABLE public.refunds ADD CONSTRAINT refunds_status_check CHECK (status IN ('pending','processed','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_gateway_refund_id_key') THEN
    ALTER TABLE public.refunds ADD CONSTRAINT refunds_gateway_refund_id_key UNIQUE (gateway_refund_id);
  END IF;
END $$;-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_vendor_settlements_order_id ON public.vendor_settlements (order_id);
CREATE INDEX IF NOT EXISTS idx_vendor_settlements_vendor_id ON public.vendor_settlements (vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_settlements_status ON public.vendor_settlements (status);
CREATE INDEX IF NOT EXISTS idx_delivery_settlements_order_id ON public.delivery_settlements (order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_settlements_rider_id ON public.delivery_settlements (rider_id);
CREATE INDEX IF NOT EXISTS idx_delivery_settlements_status ON public.delivery_settlements (status);
CREATE INDEX IF NOT EXISTS idx_refunds_payment_id ON public.refunds (payment_id);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON public.refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON public.refunds (status);

-- 6. updated_at triggers
CREATE OR REPLACE FUNCTION public.set_settlements_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_vendor_settlements_updated_at ON public.vendor_settlements;
CREATE TRIGGER trg_vendor_settlements_updated_at BEFORE UPDATE ON public.vendor_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_settlements_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_settlements_updated_at ON public.delivery_settlements;
CREATE TRIGGER trg_delivery_settlements_updated_at BEFORE UPDATE ON public.delivery_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_settlements_updated_at();

DROP TRIGGER IF EXISTS trg_refunds_updated_at ON public.refunds;
CREATE TRIGGER trg_refunds_updated_at BEFORE UPDATE ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_settlements_updated_at();

-- 7. RLS
ALTER TABLE public.vendor_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;-- vendor_settlements policies
CREATE POLICY "vendors_read_own_settlements" ON public.vendor_settlements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.vendor_id = vendor_settlements.vendor_id));

CREATE POLICY "customers_read_own_vendor_settlements" ON public.vendor_settlements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = vendor_settlements.order_id AND o.user_id = auth.uid()));

CREATE POLICY "no_client_insert_vendor_settlements" ON public.vendor_settlements
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_client_update_vendor_settlements" ON public.vendor_settlements
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_client_delete_vendor_settlements" ON public.vendor_settlements
  FOR DELETE TO authenticated USING (false);

-- delivery_settlements policies
CREATE POLICY "riders_read_own_deliveries" ON public.delivery_settlements
  FOR SELECT TO authenticated
  USING (rider_id = auth.uid());

CREATE POLICY "customers_read_own_deliveries" ON public.delivery_settlements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = delivery_settlements.order_id AND o.user_id = auth.uid()));

CREATE POLICY "no_client_insert_delivery_settlements" ON public.delivery_settlements
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_client_update_delivery_settlements" ON public.delivery_settlements
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_client_delete_delivery_settlements" ON public.delivery_settlements
  FOR DELETE TO authenticated USING (false);

-- refunds policies
CREATE POLICY "customers_read_own_refunds" ON public.refunds
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = refunds.order_id AND o.user_id = auth.uid()));

CREATE POLICY "no_client_insert_refunds" ON public.refunds
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_client_update_refunds" ON public.refunds
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_client_delete_refunds" ON public.refunds
  FOR DELETE TO authenticated USING (false);-- 8. Secure server-side settlement generation RPC
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
    VALUES (p_order_id, v_item.vendor_id, v_item.total, 'pending');
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
  );

  RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', false);
END;
$$;

-- 9. Restrict direct writes (only the SECURITY DEFINER RPC writes)
REVOKE ALL ON public.vendor_settlements FROM anon, authenticated;
REVOKE ALL ON public.delivery_settlements FROM anon, authenticated;
REVOKE ALL ON public.refunds FROM anon, authenticated;
GRANT SELECT ON public.vendor_settlements TO authenticated;
GRANT SELECT ON public.delivery_settlements TO authenticated;
GRANT SELECT ON public.refunds TO authenticated;