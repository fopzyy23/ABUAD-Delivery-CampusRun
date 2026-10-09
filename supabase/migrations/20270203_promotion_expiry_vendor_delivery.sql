-- Reservation expiry, immediate failure release, and vendor delivery amount.

ALTER TABLE public.promotion_reservations ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE public.promotion_reservations SET expires_at=created_at+interval '30 minutes' WHERE expires_at IS NULL;
ALTER TABLE public.promotion_reservations ALTER COLUMN expires_at SET DEFAULT (now()+interval '30 minutes');
ALTER TABLE public.promotion_reservations ALTER COLUMN expires_at SET NOT NULL;

CREATE OR REPLACE FUNCTION public.release_expired_promotion_reservations(p_batch_size integer DEFAULT 100)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; released integer:=0; successful boolean;
BEGIN
  FOR r IN SELECT pr.id,pr.order_id FROM public.promotion_reservations pr WHERE pr.status='reserved' AND pr.expires_at<=now() ORDER BY pr.expires_at LIMIT GREATEST(1,LEAST(p_batch_size,1000)) FOR UPDATE SKIP LOCKED LOOP
    SELECT EXISTS(SELECT 1 FROM public.payments p WHERE p.order_id=r.order_id AND p.status='success' AND p.payment_type IN ('product','vendor_delivery')) OR EXISTS(SELECT 1 FROM public.orders o WHERE o.id=r.order_id AND (o.payment_status='success' OR o.delivery_payment_status='success')) INTO successful;
    IF NOT successful THEN PERFORM public.release_delivery_promotion(r.order_id); released:=released+1; END IF;
  END LOOP;
  RETURN released;
END; $$;
REVOKE ALL ON FUNCTION public.release_expired_promotion_reservations(integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.trg_release_promotion_on_delivery_failure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.delivery_payment_status IN ('failed','refunded') AND OLD.delivery_payment_status IS DISTINCT FROM NEW.delivery_payment_status THEN PERFORM public.release_delivery_promotion(NEW.id); END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_release_promotion_on_delivery_failure ON public.orders;
CREATE TRIGGER trg_release_promotion_on_delivery_failure AFTER UPDATE OF delivery_payment_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_release_promotion_on_delivery_failure();

-- Vendor delivery payments are initialized by the vendor, but the customer
-- order snapshot remains authoritative for a previously reserved promotion.
CREATE OR REPLACE FUNCTION public.create_vendor_delivery_payment(p_order_id uuid,p_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid:=auth.uid(); v_vendor_id text; v_vendor_email text; o public.orders%ROWTYPE; existing public.payments%ROWTYPE; ref text; pid uuid; amount numeric;
BEGIN
  SELECT vendor_id,email INTO v_vendor_id,v_vendor_email FROM public.profiles WHERE id=v_user;
  IF v_user IS NULL OR v_vendor_id IS NULL THEN RAISE EXCEPTION 'authenticated user is not linked to a vendor account'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR o.request_type<>'vendor_request' OR o.delivery_method<>'rider' OR o.vendor_delivery_requested IS DISTINCT FROM true THEN RAISE EXCEPTION 'order is not configured for vendor rider delivery'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_id=o.id AND oi.vendor_id=v_vendor_id) THEN RAISE EXCEPTION 'this order does not belong to your vendor account'; END IF;
  IF o.status<>'Preparing' OR o.delivery_payment_status='success' THEN RAISE EXCEPTION 'order is not eligible for delivery payment'; END IF;
  SELECT * INTO existing FROM public.payments WHERE order_id=o.id AND payment_type='vendor_delivery' AND status='pending' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('payment_id',existing.id,'reference',existing.reference,'amount',existing.amount,'currency',existing.currency,'status',existing.status,'email',COALESCE(v_vendor_email,''),'reused',true); END IF;
  amount:=COALESCE(o.customer_delivery_charge,o.fee,1500);
  ref:='dropzyy_delivery_'||o.order_number||'_'||floor(extract(epoch from now())*1000)::text;
  INSERT INTO public.payments(order_id,reference,amount,currency,status,payment_type) VALUES(o.id,ref,amount,'NGN','pending','vendor_delivery') RETURNING id INTO pid;
  UPDATE public.orders SET delivery_payment_id=pid,delivery_payment_status='pending' WHERE id=o.id;
  RETURN jsonb_build_object('payment_id',pid,'reference',ref,'amount',amount,'currency','NGN','status','pending','email',COALESCE(v_vendor_email,''),'reused',false);
END; $$;
REVOKE ALL ON FUNCTION public.create_vendor_delivery_payment(uuid,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.create_vendor_delivery_payment(uuid,text) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='dropzyy-expire-promotion-reservations') THEN PERFORM cron.unschedule('dropzyy-expire-promotion-reservations'); END IF;
    PERFORM cron.schedule('dropzyy-expire-promotion-reservations','*/5 * * * *','SELECT public.release_expired_promotion_reservations(100)');
  END IF;
EXCEPTION WHEN undefined_table OR undefined_function OR insufficient_privilege THEN NULL;
END $$;
