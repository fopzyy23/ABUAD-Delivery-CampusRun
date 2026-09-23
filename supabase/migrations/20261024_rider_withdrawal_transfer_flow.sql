-- Rider withdrawal approval -> existing Paystack transfer ledger.
-- A withdrawal is its own authoritative payout source; it is not fabricated
-- into a single delivery settlement.
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS withdrawal_request_id bigint REFERENCES public.withdrawal_requests(id);
ALTER TABLE public.transfers ADD COLUMN IF NOT EXISTS rider_id uuid REFERENCES public.riders(id);

ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_one_settlement_check;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_one_payout_source_check CHECK (
  (CASE WHEN vendor_settlement_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN delivery_settlement_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN withdrawal_request_id IS NOT NULL THEN 1 ELSE 0 END) = 1
);
ALTER TABLE public.transfers ADD CONSTRAINT transfers_withdrawal_rider_check CHECK (
  withdrawal_request_id IS NULL OR (payee_type = 'rider' AND rider_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_transfers_withdrawal_request_id ON public.transfers(withdrawal_request_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_transfer_unauthorized_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE server_update boolean := COALESCE(current_setting('app.transfer_server_update', true),'off')='on';
BEGIN
 IF NEW.vendor_settlement_id IS DISTINCT FROM OLD.vendor_settlement_id OR NEW.delivery_settlement_id IS DISTINCT FROM OLD.delivery_settlement_id
    OR NEW.withdrawal_request_id IS DISTINCT FROM OLD.withdrawal_request_id OR NEW.rider_id IS DISTINCT FROM OLD.rider_id
    OR NEW.payee_type IS DISTINCT FROM OLD.payee_type OR NEW.amount IS DISTINCT FROM OLD.amount OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.paystack_reference IS DISTINCT FROM OLD.paystack_reference OR NEW.recipient_code IS DISTINCT FROM OLD.recipient_code THEN
   RAISE EXCEPTION 'transfer identity columns are immutable';
 END IF;
 IF NOT server_update AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.transfer_code IS DISTINCT FROM OLD.transfer_code OR NEW.raw_payload IS DISTINCT FROM OLD.raw_payload) THEN
   RAISE EXCEPTION 'transfer state is server-managed';
 END IF;
 RETURN NEW;
END; $$;

-- Service-role only. Locks the request, approves it, and returns/reuses the
-- current non-failed attempt. Amount and recipient are read from server data.
CREATE OR REPLACE FUNCTION public.approve_withdrawal_for_payout(p_withdrawal_id bigint, p_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.withdrawal_requests%ROWTYPE; r public.transfer_recipients%ROWTYPE; t public.transfers%ROWTYPE; tid uuid;
BEGIN
  IF p_withdrawal_id IS NULL OR p_admin_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_admin_id AND role='admin') THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  SELECT * INTO w FROM public.withdrawal_requests WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal not found'; END IF;
  IF w.status='rejected' THEN RAISE EXCEPTION 'withdrawal is rejected'; END IF;
  SELECT * INTO t FROM public.transfers WHERE withdrawal_request_id=w.id AND status <> 'failed' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    IF w.status <> 'paid' THEN UPDATE public.withdrawal_requests SET status='approved', reviewed_at=COALESCE(reviewed_at,now()), reviewed_by=COALESCE(reviewed_by,p_admin_id) WHERE id=w.id; END IF;
    RETURN jsonb_build_object('withdrawal_id',w.id,'transfer_id',t.id,'status',t.status,'already_exists',true);
  END IF;
  SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='rider' AND profile_id=(SELECT user_id FROM public.riders WHERE id=w.rider_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'no verified transfer recipient for rider'; END IF;
  UPDATE public.withdrawal_requests SET status='approved', reviewed_at=now(), reviewed_by=p_admin_id WHERE id=w.id AND status IN ('pending','approved');
  INSERT INTO public.transfers (withdrawal_request_id,rider_id,payee_type,amount,currency,status,paystack_reference,recipient_code)
  VALUES (w.id,w.rider_id,'rider',w.amount,'NGN','pending','dropzyy-withdrawal-'||w.id||'-'||gen_random_uuid()::text,r.recipient_code)
  RETURNING id INTO tid;
  RETURN jsonb_build_object('withdrawal_id',w.id,'transfer_id',tid,'status','pending','already_exists',false);
END; $$;
REVOKE ALL ON FUNCTION public.approve_withdrawal_for_payout(bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal_for_payout(bigint,uuid) TO service_role;

-- Extend the existing claim and webhook contracts for withdrawal transfers.
CREATE OR REPLACE FUNCTION public.claim_transfer_for_execution(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transfers%ROWTYPE; w public.withdrawal_requests%ROWTYPE; ds public.delivery_settlements%ROWTYPE; amt numeric; rid uuid;
BEGIN
 SELECT * INTO t FROM public.transfers WHERE id=p_transfer_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
 IF t.status='processing' THEN RETURN jsonb_build_object('transfer_id',t.id,'status',t.status,'claim',false); END IF;
 IF t.status<>'pending' THEN RAISE EXCEPTION 'transfer is not pending'; END IF;
 IF t.withdrawal_request_id IS NOT NULL THEN
   SELECT * INTO w FROM public.withdrawal_requests WHERE id=t.withdrawal_request_id FOR UPDATE;
   IF NOT FOUND OR w.status NOT IN ('approved') THEN RAISE EXCEPTION 'withdrawal is not approved'; END IF;
   amt:=w.amount; rid:=w.rider_id;
 ELSE
   SELECT * INTO ds FROM public.delivery_settlements WHERE id=t.delivery_settlement_id FOR UPDATE;
   IF NOT FOUND OR ds.status<>'pending' THEN RAISE EXCEPTION 'settlement is not payout-eligible'; END IF;
   amt:=ds.rider_amount; rid:=ds.rider_id;
 END IF;
 PERFORM set_config('app.transfer_server_update','on',true);
 UPDATE public.transfers SET status='processing', raw_payload=jsonb_build_object('claimed_at',now()) WHERE id=t.id;
 RETURN jsonb_build_object('transfer_id',t.id,'reference',t.paystack_reference,'recipient_code',t.recipient_code,'payee_type',t.payee_type,'amount',amt,'amount_kobo',(amt*100)::bigint,'currency',t.currency,'claim',true,'rider_id',rid);
END; $$;
REVOKE ALL ON FUNCTION public.claim_transfer_for_execution(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.claim_transfer_for_execution(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_transfer_webhook_event(p_reference text,p_transfer_code text,p_event_status text,p_payload jsonb)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transfers%ROWTYPE; ns text;
BEGIN
 IF p_event_status NOT IN ('success','failed','reversed') THEN RAISE EXCEPTION 'unsupported transfer status'; END IF;
 SELECT * INTO t FROM public.transfers WHERE paystack_reference=p_reference FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'no transfer for reference'; END IF;
 IF NULLIF(p_transfer_code,'') IS NOT NULL AND t.transfer_code IS NOT NULL AND p_transfer_code<>t.transfer_code THEN RAISE EXCEPTION 'transfer code mismatch'; END IF;
 IF t.status IN ('success','reversed') OR (t.status='failed' AND p_event_status='failed') THEN RETURN t.status; END IF;
 IF t.status='pending' AND p_event_status<>'success' THEN RETURN t.status; END IF;
 ns:=p_event_status; PERFORM set_config('app.transfer_server_update','on',true);
 UPDATE public.transfers SET status=ns,transfer_code=COALESCE(transfer_code,NULLIF(p_transfer_code,'')),raw_payload=COALESCE(p_payload,raw_payload) WHERE id=t.id;
 IF ns='success' AND t.withdrawal_request_id IS NOT NULL THEN UPDATE public.withdrawal_requests SET status='paid',reviewed_at=COALESCE(reviewed_at,now()) WHERE id=t.withdrawal_request_id AND status<>'paid'; END IF;
 RETURN ns;
END; $$;
REVOKE ALL ON FUNCTION public.apply_transfer_webhook_event(text,text,text,jsonb) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.apply_transfer_webhook_event(text,text,text,jsonb) TO service_role;
