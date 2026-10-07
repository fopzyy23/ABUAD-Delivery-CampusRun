-- Complete the remaining server-authoritative lifecycle gaps without changing
-- original order-item prices or existing payment/transfer records.

CREATE TABLE IF NOT EXISTS public.order_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  author_id uuid NOT NULL REFERENCES auth.users(id),
  author_role text NOT NULL CHECK (author_role IN ('customer','rider','vendor','admin','system')),
  note_type text NOT NULL CHECK (note_type IN ('rider_comment','availability','replacement','system')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  customer_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_notes_order_created ON public.order_notes(order_id, created_at DESC);
ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_notes_select_visible ON public.order_notes;
CREATE POLICY order_notes_select_visible ON public.order_notes FOR SELECT TO authenticated USING (
  author_id = auth.uid() OR public.is_admin()
  OR (customer_visible AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=auth.uid()))
  OR EXISTS (SELECT 1 FROM public.riders r JOIN public.orders o ON o.rider_id=r.id WHERE o.id=order_id AND r.user_id=auth.uid())
);
REVOKE ALL ON public.order_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_notes TO authenticated;

CREATE OR REPLACE FUNCTION public.add_rider_order_note(p_order_id uuid, p_note_type text, p_message text, p_customer_visible boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; clean text; note_id uuid;
BEGIN
  clean := regexp_replace(trim(coalesce(p_message,'')), '<[^>]*>', '', 'g');
  IF p_note_type NOT IN ('rider_comment','availability','replacement') OR char_length(clean) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid order note';
  END IF;
  SELECT r.id INTO rid FROM public.riders r JOIN public.orders o ON o.rider_id=r.id
    WHERE o.id=p_order_id AND r.user_id=auth.uid() AND r.status='approved' FOR UPDATE;
  IF rid IS NULL THEN RAISE EXCEPTION 'only the assigned rider may add order notes'; END IF;
  INSERT INTO public.order_notes(order_id,author_id,author_role,note_type,message,customer_visible)
  VALUES(p_order_id,auth.uid(),'rider',p_note_type,clean,coalesce(p_customer_visible,true)) RETURNING id INTO note_id;
  RETURN note_id;
END; $$;
REVOKE ALL ON FUNCTION public.add_rider_order_note(uuid,text,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_rider_order_note(uuid,text,text,boolean) TO authenticated;

-- Pick-up is not legal until final products are confirmed and funding is
-- authorized/processing/transferred. This guard composes with the existing
-- status-transition trigger and cannot be bypassed by frontend state.
CREATE OR REPLACE FUNCTION public.guard_pickup_requires_final_products()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='Picked up' AND OLD.status='Rider assigned'
     AND (OLD.product_availability_status IS DISTINCT FROM 'confirmed'
       OR OLD.purchase_funding_status NOT IN ('authorized','processing','transferred')) THEN
    RAISE EXCEPTION 'final products and purchase funding are required before pickup';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_pickup_requires_final_products ON public.orders;
CREATE TRIGGER trg_guard_pickup_requires_final_products
BEFORE UPDATE OF status ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.guard_pickup_requires_final_products();

-- Cheaper replacements create an approved partial-refund obligation exactly
-- once. Paystack execution remains through the existing claim-before-call
-- refund Edge Function and signed provider webhook.
CREATE OR REPLACE FUNCTION public.create_replacement_partial_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE paid public.payments%ROWTYPE; refund_amount numeric; existing uuid;
BEGIN
  IF NEW.final_resolution='replaced' AND NEW.final_price IS NOT NULL AND NEW.final_price < OLD.price THEN
    refund_amount := (OLD.price-NEW.final_price) * NEW.qty;
    SELECT p.* INTO paid FROM public.payments p WHERE p.order_id=NEW.order_id AND p.payment_type='product' AND p.status='success' ORDER BY p.created_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND AND refund_amount > 0 THEN
      SELECT r.id INTO existing FROM public.refunds r WHERE r.payment_id=paid.id AND r.reason LIKE 'Replacement partial refund:%' AND r.status NOT IN ('rejected','failed') LIMIT 1;
      IF existing IS NULL THEN
        INSERT INTO public.refunds(payment_id,order_id,amount,status,reason)
        VALUES(paid.id,NEW.order_id,refund_amount,'approved','Replacement partial refund:'||NEW.id::text);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_create_replacement_partial_refund ON public.order_items;
CREATE TRIGGER trg_create_replacement_partial_refund
AFTER UPDATE OF final_product_id,final_price,final_resolution ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.create_replacement_partial_refund();
