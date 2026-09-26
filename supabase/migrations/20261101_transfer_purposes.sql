-- Phase 2: extend the existing transfer ledger for purchase funding and
-- customer reimbursement. This migration does not initiate transfers.

ALTER TABLE public.transfer_recipients DROP CONSTRAINT IF EXISTS transfer_recipients_payee_type_check;
ALTER TABLE public.transfer_recipients ADD CONSTRAINT transfer_recipients_payee_type_check
  CHECK (payee_type IN ('vendor','rider','customer'));
ALTER TABLE public.transfer_recipients DROP CONSTRAINT IF EXISTS transfer_recipients_payee_shape_check;
ALTER TABLE public.transfer_recipients ADD CONSTRAINT transfer_recipients_payee_shape_check CHECK (
  (payee_type = 'vendor' AND vendor_id IS NOT NULL AND profile_id IS NULL)
  OR (payee_type IN ('rider','customer') AND profile_id IS NOT NULL AND vendor_id IS NULL)
);

ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_payee_type_check;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_payee_type_check
  CHECK (payee_type IN ('vendor','rider','customer'));

ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_withdrawal_rider_check;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_withdrawal_rider_check CHECK (
  withdrawal_request_id IS NULL OR (payee_type = 'rider' AND rider_id IS NOT NULL)
);

ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_one_source_check;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_one_source_check CHECK (
  (transfer_kind = 'settlement' AND (((vendor_settlement_id IS NOT NULL AND delivery_settlement_id IS NULL)
    OR (delivery_settlement_id IS NOT NULL AND vendor_settlement_id IS NULL)
    OR withdrawal_request_id IS NOT NULL)))
  OR (transfer_kind = 'withdrawal' AND withdrawal_request_id IS NOT NULL
      AND vendor_settlement_id IS NULL AND delivery_settlement_id IS NULL
      AND purchase_funding_id IS NULL AND cancellation_id IS NULL)
  OR (transfer_kind = 'purchase_funding' AND purchase_funding_id IS NOT NULL
      AND vendor_settlement_id IS NULL AND delivery_settlement_id IS NULL
      AND withdrawal_request_id IS NULL AND cancellation_id IS NULL
      AND payee_type = 'rider' AND rider_id IS NOT NULL)
  OR (transfer_kind = 'customer_reimbursement' AND cancellation_id IS NOT NULL
      AND vendor_settlement_id IS NULL AND delivery_settlement_id IS NULL
      AND withdrawal_request_id IS NULL AND purchase_funding_id IS NULL
      AND payee_type = 'customer')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_transfer_recipient
  ON public.transfer_recipients(profile_id) WHERE payee_type = 'customer';
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_funding_transfer_kind
  ON public.transfers(purchase_funding_id, transfer_kind) WHERE purchase_funding_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reimbursement_transfer_kind
  ON public.transfers(cancellation_id, transfer_kind) WHERE cancellation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_transfer_unauthorized_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE server_update boolean := COALESCE(current_setting('app.transfer_server_update', true),'off')='on';
BEGIN
 IF NEW.vendor_settlement_id IS DISTINCT FROM OLD.vendor_settlement_id OR NEW.delivery_settlement_id IS DISTINCT FROM OLD.delivery_settlement_id
    OR NEW.withdrawal_request_id IS DISTINCT FROM OLD.withdrawal_request_id OR NEW.rider_id IS DISTINCT FROM OLD.rider_id
    OR NEW.purchase_funding_id IS DISTINCT FROM OLD.purchase_funding_id OR NEW.cancellation_id IS DISTINCT FROM OLD.cancellation_id
    OR NEW.transfer_kind IS DISTINCT FROM OLD.transfer_kind OR NEW.payee_type IS DISTINCT FROM OLD.payee_type
    OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.paystack_reference IS DISTINCT FROM OLD.paystack_reference OR NEW.recipient_code IS DISTINCT FROM OLD.recipient_code THEN
   RAISE EXCEPTION 'transfer identity columns are immutable';
 END IF;
 IF NOT server_update AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.transfer_code IS DISTINCT FROM OLD.transfer_code OR NEW.raw_payload IS DISTINCT FROM OLD.raw_payload) THEN
   RAISE EXCEPTION 'transfer state is server-managed';
 END IF;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.create_pending_purchase_funding_transfer(p_purchase_funding_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.purchase_funding%ROWTYPE; r public.transfer_recipients%ROWTYPE; t uuid;
BEGIN
  SELECT * INTO f FROM public.purchase_funding WHERE id=p_purchase_funding_id FOR UPDATE;
  IF NOT FOUND OR f.status NOT IN ('authorized','processing') THEN RAISE EXCEPTION 'purchase funding is not authorized'; END IF;
  SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='rider' AND profile_id=(SELECT user_id FROM public.riders WHERE id=f.rider_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'no verified transfer recipient for rider'; END IF;
  SELECT id INTO t FROM public.transfers WHERE purchase_funding_id=f.id FOR UPDATE;
  IF FOUND THEN RETURN t; END IF;
  INSERT INTO public.transfers(transfer_kind,purchase_funding_id,rider_id,payee_type,amount,currency,status,paystack_reference,recipient_code)
  VALUES('purchase_funding',f.id,f.rider_id,'rider',f.amount,'NGN','pending','dropzyy-purchase-'||f.id::text,r.recipient_code) RETURNING id INTO t;
  RETURN t;
END; $$;

CREATE OR REPLACE FUNCTION public.create_pending_customer_reimbursement_transfer(p_cancellation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; r public.transfer_recipients%ROWTYPE; f public.purchase_funding%ROWTYPE; t uuid;
BEGIN
  SELECT * INTO c FROM public.cancellations WHERE id=p_cancellation_id FOR UPDATE;
  IF NOT FOUND OR c.stage <> 'eligible_for_reimbursement' THEN RAISE EXCEPTION 'cancellation is not eligible'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
  SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
  IF FOUND AND f.status IN ('transferred','processing') THEN RAISE EXCEPTION 'purchase funding has already been transferred or is processing'; END IF;
  SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='customer' AND profile_id=o.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no verified customer transfer recipient'; END IF;
  SELECT id INTO t FROM public.transfers WHERE cancellation_id=c.id FOR UPDATE;
  IF FOUND THEN RETURN t; END IF;
  INSERT INTO public.transfers(transfer_kind,cancellation_id,payee_type,amount,currency,status,paystack_reference,recipient_code)
  VALUES('customer_reimbursement',c.id,'customer',o.total,'NGN','pending','dropzyy-reimbursement-'||c.id::text,r.recipient_code) RETURNING id INTO t;
  UPDATE public.cancellations SET stage='reimbursement_pending',updated_at=now() WHERE id=c.id;
  UPDATE public.orders SET cancellation_stage='reimbursement_pending' WHERE id=o.id;
  RETURN t;
END; $$;

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
   amt:=f.amount; rid:=f.rider_id;
 ELSIF t.transfer_kind='customer_reimbursement' THEN
   SELECT * INTO c FROM public.cancellations WHERE id=t.cancellation_id FOR UPDATE;
   SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
   IF NOT FOUND OR c.stage NOT IN ('reimbursement_pending','eligible_for_reimbursement') OR t.payee_type<>'customer' OR t.amount IS DISTINCT FROM o.total THEN RAISE EXCEPTION 'reimbursement is not payout-eligible'; END IF;
 ELSIF t.withdrawal_request_id IS NOT NULL THEN
   SELECT * INTO w FROM public.withdrawal_requests WHERE id=t.withdrawal_request_id FOR UPDATE;
   IF NOT FOUND OR w.status NOT IN ('approved') THEN RAISE EXCEPTION 'withdrawal is not approved'; END IF;
   amt:=w.amount; rid:=w.rider_id;
 ELSIF t.vendor_settlement_id IS NOT NULL THEN
   SELECT * INTO vs FROM public.vendor_settlements WHERE id=t.vendor_settlement_id FOR UPDATE;
   IF NOT FOUND OR vs.status<>'pending' THEN RAISE EXCEPTION 'vendor settlement is not payout-eligible'; END IF;
   amt:=vs.amount;
 ELSE
   SELECT * INTO ds FROM public.delivery_settlements WHERE id=t.delivery_settlement_id FOR UPDATE;
   IF NOT FOUND OR ds.status<>'pending' THEN RAISE EXCEPTION 'settlement is not payout-eligible'; END IF;
   amt:=ds.rider_amount; rid:=ds.rider_id;
 END IF;
 PERFORM set_config('app.transfer_server_update','on',true);
 UPDATE public.transfers SET status='processing', raw_payload=jsonb_build_object('claimed_at',now()) WHERE id=t.id;
 RETURN jsonb_build_object('transfer_id',t.id,'reference',t.paystack_reference,'recipient_code',t.recipient_code,'payee_type',t.payee_type,'transfer_kind',t.transfer_kind,'amount',amt,'amount_kobo',(amt*100)::bigint,'currency',t.currency,'claim',true,'rider_id',rid);
END; $$;

CREATE OR REPLACE FUNCTION public.apply_transfer_webhook_event(p_reference text,p_transfer_code text,p_event_status text,p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transfers%ROWTYPE; ns text; f public.purchase_funding%ROWTYPE; c public.cancellations%ROWTYPE;
BEGIN
 IF p_event_status NOT IN ('success','failed','reversed') THEN RAISE EXCEPTION 'unsupported transfer status'; END IF;
 SELECT * INTO t FROM public.transfers WHERE paystack_reference=p_reference FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'no transfer for reference'; END IF;
 IF NULLIF(p_transfer_code,'') IS NOT NULL AND t.transfer_code IS NOT NULL AND p_transfer_code<>t.transfer_code THEN RAISE EXCEPTION 'transfer code mismatch'; END IF;
 IF t.status IN ('success','reversed') OR (t.status='failed' AND p_event_status='failed') THEN RETURN t.status; END IF;
 IF t.status='pending' AND p_event_status<>'success' THEN RETURN t.status; END IF;
 ns:=p_event_status; PERFORM set_config('app.transfer_server_update','on',true);
 UPDATE public.transfers SET status=ns,transfer_code=COALESCE(transfer_code,NULLIF(p_transfer_code,'')),raw_payload=COALESCE(p_payload,raw_payload) WHERE id=t.id;
 IF t.transfer_kind='purchase_funding' THEN
   SELECT * INTO f FROM public.purchase_funding WHERE id=t.purchase_funding_id FOR UPDATE;
   UPDATE public.purchase_funding SET status=CASE ns WHEN 'success' THEN 'transferred' WHEN 'reversed' THEN 'reversed' ELSE 'failed' END, transferred_at=CASE WHEN ns='success' THEN COALESCE(transferred_at,now()) ELSE transferred_at END, failure_reason=CASE WHEN ns='failed' THEN COALESCE(p_payload->>'message','Paystack transfer failed') ELSE failure_reason END, updated_at=now() WHERE id=t.purchase_funding_id;
   UPDATE public.orders SET purchase_funding_status=CASE ns WHEN 'success' THEN 'transferred' WHEN 'reversed' THEN 'reversed' ELSE 'failed' END WHERE id=f.order_id;
 ELSIF t.transfer_kind='customer_reimbursement' THEN
   SELECT * INTO c FROM public.cancellations WHERE id=t.cancellation_id FOR UPDATE;
   UPDATE public.cancellations SET stage=CASE ns WHEN 'success' THEN 'reimbursed' WHEN 'reversed' THEN 'resolved' ELSE 'resolved' END, reimbursement_transfer_id=CASE WHEN ns='success' THEN t.id ELSE reimbursement_transfer_id END, resolved_at=CASE WHEN ns IN ('success','failed','reversed') THEN COALESCE(resolved_at,now()) ELSE resolved_at END, updated_at=now() WHERE id=t.cancellation_id;
   UPDATE public.orders SET cancellation_stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END WHERE id=c.order_id;
 ELSIF t.withdrawal_request_id IS NOT NULL AND ns='success' THEN
   UPDATE public.withdrawal_requests SET status='paid',reviewed_at=COALESCE(reviewed_at,now()) WHERE id=t.withdrawal_request_id AND status<>'paid';
 END IF;
 RETURN ns;
END; $$;

REVOKE ALL ON FUNCTION public.create_pending_purchase_funding_transfer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_purchase_funding_transfer(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) TO service_role;
