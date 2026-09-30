-- Permit trusted provider observation of an existing payout while preserving
-- conflict ownership as a hard block on any new financial execution.

CREATE OR REPLACE FUNCTION public.guard_financial_resolution_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_order_id uuid;
  v_observation_id text;
  v_reservation_owner text;
BEGIN
  IF TG_TABLE_NAME='refunds' THEN
    IF NEW.status='processed' THEN
      PERFORM public.reserve_financial_resolution(NEW.order_id,'refund',NEW.payment_id,NEW.id,NULL);
      UPDATE public.financial_resolution_reservations SET state='terminal',updated_at=now()
        WHERE order_id=NEW.order_id AND owner='refund';
    ELSIF NEW.status='failed' AND OLD.status IS DISTINCT FROM 'processed' THEN
      DELETE FROM public.financial_resolution_reservations
        WHERE order_id=NEW.order_id AND owner='refund' AND state='reserved';
    END IF;
  ELSIF TG_TABLE_NAME='transfers' AND NEW.transfer_kind='customer_reimbursement' THEN
    SELECT order_id INTO v_order_id FROM public.cancellations WHERE id=NEW.cancellation_id;
    IF v_order_id IS NULL THEN RAISE EXCEPTION 'reimbursement cancellation has no order'; END IF;

    SELECT owner INTO v_reservation_owner
      FROM public.financial_resolution_reservations
     WHERE order_id=v_order_id
     FOR UPDATE;

    IF v_reservation_owner='conflict' THEN
      v_observation_id:=current_setting('app.transfer_provider_observation_id',true);
      IF TG_OP='UPDATE' AND v_observation_id=NEW.id::text THEN
        IF (OLD.status='processing' AND NEW.status IN ('success','failed','reversed'))
           OR (OLD.status='success' AND NEW.status='reversed') THEN
          -- Existing provider outcome only: retain owner/state=conflict.
          RETURN NEW;
        END IF;
      END IF;
      RAISE EXCEPTION 'financial resolution conflict blocks reimbursement execution';
    END IF;

    IF NEW.status IN ('pending','processing','success') THEN
      PERFORM public.reserve_financial_resolution(v_order_id,'reimbursement',NULL,NULL,NEW.cancellation_id);
    END IF;
    IF NEW.status='success' THEN
      UPDATE public.financial_resolution_reservations SET state='terminal',updated_at=now()
        WHERE order_id=v_order_id AND owner='reimbursement';
    ELSIF NEW.status IN ('failed','reversed')
      AND OLD.status IS DISTINCT FROM 'success' THEN
      DELETE FROM public.financial_resolution_reservations
        WHERE order_id=v_order_id AND owner='reimbursement' AND state='reserved';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.guard_financial_resolution_write() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guard_financial_resolution_write() TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_customer_reimbursement_transfer_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  c public.cancellations%ROWTYPE;
  o public.orders%ROWTYPE;
  latest boolean;
  v_owner text;
BEGIN
  IF NEW.transfer_kind<>'customer_reimbursement' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  SELECT NOT EXISTS (SELECT 1 FROM public.transfers newer
    WHERE newer.cancellation_id=NEW.cancellation_id AND newer.attempt_no>COALESCE(NEW.attempt_no,0)) INTO latest;
  IF NOT latest THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.cancellations WHERE id=NEW.cancellation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
  SELECT owner INTO v_owner FROM public.financial_resolution_reservations WHERE order_id=o.id FOR UPDATE;
  IF v_owner='conflict' THEN
    -- Record the transfer status, but do not convert the order-level conflict
    -- into a clean reimbursed/failed state.
    RETURN NEW;
  END IF;
  UPDATE public.cancellations
     SET stage=CASE NEW.status WHEN 'success' THEN 'reimbursed' WHEN 'failed' THEN 'reimbursement_failed' WHEN 'reversed' THEN 'reimbursement_reversed' ELSE c.stage END,
         reimbursement_transfer_id=CASE WHEN NEW.status='success' THEN NEW.id ELSE reimbursement_transfer_id END,
         reimbursement_failure_reason=CASE WHEN NEW.status IN ('failed','reversed') THEN COALESCE(NEW.raw_payload->>'message','Paystack reimbursement transfer was not successful') ELSE reimbursement_failure_reason END,
         resolved_at=CASE WHEN NEW.status IN ('success','failed','reversed') THEN COALESCE(resolved_at,now()) ELSE resolved_at END,
         updated_at=now()
   WHERE id=c.id;
  UPDATE public.orders
     SET cancellation_stage=CASE NEW.status WHEN 'success' THEN 'reimbursed' WHEN 'failed' THEN 'reimbursement_failed' WHEN 'reversed' THEN 'reimbursement_reversed' ELSE cancellation_stage END
   WHERE id=o.id;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.finalize_customer_reimbursement_transfer_state() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_reimbursement_transfer_state() TO service_role;

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
    ELSIF ns IN ('failed','reversed') THEN UPDATE public.withdrawal_requests SET status='rejected',reviewed_at=COALESCE(reviewed_at,now()),admin_note=COALESCE(admin_note,'Paystack transfer '||ns) WHERE id=t.withdrawal_request_id AND status<>'paid' AND status<>'rejected'; END IF;
  ELSIF t.delivery_settlement_id IS NOT NULL THEN
    UPDATE public.delivery_settlements SET payout_status=ns WHERE id=t.delivery_settlement_id;
  END IF;
  RETURN ns;
END; $func$;

REVOKE ALL ON FUNCTION public.apply_transfer_webhook_event(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transfer_webhook_event(text,text,text,jsonb) TO service_role;
