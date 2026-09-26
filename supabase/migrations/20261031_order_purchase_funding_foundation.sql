-- Phase 1: additive foundation for rider product confirmation, purchase funding,
-- replacements, and cancellation. No external payment/transfer calls occur here.

-- Existing order/payment state is extended without changing order creation.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS purchase_funding_status text NOT NULL DEFAULT 'not_required'
    CHECK (purchase_funding_status IN ('not_required','pending','authorized','processing','transferred','failed','reversed')),
  ADD COLUMN IF NOT EXISTS cancellation_stage text NOT NULL DEFAULT 'none'
    CHECK (cancellation_stage IN ('none','requested','eligible_for_reimbursement','admin_resolution_required','reimbursement_pending','reimbursed','resolved')),
  ADD COLUMN IF NOT EXISTS replacement_count integer NOT NULL DEFAULT 0
    CHECK (replacement_count >= 0),
  ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS products_confirmed_at timestamptz;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS availability_state text NOT NULL DEFAULT 'unconfirmed'
    CHECK (availability_state IN ('unconfirmed','available','unavailable','replaced')),
  ADD COLUMN IF NOT EXISTS availability_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS replacement_order_item_id uuid REFERENCES public.order_items(id);

-- Replacement payments are additive to the existing payment taxonomy.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IN ('product','vendor_delivery','replacement'));

-- Transfer purpose and optional non-settlement sources. Legacy settlement rows
-- remain valid and keep their existing payee/recipient behavior.
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS transfer_kind text NOT NULL DEFAULT 'settlement'
    CHECK (transfer_kind IN ('settlement','purchase_funding','customer_reimbursement','withdrawal')),
  ADD COLUMN IF NOT EXISTS purchase_funding_id uuid,
  ADD COLUMN IF NOT EXISTS cancellation_id uuid;

ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_one_settlement_check;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_one_source_check CHECK (
  (transfer_kind = 'settlement' AND (((vendor_settlement_id IS NOT NULL AND delivery_settlement_id IS NULL)
    OR (delivery_settlement_id IS NOT NULL AND vendor_settlement_id IS NULL)
    OR withdrawal_request_id IS NOT NULL)))
  OR (transfer_kind = 'purchase_funding' AND purchase_funding_id IS NOT NULL
      AND vendor_settlement_id IS NULL AND delivery_settlement_id IS NULL AND cancellation_id IS NULL)
  OR (transfer_kind = 'customer_reimbursement' AND cancellation_id IS NOT NULL
      AND vendor_settlement_id IS NULL AND delivery_settlement_id IS NULL AND purchase_funding_id IS NULL)
  OR (transfer_kind = 'withdrawal' AND vendor_settlement_id IS NULL AND delivery_settlement_id IS NULL
      AND purchase_funding_id IS NULL AND cancellation_id IS NULL)
);

CREATE TABLE IF NOT EXISTS public.purchase_funding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  rider_id uuid NOT NULL REFERENCES public.riders(id),
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','authorized','processing','transferred','failed','reversed')),
  paystack_transfer_id text,
  paystack_reference text,
  authorized_at timestamptz,
  transferred_at timestamptz,
  failure_reason text,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE TABLE IF NOT EXISTS public.product_availability_check (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  rider_id uuid NOT NULL REFERENCES public.riders(id),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id),
  available boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  replacement_product_id bigint REFERENCES public.products(id),
  replacement_price_diff numeric,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (replacement_price_diff IS NULL OR replacement_price_diff <> 0),
  CHECK (available OR replacement_product_id IS NOT NULL OR replacement_price_diff IS NULL)
);

CREATE TABLE IF NOT EXISTS public.order_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id),
  original_product_id bigint REFERENCES public.products(id),
  replacement_product_id bigint NOT NULL REFERENCES public.products(id),
  price_difference numeric NOT NULL,
  customer_decision text NOT NULL DEFAULT 'pending'
    CHECK (customer_decision IN ('pending','accepted','declined')),
  payment_id uuid REFERENCES public.payments(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id)
);

CREATE TABLE IF NOT EXISTS public.cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  initiated_by uuid NOT NULL REFERENCES auth.users(id),
  reason text NOT NULL,
  stage text NOT NULL DEFAULT 'requested'
    CHECK (stage IN ('requested','eligible_for_reimbursement','admin_resolution_required','reimbursement_pending','reimbursed','resolved')),
  reimbursement_transfer_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (order_id)
);

ALTER TABLE public.transfers
  ADD CONSTRAINT transfers_purchase_funding_fk FOREIGN KEY (purchase_funding_id) REFERENCES public.purchase_funding(id),
  ADD CONSTRAINT transfers_cancellation_fk FOREIGN KEY (cancellation_id) REFERENCES public.cancellations(id);
ALTER TABLE public.cancellations
  ADD CONSTRAINT cancellations_reimbursement_transfer_fk FOREIGN KEY (reimbursement_transfer_id) REFERENCES public.transfers(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_funding_paystack_reference
  ON public.purchase_funding(paystack_reference) WHERE paystack_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_funding_transfer
  ON public.transfers(purchase_funding_id) WHERE purchase_funding_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cancellation_reimbursement_transfer
  ON public.transfers(cancellation_id) WHERE cancellation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_availability_check_order_item ON public.product_availability_check(order_item_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_availability_check_order ON public.product_availability_check(order_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_replacements_order_status ON public.order_replacements(order_id, status);
CREATE INDEX IF NOT EXISTS idx_cancellations_stage ON public.cancellations(stage);
CREATE INDEX IF NOT EXISTS idx_transfers_kind_status ON public.transfers(transfer_kind, status);

CREATE OR REPLACE FUNCTION public.set_order_flow_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_purchase_funding_updated_at ON public.purchase_funding;
CREATE TRIGGER trg_purchase_funding_updated_at BEFORE UPDATE ON public.purchase_funding FOR EACH ROW EXECUTE FUNCTION public.set_order_flow_updated_at();
DROP TRIGGER IF EXISTS trg_availability_check_updated_at ON public.product_availability_check;
CREATE TRIGGER trg_availability_check_updated_at BEFORE UPDATE ON public.product_availability_check FOR EACH ROW EXECUTE FUNCTION public.set_order_flow_updated_at();
DROP TRIGGER IF EXISTS trg_order_replacements_updated_at ON public.order_replacements;
CREATE TRIGGER trg_order_replacements_updated_at BEFORE UPDATE ON public.order_replacements FOR EACH ROW EXECUTE FUNCTION public.set_order_flow_updated_at();
DROP TRIGGER IF EXISTS trg_cancellations_updated_at ON public.cancellations;
CREATE TRIGGER trg_cancellations_updated_at BEFORE UPDATE ON public.cancellations FOR EACH ROW EXECUTE FUNCTION public.set_order_flow_updated_at();

ALTER TABLE public.purchase_funding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_availability_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cancellations ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_funding_customer_read ON public.purchase_funding FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid()) OR rider_id IN (SELECT id FROM riders WHERE user_id = auth.uid()) OR public.is_admin());
CREATE POLICY availability_customer_read ON public.product_availability_check FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid()) OR rider_id IN (SELECT id FROM riders WHERE user_id = auth.uid()) OR public.is_admin());
CREATE POLICY replacements_customer_read ON public.order_replacements FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid()) OR public.is_admin());
CREATE POLICY cancellations_customer_read ON public.cancellations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.user_id = auth.uid()) OR public.is_admin());

CREATE OR REPLACE FUNCTION public.record_product_availability_check(p_order_item_id uuid, p_available boolean, p_replacement_product_id text DEFAULT NULL, p_replacement_price_diff numeric DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item public.order_items%ROWTYPE; v_rider uuid; v_id uuid;
BEGIN
  SELECT r.id INTO v_rider FROM public.riders r WHERE r.user_id = auth.uid() AND r.status = 'approved';
  IF v_rider IS NULL THEN RAISE EXCEPTION 'approved rider required'; END IF;
  SELECT oi.* INTO v_item FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id WHERE oi.id = p_order_item_id AND o.rider_id = v_rider FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order item is not assigned to this rider'; END IF;
  INSERT INTO public.product_availability_check(order_id,rider_id,order_item_id,available,replacement_product_id,replacement_price_diff,created_by)
  VALUES(v_item.order_id,v_rider,v_item.id,p_available,p_replacement_product_id,p_replacement_price_diff,auth.uid()) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_order_products(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_rider uuid; v_id uuid; v_amount numeric;
BEGIN
  SELECT r.id INTO v_rider FROM public.riders r WHERE r.user_id = auth.uid() AND r.status = 'approved';
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.rider_id IS DISTINCT FROM v_rider THEN RAISE EXCEPTION 'order is not assigned to this rider'; END IF;
  IF v_order.cancellation_stage IS DISTINCT FROM 'none'
     OR EXISTS (SELECT 1 FROM public.cancellations WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'order cancellation already won the state transition';
  END IF;
  IF v_order.purchase_funding_status NOT IN ('not_required','pending') THEN RAISE EXCEPTION 'product confirmation already completed'; END IF;
  IF EXISTS (SELECT 1 FROM public.product_availability_check WHERE order_id=p_order_id AND available=false AND replacement_product_id IS NULL) THEN RAISE EXCEPTION 'unresolved unavailable product'; END IF;
  SELECT COALESCE(SUM(oi.price * oi.qty),0) INTO v_amount FROM public.order_items oi WHERE oi.order_id=p_order_id;
  INSERT INTO public.purchase_funding(order_id,rider_id,amount,status,authorized_at,created_by,updated_by) VALUES(p_order_id,v_rider,v_amount,'authorized',now(),auth.uid(),auth.uid()) RETURNING id INTO v_id;
  UPDATE public.orders SET purchase_funding_status='authorized', products_confirmed_at=now() WHERE id=p_order_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.initiate_order_cancellation(p_order_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE; v_funding public.purchase_funding%ROWTYPE; v_id uuid; v_stage text;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  IF EXISTS (SELECT 1 FROM public.cancellations WHERE order_id=p_order_id) THEN RAISE EXCEPTION 'cancellation already initiated'; END IF;
  SELECT * INTO v_funding FROM public.purchase_funding WHERE order_id=p_order_id FOR UPDATE;
  v_stage := CASE WHEN v_funding.id IS NULL OR v_funding.status IN ('pending','authorized','failed','reversed') THEN 'eligible_for_reimbursement' ELSE 'admin_resolution_required' END;
  INSERT INTO public.cancellations(order_id,initiated_by,reason,stage) VALUES(p_order_id,auth.uid(),p_reason,v_stage) RETURNING id INTO v_id;
  UPDATE public.orders SET cancellation_stage=v_stage,cancellation_requested_at=now() WHERE id=p_order_id;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.record_product_availability_check(uuid,boolean,text,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_product_availability_check(uuid,boolean,text,numeric) TO authenticated;
REVOKE ALL ON FUNCTION public.confirm_order_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order_products(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.initiate_order_cancellation(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initiate_order_cancellation(uuid,text) TO authenticated;
