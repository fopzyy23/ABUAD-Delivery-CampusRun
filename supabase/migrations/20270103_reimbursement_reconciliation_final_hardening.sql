-- Close two bounded recovery gaps without resubmitting an ambiguous transfer:
-- 1) keep an expired cutoff claim alive while its existing transfer is in flight;
-- 2) quarantine an authoritative success reported for an already terminal
--    failed/reversed reimbursement attempt.

-- E1 owns orders with no linked cancellation. Reuse their expired claim row
-- rather than letting its unique(order_id) conflict strand an eligible order.
CREATE OR REPLACE FUNCTION public.claim_automatic_8pm_cutoff_orders(p_batch_size integer DEFAULT 50)
RETURNS TABLE (claim_id uuid, order_id uuid, claimed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_timezone text;
  v_now timestamp;
  v_cutoff time;
  v_batch_size integer := LEAST(GREATEST(COALESCE(p_batch_size,50),1),250);
  v_order public.orders%ROWTYPE;
  v_claim public.automatic_cutoff_claims%ROWTYPE;
BEGIN
  SELECT COALESCE(NULLIF(trim(s.timezone),''),'Africa/Lagos'),
         CASE WHEN EXTRACT(ISODOW FROM (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(trim(s.timezone),''),'Africa/Lagos'))) BETWEEN 1 AND 5
              THEN s.weekday_delivery_end ELSE s.weekend_delivery_end END
    INTO v_timezone,v_cutoff
    FROM public.site_settings s WHERE s.id=1;
  v_timezone:=COALESCE(v_timezone,'Africa/Lagos');
  v_cutoff:=COALESCE(v_cutoff,'20:00'::time);
  v_now:=CURRENT_TIMESTAMP AT TIME ZONE v_timezone;
  IF v_now::time<v_cutoff THEN RETURN; END IF;

  UPDATE public.automatic_cutoff_claims
     SET status='expired',updated_at=now()
   WHERE status IN ('claimed','processing') AND lease_until<=CURRENT_TIMESTAMP;

  FOR v_order IN
    SELECT o.* FROM public.orders o
     WHERE o.status IN ('Order confirmed','Preparing')
       AND o.rider_id IS NULL
       AND ((o.request_type='restaurant' AND o.delivery_method='rider' AND o.payment_status='success')
         OR (o.request_type='vendor_request' AND o.delivery_method='rider' AND o.vendor_delivery_requested=true AND o.delivery_payment_status='success'))
       AND o.cancellation_stage='none'
       AND o.cancellation_requested_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.cancellations c WHERE c.order_id=o.id)
       AND NOT EXISTS (SELECT 1 FROM public.automatic_cutoff_claims ac WHERE ac.order_id=o.id AND ac.status IN ('claimed','processing') AND ac.lease_until>CURRENT_TIMESTAMP)
     ORDER BY o.created_at,o.id
     FOR UPDATE OF o SKIP LOCKED
     LIMIT v_batch_size
  LOOP
    SELECT * INTO v_claim FROM public.automatic_cutoff_claims
     WHERE automatic_cutoff_claims.order_id=v_order.id
       AND status='expired' AND cancellation_id IS NULL
     ORDER BY updated_at DESC,id
     LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      UPDATE public.automatic_cutoff_claims
         SET status='claimed',claimed_at=now(),lease_until=now()+interval '15 minutes',
             last_error=NULL,updated_at=now()
       WHERE id=v_claim.id
       RETURNING * INTO v_claim;
    ELSE
      INSERT INTO public.automatic_cutoff_claims(order_id)
      VALUES(v_order.id) ON CONFLICT DO NOTHING
      RETURNING * INTO v_claim;
    END IF;
    IF FOUND THEN
      claim_id:=v_claim.id;
      order_id:=v_claim.order_id;
      claimed_at:=v_claim.claimed_at;
      RETURN NEXT;
    END IF;
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.claim_automatic_8pm_cutoff_orders(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automatic_8pm_cutoff_orders(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(p_claim_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.automatic_cutoff_claims%ROWTYPE; x public.cancellations%ROWTYPE; t public.transfers%ROWTYPE; id uuid; err text; next_count integer;
BEGIN
  SELECT * INTO c FROM public.automatic_cutoff_claims WHERE id=p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'automatic cutoff claim not found'; END IF;
  IF c.status IN ('completed','admin_resolution_required') THEN RETURN jsonb_build_object('claim_id',c.id,'status',c.status,'retryable',false); END IF;
  IF c.cancellation_id IS NULL THEN
    UPDATE public.automatic_cutoff_claims SET status='admin_resolution_required',last_error='automatic cancellation reference is missing',updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','admin_resolution_required','retryable',false);
  END IF;
  SELECT * INTO x FROM public.cancellations WHERE id=c.cancellation_id AND order_id=c.order_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.automatic_cutoff_claims SET status='admin_resolution_required',last_error='automatic cancellation record not found',updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','admin_resolution_required','retryable',false);
  END IF;
  SELECT * INTO t FROM public.transfers WHERE cancellation_id=x.id ORDER BY attempt_no DESC,created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND AND t.status='success' THEN
    UPDATE public.automatic_cutoff_claims SET status='completed',reimbursement_transfer_id=t.id,processed_at=COALESCE(processed_at,now()),lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','completed','reimbursement_transfer_id',t.id,'retryable',false);
  END IF;
  IF FOUND AND t.status IN ('pending','processing') THEN
    UPDATE public.automatic_cutoff_claims SET status='processing',reimbursement_transfer_id=t.id,lease_until=now()+interval '15 minutes',last_error=NULL,updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','processing','reimbursement_transfer_id',t.id,'retryable',false,'in_flight',true);
  END IF;
  next_count:=COALESCE(c.retry_count,0)+1;
  IF next_count>COALESCE(c.max_retry_count,5) THEN
    UPDATE public.automatic_cutoff_claims SET status='admin_resolution_required',lease_until=NULL,last_error='Max retry count exceeded ('||COALESCE(c.max_retry_count,5)||')',updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status','admin_resolution_required','retryable',false);
  END IF;
  UPDATE public.automatic_cutoff_claims SET retry_count=next_count,status='processing',lease_until=now()+interval '15 minutes',updated_at=now() WHERE id=c.id;
  BEGIN
    id:=public.create_pending_customer_reimbursement_transfer(x.id);
    IF id IS NULL THEN
      UPDATE public.automatic_cutoff_claims SET status='admin_resolution_required',lease_until=NULL,last_error='No active verified customer transfer recipient',updated_at=now() WHERE id=c.id;
      RETURN jsonb_build_object('claim_id',c.id,'status','admin_resolution_required','retryable',false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
    UPDATE public.automatic_cutoff_claims SET status=CASE WHEN next_count>=COALESCE(c.max_retry_count,5) THEN 'admin_resolution_required' ELSE 'failed' END,lease_until=NULL,last_error=left(err,500),updated_at=now() WHERE id=c.id;
    RETURN jsonb_build_object('claim_id',c.id,'status',CASE WHEN next_count>=COALESCE(c.max_retry_count,5) THEN 'admin_resolution_required' ELSE 'failed' END,'retryable',next_count<COALESCE(c.max_retry_count,5),'error',left(err,500));
  END;
  UPDATE public.automatic_cutoff_claims SET status='processing',reimbursement_transfer_id=id,lease_until=now()+interval '15 minutes',last_error=NULL,updated_at=now() WHERE id=c.id;
  RETURN jsonb_build_object('claim_id',c.id,'status','processing','reimbursement_transfer_id',id,'retryable',false,'retry_count',next_count);
END; $$;

REVOKE ALL ON FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_automatic_8pm_cutoff_reimbursement(uuid) TO service_role;

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

  -- A provider-confirmed success contradicting a persisted failed/reversed
  -- reimbursement is not a retry signal: retain the old attempt status and
  -- quarantine all order-level money movement for manual resolution.
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
     WHERE order_id=reservation_order
       AND cancellation_id=t.cancellation_id
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
  UPDATE public.transfers SET status=ns,transfer_code=COALESCE(transfer_code,NULLIF(p_transfer_code,'')),raw_payload=COALESCE(p_payload,raw_payload) WHERE id=t.id;
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
      UPDATE public.cancellations SET stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END,
        reimbursement_transfer_id=CASE WHEN ns='success' THEN t.id ELSE reimbursement_transfer_id END,
        resolved_at=COALESCE(resolved_at,now()),updated_at=now() WHERE id=t.cancellation_id;
      UPDATE public.orders SET cancellation_stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END WHERE id=c.order_id;
      IF ns='success' THEN
        UPDATE public.financial_resolution_reservations
           SET owner='reimbursement',state='terminal',cancellation_id=t.cancellation_id,updated_at=now()
         WHERE order_id=c.order_id AND owner='reimbursement';
      ELSIF ns IN ('failed','reversed') THEN
        UPDATE public.financial_resolution_reservations
           SET state='admin_resolution_required',updated_at=now()
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
