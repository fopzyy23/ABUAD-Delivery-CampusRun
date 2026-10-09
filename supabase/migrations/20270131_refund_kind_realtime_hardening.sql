-- Forward-only refund classification and Realtime hardening.
-- Does not alter payment, RLS, cancellation, reimbursement, or Paystack rules.

ALTER TABLE public.refunds ALTER COLUMN refund_kind SET DEFAULT 'legacy_unknown';

-- Only the historical replacement marker proves replacement origin. All other
-- previously unclassified rows are deliberately neutral rather than assumed
-- to be full-order refunds.
UPDATE public.refunds
SET refund_kind='replacement_adjustment'
WHERE refund_kind IN ('full_order','legacy_unknown')
  AND reason ILIKE 'Replacement partial refund:%';

UPDATE public.refunds
SET refund_kind='legacy_unknown'
WHERE refund_kind='full_order'
  AND NOT (reason ILIKE 'Replacement partial refund:%');

DROP TRIGGER IF EXISTS trg_classify_refund_kind_on_insert ON public.refunds;
DROP FUNCTION IF EXISTS public.classify_refund_kind_on_insert();

-- Ensure the table emits INSERT/UPDATE events when the publication exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='refunds') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.refunds;
  END IF;
END $$;

-- Current replacement creation path: explicit kind, no reason parsing.
CREATE OR REPLACE FUNCTION public.create_replacement_partial_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid public.payments%ROWTYPE; refund_amount numeric; existing uuid;
BEGIN
  IF NEW.final_resolution='replaced' AND NEW.final_price IS NOT NULL AND NEW.final_price < OLD.price THEN
    refund_amount := (OLD.price-NEW.final_price) * NEW.qty;
    SELECT p.* INTO paid FROM public.payments p WHERE p.order_id=NEW.order_id AND p.payment_type='product' AND p.status='success' ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND AND refund_amount > 0 THEN
      SELECT r.id INTO existing FROM public.refunds r WHERE r.payment_id=paid.id AND r.refund_kind='replacement_adjustment' AND r.status NOT IN ('rejected','failed') LIMIT 1;
      IF existing IS NULL THEN
        INSERT INTO public.refunds(payment_id,order_id,amount,status,reason,refund_kind)
        VALUES(paid.id,NEW.order_id,refund_amount,'approved','Replacement partial refund:'||NEW.id::text,'replacement_adjustment');
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- The effective customer refund RPCs are redefined in the next deployment
-- layer with the same authorization/payment checks and explicit full_order.
CREATE OR REPLACE FUNCTION public.request_refund(p_order_id uuid, p_payment_type text, p_reason text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_order public.orders%ROWTYPE; v_payment public.payments%ROWTYPE; v_refund public.refunds%ROWTYPE;
BEGIN
  IF p_payment_type NOT IN ('product','vendor_delivery') THEN RAISE EXCEPTION 'invalid payment type'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> auth.uid() THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  SELECT p.* INTO v_payment FROM public.payments p WHERE p.order_id=p_order_id AND p.payment_type=p_payment_type AND p.status='success'
    AND ((p_payment_type='product' AND v_order.payment_status='success') OR (p_payment_type='vendor_delivery' AND v_order.delivery_payment_status='success'))
    ORDER BY p.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'selected payment is not refundable'; END IF;
  SELECT * INTO v_refund FROM public.refunds WHERE payment_id=v_payment.id ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN json_build_object('refund_id',v_refund.id,'payment_id',v_payment.id,'order_id',p_order_id,'amount',v_payment.amount,'status',v_refund.status,'already_existed',true); END IF;
  INSERT INTO public.refunds(payment_id,order_id,amount,status,reason,refund_kind) VALUES(v_payment.id,p_order_id,v_payment.amount,'requested',p_reason,'full_order') RETURNING * INTO v_refund;
  RETURN json_build_object('refund_id',v_refund.id,'payment_id',v_payment.id,'order_id',p_order_id,'amount',v_payment.amount,'status',v_refund.status,'already_existed',false);
END; $$;

CREATE OR REPLACE FUNCTION public.request_refund(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_order public.orders%ROWTYPE; v_payment public.payments%ROWTYPE; v_refund public.refunds%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id <> auth.uid() THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
  SELECT p.* INTO v_payment FROM public.payments p WHERE p.order_id=p_order_id AND p.status='success'
    AND ((p.payment_type='vendor_delivery' AND v_order.delivery_payment_status='success') OR (p.payment_type='product' AND v_order.payment_status='success'))
    ORDER BY CASE WHEN p.payment_type='vendor_delivery' THEN 1 ELSE 2 END,p.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order has no successful payment — cannot request refund'; END IF;
  SELECT * INTO v_refund FROM public.refunds WHERE payment_id=v_payment.id ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN json_build_object('refund_id',v_refund.id,'payment_id',v_payment.id,'order_id',p_order_id,'amount',v_payment.amount,'status',v_refund.status,'already_existed',true); END IF;
  INSERT INTO public.refunds(payment_id,order_id,amount,status,reason,refund_kind) VALUES(v_payment.id,p_order_id,v_payment.amount,'requested',p_reason,'full_order') RETURNING * INTO v_refund;
  RETURN json_build_object('refund_id',v_refund.id,'payment_id',v_payment.id,'order_id',p_order_id,'amount',v_refund.amount,'status',v_refund.status,'already_existed',false);
END; $$;
