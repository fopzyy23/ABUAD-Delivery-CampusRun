-- Lock order for withdrawal money movement: rider -> withdrawal -> transfer.
BEGIN;
ALTER TABLE public.withdrawal_requests ADD COLUMN IF NOT EXISTS payout_resolution_required boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_withdrawal_active_transfer ON public.transfers(withdrawal_request_id) WHERE withdrawal_request_id IS NOT NULL AND status IN ('pending','processing','success');
CREATE OR REPLACE FUNCTION public._calculate_rider_balance(p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE g numeric; w numeric; r numeric; b numeric; bon numeric; today numeric;
        settlement_paid numeric; settlement_reserved numeric;
BEGIN
  SELECT COALESCE(SUM(rider_amount),0) INTO g FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status <> 'reversed';
  SELECT COALESCE(SUM(bn.amount),0),
         COALESCE(SUM(CASE WHEN bn.qualifying_date=(now() AT TIME ZONE 'Africa/Lagos')::date THEN bn.amount ELSE 0 END),0)
    INTO bon, today
    FROM public.rider_daily_bonuses bn
    JOIN public.delivery_settlements ds ON ds.id = bn.qualifying_settlement_id
   WHERE bn.rider_id = p_rider_id
     AND ds.status <> 'reversed';
  g := g + bon;
  SELECT COALESCE(SUM(wr.amount),0) INTO w
    FROM public.withdrawal_requests wr
   WHERE wr.rider_id=p_rider_id
     AND EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=wr.id AND t.status='success');
  SELECT COALESCE(SUM(wr.amount),0) INTO r
    FROM public.withdrawal_requests wr
   WHERE wr.rider_id=p_rider_id
     AND NOT EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=wr.id AND t.status='success')
     AND (wr.payout_resolution_required
       OR EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=wr.id AND t.status IN ('pending','processing'))
       OR (wr.status IN ('pending','approved','paid') AND NOT EXISTS (
         SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=wr.id AND t.status IN ('failed','reversed'))));
  SELECT COALESCE(SUM(t.amount),0) INTO settlement_paid
    FROM public.transfers t
    JOIN public.delivery_settlements ds ON ds.id=t.delivery_settlement_id
   WHERE ds.rider_id=p_rider_id
     AND t.delivery_settlement_id IS NOT NULL
     AND t.status='success';
  SELECT COALESCE(SUM(t.amount),0) INTO settlement_reserved
    FROM public.transfers t
    JOIN public.delivery_settlements ds ON ds.id=t.delivery_settlement_id
   WHERE ds.rider_id=p_rider_id
     AND t.delivery_settlement_id IS NOT NULL
     AND t.status IN ('pending','processing');
  b:=GREATEST(g-w-settlement_paid-r-settlement_reserved,0);
  RETURN jsonb_build_object(
    'gross_earned',g,
    'withdrawn_amount',w+settlement_paid,
    'reserved_amount',r+settlement_reserved,
    'available_balance',b,
    'bonus_earned_today',today
  );
END; $func$;

-- These functions retain service-only execution after CREATE OR REPLACE.
REVOKE ALL ON FUNCTION public._calculate_rider_balance(uuid), public.claim_transfer_for_execution(uuid), public.apply_transfer_webhook_event(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._calculate_rider_balance(uuid), public.claim_transfer_for_execution(uuid), public.apply_transfer_webhook_event(text,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_withdrawal_state_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_server boolean := COALESCE(current_setting('app.transfer_server_update',true),'off')='on';
BEGIN
  IF NEW.payout_resolution_required IS DISTINCT FROM OLD.payout_resolution_required AND NOT v_server THEN
    RAISE EXCEPTION 'payout resolution hold is server-managed';
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status='rejected' AND (OLD.payout_resolution_required OR EXISTS (
    SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=OLD.id AND t.status IN ('pending','processing','success'))) THEN
    RAISE EXCEPTION 'withdrawal has an active, successful or unresolved transfer';
  END IF;
  IF NEW.status='paid' AND (NOT v_server OR NOT EXISTS (
    SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=OLD.id AND t.status='success')) THEN
    RAISE EXCEPTION 'withdrawal can be marked paid only after a successful transfer';
  END IF;
  IF OLD.status='paid' AND NOT (NEW.status='rejected' AND v_server AND EXISTS (
    SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=OLD.id AND t.status='reversed')) THEN
    RAISE EXCEPTION 'paid withdrawal requires provider reversal';
  END IF;
  IF OLD.status='rejected' AND NEW.status<>'paid' THEN RAISE EXCEPTION 'rejected withdrawal is terminal'; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_withdrawal_state_transition ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_state_transition BEFORE UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_state_transition();
REVOKE ALL ON FUNCTION public.guard_withdrawal_state_transition() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(p_withdrawal_id bigint,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.withdrawal_requests%ROWTYPE; v_new public.withdrawal_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  SELECT * INTO v_old FROM public.withdrawal_requests WHERE id=p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal not found'; END IF;
  PERFORM 1 FROM public.riders WHERE id=v_old.rider_id FOR UPDATE;
  SELECT * INTO v_old FROM public.withdrawal_requests WHERE id=p_withdrawal_id FOR UPDATE;
  IF v_old.status='rejected' AND NOT v_old.payout_resolution_required AND NOT EXISTS (
    SELECT 1 FROM public.transfers WHERE withdrawal_request_id=v_old.id AND status IN ('pending','processing','success')) THEN
    RETURN to_jsonb(v_old);
  END IF;
  IF v_old.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'withdrawal cannot be rejected'; END IF;
  UPDATE public.withdrawal_requests SET status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),admin_note=NULLIF(trim(p_note),'')
    WHERE id=p_withdrawal_id RETURNING * INTO v_new;
  PERFORM public._admin_audit('reject','withdrawal',p_withdrawal_id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.admin_reject_withdrawal(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal(bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_withdrawal_for_payout(p_withdrawal_id bigint,p_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.withdrawal_requests%ROWTYPE; r public.transfer_recipients%ROWTYPE; t public.transfers%ROWTYPE; tid uuid;
BEGIN
  -- The Edge Function checks the caller's MFA; this RPC is service-role only.
  IF p_admin_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_admin_id AND role='admin') THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  SELECT * INTO w FROM public.withdrawal_requests WHERE id=p_withdrawal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal not found'; END IF;
  PERFORM 1 FROM public.riders WHERE id=w.rider_id FOR UPDATE;
  SELECT * INTO w FROM public.withdrawal_requests WHERE id=p_withdrawal_id FOR UPDATE;
  IF w.payout_resolution_required THEN RAISE EXCEPTION 'withdrawal requires provider reconciliation'; END IF;
  SELECT * INTO t FROM public.transfers WHERE withdrawal_request_id=w.id AND status IN ('pending','processing','success') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('withdrawal_id',w.id,'transfer_id',t.id,'status',t.status,'already_exists',true); END IF;
  IF w.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'withdrawal is terminal'; END IF;
  SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='rider'
    AND profile_id=(SELECT user_id FROM public.riders WHERE id=w.rider_id)
    AND is_active AND recipient_status='verified' ORDER BY updated_at DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no verified transfer recipient for rider'; END IF;
  UPDATE public.withdrawal_requests SET status='approved',reviewed_at=now(),reviewed_by=p_admin_id WHERE id=w.id;
  INSERT INTO public.transfers(withdrawal_request_id,rider_id,payee_type,amount,currency,status,paystack_reference,recipient_code)
    VALUES(w.id,w.rider_id,'rider',w.amount,'NGN','pending','dropzyy-withdrawal-'||w.id||'-'||gen_random_uuid()::text,r.recipient_code) RETURNING id INTO tid;
  INSERT INTO public.admin_action_audit(admin_id,action,entity_type,entity_id,before_state,after_state)
    VALUES(p_admin_id,'approve_payout','withdrawal',w.id::text,to_jsonb(w),jsonb_build_object('transfer_id',tid,'status','approved'));
  RETURN jsonb_build_object('withdrawal_id',w.id,'transfer_id',tid,'status','pending','already_exists',false);
END; $$;
REVOKE ALL ON FUNCTION public.approve_withdrawal_for_payout(bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal_for_payout(bigint,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_withdrawal_transfer_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w public.withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO w FROM public.withdrawal_requests WHERE id=NEW.withdrawal_request_id;
  PERFORM 1 FROM public.riders WHERE id=w.rider_id FOR UPDATE;
  SELECT * INTO w FROM public.withdrawal_requests WHERE id=NEW.withdrawal_request_id FOR UPDATE;
  IF NOT FOUND OR w.status<>'approved' OR w.payout_resolution_required
     OR w.amount IS DISTINCT FROM NEW.amount OR w.rider_id IS DISTINCT FROM NEW.rider_id THEN
    RAISE EXCEPTION 'withdrawal transfer has no eligible reserved obligation';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_withdrawal_transfer_reservation() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_guard_withdrawal_transfer_reservation ON public.transfers;
CREATE TRIGGER trg_guard_withdrawal_transfer_reservation BEFORE INSERT ON public.transfers
FOR EACH ROW WHEN (NEW.withdrawal_request_id IS NOT NULL) EXECUTE FUNCTION public.guard_withdrawal_transfer_reservation();

CREATE OR REPLACE FUNCTION public.claim_transfer_for_execution(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.transfers%ROWTYPE; w public.withdrawal_requests%ROWTYPE; ds public.delivery_settlements%ROWTYPE; vs public.vendor_settlements%ROWTYPE; f public.purchase_funding%ROWTYPE; c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; amt numeric; rid uuid;
BEGIN
 SELECT * INTO t FROM public.transfers WHERE id=p_transfer_id; IF NOT FOUND THEN RAISE EXCEPTION 'transfer not found'; END IF;
 IF t.purchase_funding_id IS NOT NULL THEN
   SELECT * INTO f FROM public.purchase_funding WHERE id=t.purchase_funding_id FOR UPDATE;
 ELSIF t.cancellation_id IS NOT NULL THEN
   SELECT * INTO c FROM public.cancellations WHERE id=t.cancellation_id FOR UPDATE; SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
 ELSIF t.withdrawal_request_id IS NOT NULL THEN
   SELECT * INTO w FROM public.withdrawal_requests WHERE id=t.withdrawal_request_id;
   PERFORM 1 FROM public.riders WHERE id=w.rider_id FOR UPDATE;
   SELECT * INTO w FROM public.withdrawal_requests WHERE id=t.withdrawal_request_id FOR UPDATE;
 ELSIF t.vendor_settlement_id IS NOT NULL THEN
   SELECT * INTO vs FROM public.vendor_settlements WHERE id=t.vendor_settlement_id FOR UPDATE;
 ELSE
   SELECT * INTO ds FROM public.delivery_settlements WHERE id=t.delivery_settlement_id FOR UPDATE;
 END IF;
 SELECT * INTO t FROM public.transfers WHERE id=p_transfer_id FOR UPDATE;
 IF t.status='processing' THEN RETURN jsonb_build_object('transfer_id',t.id,'status',t.status,'claim',false); END IF;
 IF t.status<>'pending' THEN RAISE EXCEPTION 'transfer is not pending'; END IF;
 IF t.purchase_funding_id IS NOT NULL THEN
   IF NOT FOUND OR f.status NOT IN ('authorized','processing') OR f.rider_id IS DISTINCT FROM t.rider_id OR f.amount IS DISTINCT FROM t.amount THEN RAISE EXCEPTION 'purchase funding is not payout-eligible'; END IF;
   IF EXISTS (SELECT 1 FROM public.cancellations WHERE order_id=f.order_id AND stage NOT IN ('resolved','reimbursed')) THEN RAISE EXCEPTION 'order cancellation is active'; END IF;
   amt:=f.amount; rid:=f.rider_id;
 ELSIF t.cancellation_id IS NOT NULL THEN
   IF NOT FOUND OR c.stage NOT IN ('reimbursement_pending','eligible_for_reimbursement') OR c.reimbursement_amount IS DISTINCT FROM t.amount OR t.payee_type<>'customer' THEN RAISE EXCEPTION 'reimbursement is not payout-eligible'; END IF;
 ELSIF t.withdrawal_request_id IS NOT NULL THEN
   IF NOT FOUND OR (w.status<>'approved' OR w.payout_resolution_required) THEN RAISE EXCEPTION 'withdrawal is not approved'; END IF; amt:=w.amount; rid:=w.rider_id;
 ELSIF t.vendor_settlement_id IS NOT NULL THEN
   IF NOT FOUND OR vs.status<>'pending' THEN RAISE EXCEPTION 'vendor settlement is not payout-eligible'; END IF; amt:=vs.amount;
 ELSE
   IF NOT FOUND OR ds.status<>'pending' THEN RAISE EXCEPTION 'settlement is not payout-eligible'; END IF; amt:=ds.rider_amount; rid:=ds.rider_id;
 END IF;
 IF t.purchase_funding_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.transfers newer WHERE newer.purchase_funding_id=t.purchase_funding_id AND newer.attempt_no>t.attempt_no AND newer.status IN ('pending','processing','success')) THEN RAISE EXCEPTION 'newer purchase funding attempt is active'; END IF;
 IF t.cancellation_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.transfers newer WHERE newer.cancellation_id=t.cancellation_id AND newer.attempt_no>t.attempt_no AND newer.status IN ('pending','processing','success')) THEN RAISE EXCEPTION 'newer reimbursement attempt is active'; END IF;
 PERFORM set_config('app.transfer_server_update','on',true);
 UPDATE public.transfers SET status='processing',raw_payload=jsonb_build_object('claimed_at',now()) WHERE id=t.id;
 IF t.cancellation_id IS NOT NULL THEN UPDATE public.cancellations SET stage='reimbursement_processing',updated_at=now() WHERE id=t.cancellation_id; UPDATE public.orders SET cancellation_stage='reimbursement_processing' WHERE id=o.id; END IF;
 RETURN jsonb_build_object('transfer_id',t.id,'reference',t.paystack_reference,'recipient_code',t.recipient_code,'payee_type',t.payee_type,'transfer_kind',t.transfer_kind,'amount',COALESCE(amt,t.amount),'amount_kobo',(COALESCE(amt,t.amount)*100)::bigint,'currency',t.currency,'claim',true,'rider_id',rid);
END; $$;

CREATE OR REPLACE FUNCTION public.apply_transfer_webhook_event(
  p_reference text, p_transfer_code text, p_event_status text, p_payload jsonb
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $func$
DECLARE
  t public.transfers%ROWTYPE;
  ns text;
  f public.purchase_funding%ROWTYPE;
  c public.cancellations%ROWTYPE;
  o public.orders%ROWTYPE;
  latest boolean;
  reservation_order uuid;
  reservation_owner text;
  w public.withdrawal_requests%ROWTYPE;
BEGIN
  IF p_event_status NOT IN ('success','failed','reversed') THEN RAISE EXCEPTION 'unsupported transfer status'; END IF;
  SELECT * INTO t FROM public.transfers WHERE paystack_reference=p_reference;
  IF NOT FOUND THEN RAISE EXCEPTION 'no transfer for reference'; END IF;
  IF t.purchase_funding_id IS NOT NULL THEN
    SELECT * INTO f FROM public.purchase_funding WHERE id=t.purchase_funding_id FOR UPDATE;
    SELECT * INTO t FROM public.transfers WHERE id=t.id FOR UPDATE;
  ELSIF t.cancellation_id IS NOT NULL THEN
    SELECT * INTO c FROM public.cancellations WHERE id=t.cancellation_id FOR UPDATE;
    SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
    SELECT * INTO t FROM public.transfers WHERE id=t.id FOR UPDATE;
  ELSIF t.withdrawal_request_id IS NOT NULL THEN
    SELECT * INTO w FROM public.withdrawal_requests WHERE id=t.withdrawal_request_id;
    PERFORM 1 FROM public.riders WHERE id=w.rider_id FOR UPDATE;
    SELECT * INTO w FROM public.withdrawal_requests WHERE id=t.withdrawal_request_id FOR UPDATE;
    SELECT * INTO t FROM public.transfers WHERE id=t.id FOR UPDATE;
  ELSE
    SELECT * INTO t FROM public.transfers WHERE id=t.id FOR UPDATE;
  END IF;
  IF NULLIF(p_transfer_code,'') IS NOT NULL AND t.transfer_code IS NOT NULL AND p_transfer_code<>t.transfer_code THEN
    RAISE EXCEPTION 'transfer code mismatch';
  END IF;

  IF t.transfer_kind='customer_reimbursement'
     AND t.status IN ('failed','reversed')
     AND p_event_status='success' THEN
    PERFORM set_config('app.transfer_server_update','on',true);
    UPDATE public.transfers
       SET raw_payload=COALESCE(raw_payload,'{}'::jsonb) ||
         jsonb_build_object('late_success_anomaly',jsonb_build_object(
           'observed_at',now(),'previous_local_status',t.status,
           'provider_event_status',p_event_status,'provider_payload',p_payload))
     WHERE id=t.id;
    UPDATE public.cancellations
       SET stage='admin_resolution_required',
           reimbursement_failure_reason='Provider reported success for an attempt already recorded as '||t.status,
           updated_at=now()
     WHERE id=t.cancellation_id;
    reservation_order:=c.order_id;
    UPDATE public.orders SET cancellation_stage='admin_resolution_required'
     WHERE id=reservation_order;
    UPDATE public.automatic_cutoff_claims
       SET status='admin_resolution_required',lease_until=NULL,
           last_error='Late provider success contradicts terminal reimbursement attempt '||t.id::text,
           updated_at=now()
     WHERE order_id=reservation_order AND cancellation_id=t.cancellation_id
       AND status<>'admin_resolution_required';
    INSERT INTO public.financial_resolution_reservations
      (order_id,owner,state,cancellation_id)
    VALUES (reservation_order,'conflict','admin_resolution_required',t.cancellation_id)
    ON CONFLICT (order_id) DO UPDATE
       SET owner='conflict',state='admin_resolution_required',
           cancellation_id=COALESCE(public.financial_resolution_reservations.cancellation_id,EXCLUDED.cancellation_id),
           updated_at=now();
    RETURN t.status;
  END IF;

  -- A contradictory late success must not authorize a second payout. Preserve
  -- the terminal attempt as evidence and hold this obligation for reconciliation.
  IF t.withdrawal_request_id IS NOT NULL AND t.status IN ('failed','reversed') AND p_event_status='success' THEN
    PERFORM set_config('app.transfer_server_update','on',true);
    UPDATE public.withdrawal_requests SET payout_resolution_required=true WHERE id=t.withdrawal_request_id;
    UPDATE public.transfers SET raw_payload=COALESCE(raw_payload,'{}'::jsonb) ||
      jsonb_build_object('admin_resolution_required',true,'late_success_payload',p_payload) WHERE id=t.id;
    RETURN t.status;
  END IF;
  IF t.status='reversed' OR (t.status='success' AND p_event_status<>'reversed') OR t.status='failed' THEN RETURN t.status; END IF;
  ns:=p_event_status;
  PERFORM set_config('app.transfer_server_update','on',true);
  PERFORM set_config('app.transfer_provider_observation_id',t.id::text,true);
  UPDATE public.transfers
     SET status=ns,transfer_code=COALESCE(transfer_code,NULLIF(p_transfer_code,'')),
         raw_payload=COALESCE(p_payload,raw_payload)
   WHERE id=t.id;
  PERFORM set_config('app.transfer_provider_observation_id','',true);

  IF t.purchase_funding_id IS NOT NULL THEN
    SELECT NOT EXISTS (SELECT 1 FROM public.transfers newer WHERE newer.purchase_funding_id=t.purchase_funding_id AND newer.attempt_no>t.attempt_no) INTO latest;
    IF latest THEN
      UPDATE public.purchase_funding SET status=CASE ns WHEN 'success' THEN 'transferred' WHEN 'reversed' THEN 'reversed' ELSE 'failed' END,
        transferred_at=CASE WHEN ns='success' THEN COALESCE(transferred_at,now()) ELSE transferred_at END,
        failure_reason=CASE WHEN ns<>'success' THEN COALESCE(p_payload->>'message','Purchase funding transfer was not successful') ELSE failure_reason END,
        updated_at=now() WHERE id=t.purchase_funding_id;
      UPDATE public.orders SET purchase_funding_status=CASE ns WHEN 'success' THEN 'transferred' WHEN 'reversed' THEN 'reversed' ELSE 'failed' END WHERE id=f.order_id;
    END IF;
  ELSIF t.cancellation_id IS NOT NULL THEN
    SELECT NOT EXISTS (SELECT 1 FROM public.transfers newer WHERE newer.cancellation_id=t.cancellation_id AND newer.attempt_no>t.attempt_no) INTO latest;
    IF latest THEN
      SELECT owner INTO reservation_owner FROM public.financial_resolution_reservations WHERE order_id=c.order_id FOR UPDATE;
      IF reservation_owner='conflict' THEN RETURN ns; END IF;
      UPDATE public.cancellations SET stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END,
        reimbursement_transfer_id=CASE WHEN ns='success' THEN t.id ELSE reimbursement_transfer_id END,
        resolved_at=COALESCE(resolved_at,now()),updated_at=now() WHERE id=t.cancellation_id;
      UPDATE public.orders SET cancellation_stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END WHERE id=c.order_id;
      IF ns='success' THEN
        UPDATE public.financial_resolution_reservations
           SET owner='reimbursement',state='terminal',cancellation_id=t.cancellation_id,updated_at=now()
         WHERE order_id=c.order_id AND owner='reimbursement';
      ELSIF ns IN ('failed','reversed') THEN
        UPDATE public.financial_resolution_reservations SET state='admin_resolution_required',updated_at=now()
         WHERE order_id=c.order_id AND owner='reimbursement';
      END IF;
    END IF;
  ELSIF t.withdrawal_request_id IS NOT NULL THEN
    IF ns='success' THEN UPDATE public.withdrawal_requests SET status='paid',reviewed_at=COALESCE(reviewed_at,now()) WHERE id=t.withdrawal_request_id AND status<>'paid';
    ELSIF ns IN ('failed','reversed') THEN UPDATE public.withdrawal_requests SET status='rejected',reviewed_at=COALESCE(reviewed_at,now()),admin_note=COALESCE(admin_note,'Paystack transfer '||ns) WHERE id=t.withdrawal_request_id AND status<>'rejected'; END IF;
  ELSIF t.delivery_settlement_id IS NOT NULL THEN
    UPDATE public.delivery_settlements SET payout_status=ns WHERE id=t.delivery_settlement_id;
  END IF;
  RETURN ns;
END; $func$;

COMMIT;
