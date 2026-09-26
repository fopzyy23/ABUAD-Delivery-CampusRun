-- Phase 6: cancellation and customer reimbursement. No refund API, earnings,
-- withdrawal, vendor settlement, or delivery-fee changes.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_cancellation_stage_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_cancellation_stage_check CHECK (cancellation_stage IN ('none','requested','eligible_for_reimbursement','admin_resolution_required','reimbursement_pending','reimbursement_processing','reimbursed','reimbursement_failed','reimbursement_reversed','resolved'));
ALTER TABLE public.cancellations DROP CONSTRAINT IF EXISTS cancellations_stage_check;
ALTER TABLE public.cancellations ADD CONSTRAINT cancellations_stage_check CHECK (stage IN ('requested','eligible_for_reimbursement','admin_resolution_required','reimbursement_pending','reimbursement_processing','reimbursed','reimbursement_failed','reimbursement_reversed','resolved'));
ALTER TABLE public.cancellations
  ADD COLUMN IF NOT EXISTS reimbursement_amount numeric CHECK (reimbursement_amount IS NULL OR reimbursement_amount > 0),
  ADD COLUMN IF NOT EXISTS reimbursement_failure_reason text;
CREATE INDEX IF NOT EXISTS idx_cancellations_reimbursement_state ON public.cancellations(stage, updated_at DESC);

CREATE OR REPLACE FUNCTION public.request_customer_cancellation(p_order_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.orders%ROWTYPE; f public.purchase_funding%ROWTYPE; c public.cancellations%ROWTYPE; t public.transfers%ROWTYPE; paid numeric; rid uuid; stage text; amount numeric;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order not found or not owned by caller'; END IF;
 IF o.status IN ('Delivered','Rated','Cancelled') THEN RAISE EXCEPTION 'order is not cancellable'; END IF;
 SELECT * INTO c FROM public.cancellations WHERE order_id=o.id FOR UPDATE;
 IF FOUND THEN RETURN jsonb_build_object('cancellation_id',c.id,'stage',c.stage,'reimbursement_amount',c.reimbursement_amount,'already_exists',true); END IF;
 SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
 SELECT * INTO t FROM public.transfers WHERE purchase_funding_id=f.id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND AND t.status IN ('processing') THEN stage:='admin_resolution_required';
 ELSIF FOUND AND t.status='success' THEN stage:='admin_resolution_required';
 ELSE stage:='eligible_for_reimbursement'; END IF;
 SELECT COALESCE(SUM(p.amount),0) INTO paid FROM public.payments p WHERE p.order_id=o.id AND p.status='success' AND p.payment_type IN ('product','replacement');
 amount:=GREATEST(LEAST(paid,COALESCE(o.final_order_total,o.total))-COALESCE((SELECT SUM(amount) FROM public.transfers WHERE cancellation_id IN (SELECT id FROM public.cancellations WHERE order_id=o.id) AND status IN ('success','processing')),0),0);
 INSERT INTO public.cancellations(order_id,initiated_by,reason,stage,reimbursement_amount) VALUES(o.id,auth.uid(),COALESCE(NULLIF(trim(p_reason),''),'Customer cancellation'),stage,NULLIF(amount,0)) RETURNING * INTO c;
 UPDATE public.orders SET cancellation_stage=stage,cancellation_requested_at=now(),final_financial_status='cancelled' WHERE id=o.id;
 RETURN jsonb_build_object('cancellation_id',c.id,'stage',stage,'reimbursement_amount',c.reimbursement_amount,'already_exists',false);
END; $$;

CREATE OR REPLACE FUNCTION public.create_pending_customer_reimbursement_transfer(p_cancellation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; r public.transfer_recipients%ROWTYPE; f public.purchase_funding%ROWTYPE; t uuid;
BEGIN
 SELECT * INTO c FROM public.cancellations WHERE id=p_cancellation_id FOR UPDATE;
 IF NOT FOUND OR c.stage NOT IN ('eligible_for_reimbursement','reimbursement_pending') THEN RAISE EXCEPTION 'cancellation is not eligible for reimbursement'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
 SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
 IF FOUND AND f.status IN ('transferred','processing') THEN RAISE EXCEPTION 'purchase funding is transferred or unresolved'; END IF;
 IF c.reimbursement_amount IS NULL OR c.reimbursement_amount<=0 THEN RAISE EXCEPTION 'no authoritative reimbursement amount'; END IF;
 SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='customer' AND profile_id=o.user_id FOR SHARE;
 IF NOT FOUND THEN UPDATE public.cancellations SET stage='admin_resolution_required',updated_at=now(),reimbursement_failure_reason='No verified customer transfer recipient' WHERE id=c.id; UPDATE public.orders SET cancellation_stage='admin_resolution_required' WHERE id=o.id; RAISE EXCEPTION 'no verified customer transfer recipient'; END IF;
 SELECT id INTO t FROM public.transfers WHERE cancellation_id=c.id FOR UPDATE;
 IF FOUND THEN RETURN t; END IF;
 INSERT INTO public.transfers(transfer_kind,cancellation_id,payee_type,amount,currency,status,paystack_reference,recipient_code)
 VALUES('customer_reimbursement',c.id,'customer',c.reimbursement_amount,'NGN','pending','dropzyy-reimbursement-'||c.id::text,r.recipient_code) RETURNING id INTO t;
 UPDATE public.cancellations SET stage='reimbursement_pending',updated_at=now() WHERE id=c.id;
 UPDATE public.orders SET cancellation_stage='reimbursement_pending' WHERE id=o.id;
 RETURN t;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_customer_reimbursement_transfer_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; ns text;
BEGIN
 IF NEW.transfer_kind<>'customer_reimbursement' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
 SELECT * INTO c FROM public.cancellations WHERE id=NEW.cancellation_id FOR UPDATE; IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
 ns:=CASE NEW.status WHEN 'success' THEN 'reimbursed' WHEN 'failed' THEN 'reimbursement_failed' WHEN 'reversed' THEN 'reimbursement_reversed' ELSE c.stage END;
 UPDATE public.cancellations SET stage=ns,reimbursement_transfer_id=CASE WHEN NEW.status='success' THEN NEW.id ELSE reimbursement_transfer_id END,reimbursement_failure_reason=CASE WHEN NEW.status IN ('failed','reversed') THEN COALESCE(NEW.raw_payload->>'message','Paystack reimbursement transfer was not successful') ELSE reimbursement_failure_reason END,resolved_at=CASE WHEN NEW.status IN ('success','failed','reversed') THEN COALESCE(resolved_at,now()) ELSE resolved_at END,updated_at=now() WHERE id=c.id;
 UPDATE public.orders SET cancellation_stage=ns WHERE id=o.id;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_finalize_customer_reimbursement ON public.transfers;
CREATE TRIGGER trg_finalize_customer_reimbursement AFTER UPDATE OF status ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.finalize_customer_reimbursement_transfer_state();
CREATE OR REPLACE FUNCTION public.repair_customer_reimbursement_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text;
BEGIN
 SELECT status INTO s FROM public.transfers WHERE cancellation_id=NEW.id AND transfer_kind='customer_reimbursement' ORDER BY created_at DESC LIMIT 1;
 IF s='failed' AND NEW.stage='resolved' THEN NEW.stage:='reimbursement_failed';
 ELSIF s='reversed' AND NEW.stage='resolved' THEN NEW.stage:='reimbursement_reversed';
 ELSIF s='success' AND NEW.stage<>'reimbursed' THEN NEW.stage:='reimbursed'; NEW.reimbursement_transfer_id:=(SELECT id FROM public.transfers WHERE cancellation_id=NEW.id AND status='success' LIMIT 1); END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_repair_customer_reimbursement_state ON public.cancellations;
CREATE TRIGGER trg_repair_customer_reimbursement_state BEFORE UPDATE OF stage ON public.cancellations FOR EACH ROW EXECUTE FUNCTION public.repair_customer_reimbursement_state();

-- Extend the existing claim contract only for the authoritative cancellation
-- amount; all legacy settlement/withdrawal/purchase-funding branches remain.
CREATE OR REPLACE FUNCTION public.claim_transfer_for_execution(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transfers%ROWTYPE; w public.withdrawal_requests%ROWTYPE; ds public.delivery_settlements%ROWTYPE; vs public.vendor_settlements%ROWTYPE; f public.purchase_funding%ROWTYPE; c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; amt numeric; rid uuid;
BEGIN
 SELECT * INTO t FROM public.transfers WHERE id=p_transfer_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
 IF t.status='processing' THEN RETURN jsonb_build_object('transfer_id',t.id,'status',t.status,'claim',false); END IF;
 IF t.status<>'pending' THEN RAISE EXCEPTION 'transfer is not pending'; END IF;
 IF t.transfer_kind='purchase_funding' THEN
   SELECT * INTO f FROM public.purchase_funding WHERE id=t.purchase_funding_id FOR UPDATE;
   IF NOT FOUND OR f.status NOT IN ('authorized','processing') OR f.rider_id IS DISTINCT FROM t.rider_id OR f.amount IS DISTINCT FROM t.amount THEN RAISE EXCEPTION 'purchase funding is not payout-eligible'; END IF;
   IF EXISTS (SELECT 1 FROM public.cancellations WHERE order_id=f.order_id AND stage NOT IN ('resolved','reimbursed')) THEN RAISE EXCEPTION 'order cancellation is active'; END IF;
   amt:=f.amount; rid:=f.rider_id;
 ELSIF t.transfer_kind='customer_reimbursement' THEN
   SELECT * INTO c FROM public.cancellations WHERE id=t.cancellation_id FOR UPDATE; SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
   IF NOT FOUND OR c.stage NOT IN ('reimbursement_pending','eligible_for_reimbursement') OR c.reimbursement_amount IS DISTINCT FROM t.amount OR t.payee_type<>'customer' THEN RAISE EXCEPTION 'reimbursement is not payout-eligible'; END IF;
 ELSIF t.withdrawal_request_id IS NOT NULL THEN
   SELECT * INTO w FROM public.withdrawal_requests WHERE id=t.withdrawal_request_id FOR UPDATE; IF NOT FOUND OR w.status<>'approved' THEN RAISE EXCEPTION 'withdrawal is not approved'; END IF; amt:=w.amount; rid:=w.rider_id;
 ELSIF t.vendor_settlement_id IS NOT NULL THEN
   SELECT * INTO vs FROM public.vendor_settlements WHERE id=t.vendor_settlement_id FOR UPDATE; IF NOT FOUND OR vs.status<>'pending' THEN RAISE EXCEPTION 'vendor settlement is not payout-eligible'; END IF; amt:=vs.amount;
 ELSE
   SELECT * INTO ds FROM public.delivery_settlements WHERE id=t.delivery_settlement_id FOR UPDATE; IF NOT FOUND OR ds.status<>'pending' THEN RAISE EXCEPTION 'settlement is not payout-eligible'; END IF; amt:=ds.rider_amount; rid:=ds.rider_id;
 END IF;
 PERFORM set_config('app.transfer_server_update','on',true);
 UPDATE public.transfers SET status='processing',raw_payload=jsonb_build_object('claimed_at',now()) WHERE id=t.id;
 IF t.transfer_kind='customer_reimbursement' THEN UPDATE public.cancellations SET stage='reimbursement_processing',updated_at=now() WHERE id=t.cancellation_id; UPDATE public.orders SET cancellation_stage='reimbursement_processing' WHERE id=o.id; END IF;
 RETURN jsonb_build_object('transfer_id',t.id,'reference',t.paystack_reference,'recipient_code',t.recipient_code,'payee_type',t.payee_type,'transfer_kind',t.transfer_kind,'amount',COALESCE(amt,t.amount),'amount_kobo',(COALESCE(amt,t.amount)*100)::bigint,'currency',t.currency,'claim',true,'rider_id',rid);
END; $$;
REVOKE ALL ON FUNCTION public.claim_transfer_for_execution(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transfer_for_execution(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.request_customer_cancellation(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_customer_cancellation(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) TO service_role;
