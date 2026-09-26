-- Transfer retry attempts for purchase funding and customer reimbursement.
-- Failed/reversed attempts remain immutable history; only one active or
-- successful attempt may exist for each parent.

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS attempt_no integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='transfers_attempt_no_positive_check'
      AND conrelid='public.transfers'::regclass
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_attempt_no_positive_check
      CHECK (attempt_no IS NULL OR attempt_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='transfers_retry_source_attempt_required_check'
      AND conrelid='public.transfers'::regclass
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_retry_source_attempt_required_check
      CHECK (
        (purchase_funding_id IS NULL OR attempt_no IS NOT NULL)
        AND (cancellation_id IS NULL OR attempt_no IS NOT NULL)
      );
  END IF;
END $$;

UPDATE public.transfers
SET attempt_no=1
WHERE attempt_no IS NULL
  AND (purchase_funding_id IS NOT NULL OR cancellation_id IS NOT NULL);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transfers
    WHERE purchase_funding_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.purchase_funding f WHERE f.id=transfers.purchase_funding_id)
  ) THEN
    RAISE EXCEPTION 'orphaned purchase-funding transfer reference';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.transfers
    WHERE cancellation_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.cancellations c WHERE c.id=transfers.cancellation_id)
  ) THEN
    RAISE EXCEPTION 'orphaned reimbursement transfer reference';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.transfers
    WHERE (purchase_funding_id IS NOT NULL OR cancellation_id IS NOT NULL)
      AND (attempt_no IS NULL OR attempt_no <= 0)
  ) THEN
    RAISE EXCEPTION 'invalid retry attempt number';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.transfers
    WHERE purchase_funding_id IS NOT NULL
      AND status IN ('pending','processing','success')
    GROUP BY purchase_funding_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'multiple active purchase-funding attempts exist';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.transfers
    WHERE cancellation_id IS NOT NULL
      AND status IN ('pending','processing','success')
    GROUP BY cancellation_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'multiple active reimbursement attempts exist';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.transfers
    WHERE purchase_funding_id IS NOT NULL
    GROUP BY purchase_funding_id, attempt_no
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM public.transfers
    WHERE cancellation_id IS NOT NULL
    GROUP BY cancellation_id, attempt_no
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate transfer retry attempt number exists';
  END IF;
END $$;

DROP INDEX IF EXISTS public.uq_purchase_funding_transfer_kind;
DROP INDEX IF EXISTS public.uq_reimbursement_transfer_kind;

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_funding_transfer_attempt
  ON public.transfers(purchase_funding_id, attempt_no)
  WHERE purchase_funding_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cancellation_reimbursement_transfer_attempt
  ON public.transfers(cancellation_id, attempt_no)
  WHERE cancellation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_funding_active_transfer
  ON public.transfers(purchase_funding_id)
  WHERE purchase_funding_id IS NOT NULL
    AND status IN ('pending','processing','success');
CREATE UNIQUE INDEX IF NOT EXISTS uq_cancellation_reimbursement_active_transfer
  ON public.transfers(cancellation_id)
  WHERE cancellation_id IS NOT NULL
    AND status IN ('pending','processing','success');

CREATE OR REPLACE FUNCTION public.create_pending_purchase_funding_transfer(p_purchase_funding_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.purchase_funding%ROWTYPE; r public.transfer_recipients%ROWTYPE; existing public.transfers%ROWTYPE; t uuid; next_attempt integer;
BEGIN
  SELECT * INTO f FROM public.purchase_funding WHERE id=p_purchase_funding_id FOR UPDATE;
  IF NOT FOUND OR f.status NOT IN ('authorized','processing','failed','reversed') THEN RAISE EXCEPTION 'purchase funding is not retryable'; END IF;
  SELECT * INTO existing FROM public.transfers
   WHERE purchase_funding_id=f.id
   ORDER BY attempt_no DESC, created_at DESC
   LIMIT 1 FOR UPDATE;
  IF FOUND AND existing.status IN ('pending','processing','success') THEN RETURN existing.id; END IF;
  SELECT * INTO r FROM public.transfer_recipients
   WHERE payee_type='rider' AND profile_id=(SELECT user_id FROM public.riders WHERE id=f.rider_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'no verified transfer recipient for rider'; END IF;
  SELECT COALESCE(MAX(attempt_no),0)+1 INTO next_attempt
    FROM public.transfers WHERE purchase_funding_id=f.id;
  IF f.status IN ('failed','reversed') THEN
    UPDATE public.purchase_funding SET status='authorized', failure_reason=NULL, updated_at=now() WHERE id=f.id;
  END IF;
  INSERT INTO public.transfers(transfer_kind,purchase_funding_id,rider_id,payee_type,amount,currency,status,paystack_reference,recipient_code,attempt_no)
  VALUES('purchase_funding',f.id,f.rider_id,'rider',f.amount,'NGN','pending','dropzyy-purchase-'||f.id::text||'-attempt-'||next_attempt::text,r.recipient_code,next_attempt)
  RETURNING id INTO t;
  RETURN t;
END; $$;

CREATE OR REPLACE FUNCTION public.create_pending_customer_reimbursement_transfer(p_cancellation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; r public.transfer_recipients%ROWTYPE; f public.purchase_funding%ROWTYPE; existing public.transfers%ROWTYPE; t uuid; next_attempt integer;
BEGIN
  SELECT * INTO c FROM public.cancellations WHERE id=p_cancellation_id FOR UPDATE;
  IF NOT FOUND OR c.stage NOT IN ('eligible_for_reimbursement','reimbursement_pending','reimbursement_failed','reimbursement_reversed') THEN RAISE EXCEPTION 'cancellation is not eligible for reimbursement'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
  SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
  IF FOUND AND f.status IN ('transferred','processing') THEN RAISE EXCEPTION 'purchase funding is transferred or unresolved'; END IF;
  IF c.reimbursement_amount IS NULL OR c.reimbursement_amount<=0 THEN RAISE EXCEPTION 'no authoritative reimbursement amount'; END IF;
  SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='customer' AND profile_id=o.user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no verified customer transfer recipient'; END IF;
  SELECT * INTO existing FROM public.transfers
   WHERE cancellation_id=c.id
   ORDER BY attempt_no DESC, created_at DESC
   LIMIT 1 FOR UPDATE;
  IF FOUND AND existing.status IN ('pending','processing','success') THEN RETURN existing.id; END IF;
  SELECT COALESCE(MAX(attempt_no),0)+1 INTO next_attempt
    FROM public.transfers WHERE cancellation_id=c.id;
  UPDATE public.cancellations SET stage='reimbursement_pending',updated_at=now() WHERE id=c.id;
  UPDATE public.orders SET cancellation_stage='reimbursement_pending' WHERE id=o.id;
  INSERT INTO public.transfers(transfer_kind,cancellation_id,payee_type,amount,currency,status,paystack_reference,recipient_code,attempt_no)
  VALUES('customer_reimbursement',c.id,'customer',c.reimbursement_amount,'NGN','pending','dropzyy-reimbursement-'||c.id::text||'-attempt-'||next_attempt::text,r.recipient_code,next_attempt)
  RETURNING id INTO t;
  RETURN t;
END; $$;

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
   IF NOT FOUND OR w.status<>'approved' THEN RAISE EXCEPTION 'withdrawal is not approved'; END IF; amt:=w.amount; rid:=w.rider_id;
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
DECLARE t public.transfers%ROWTYPE; ns text; f public.purchase_funding%ROWTYPE; c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; latest boolean;
BEGIN
 IF p_event_status NOT IN ('success','failed','reversed') THEN RAISE EXCEPTION 'unsupported transfer status'; END IF;
  SELECT * INTO t FROM public.transfers WHERE paystack_reference=p_reference; IF NOT FOUND THEN RAISE EXCEPTION 'no transfer for reference'; END IF;
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
  IF NULLIF(p_transfer_code,'') IS NOT NULL AND t.transfer_code IS NOT NULL AND p_transfer_code<>t.transfer_code THEN RAISE EXCEPTION 'transfer code mismatch'; END IF;
 IF t.status='reversed' OR (t.status='success' AND p_event_status<>'reversed') OR t.status='failed' THEN RETURN t.status; END IF;
 ns:=p_event_status; PERFORM set_config('app.transfer_server_update','on',true);
 UPDATE public.transfers SET status=ns,transfer_code=COALESCE(transfer_code,NULLIF(p_transfer_code,'')),raw_payload=COALESCE(p_payload,raw_payload) WHERE id=t.id;
  IF t.purchase_funding_id IS NOT NULL THEN
    SELECT NOT EXISTS (SELECT 1 FROM public.transfers newer WHERE newer.purchase_funding_id=t.purchase_funding_id AND newer.attempt_no>t.attempt_no) INTO latest;
    IF latest THEN UPDATE public.purchase_funding SET status=CASE ns WHEN 'success' THEN 'transferred' WHEN 'reversed' THEN 'reversed' ELSE 'failed' END,transferred_at=CASE WHEN ns='success' THEN COALESCE(transferred_at,now()) ELSE transferred_at END,failure_reason=CASE WHEN ns<>'success' THEN COALESCE(p_payload->>'message','Purchase funding transfer was not successful') ELSE failure_reason END,updated_at=now() WHERE id=t.purchase_funding_id; UPDATE public.orders SET purchase_funding_status=CASE ns WHEN 'success' THEN 'transferred' WHEN 'reversed' THEN 'reversed' ELSE 'failed' END WHERE id=f.order_id; END IF;
 ELSIF t.cancellation_id IS NOT NULL THEN
   SELECT NOT EXISTS (SELECT 1 FROM public.transfers newer WHERE newer.cancellation_id=t.cancellation_id AND newer.attempt_no>t.attempt_no) INTO latest;
    IF latest THEN UPDATE public.cancellations SET stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END,reimbursement_transfer_id=CASE WHEN ns='success' THEN t.id ELSE reimbursement_transfer_id END,resolved_at=COALESCE(resolved_at,now()),updated_at=now() WHERE id=t.cancellation_id; UPDATE public.orders SET cancellation_stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END WHERE id=c.order_id; END IF;
 ELSIF t.withdrawal_request_id IS NOT NULL THEN
   IF ns='success' THEN UPDATE public.withdrawal_requests SET status='paid',reviewed_at=COALESCE(reviewed_at,now()) WHERE id=t.withdrawal_request_id AND status<>'paid'; ELSIF ns IN ('failed','reversed') THEN UPDATE public.withdrawal_requests SET status='rejected',reviewed_at=COALESCE(reviewed_at,now()),admin_note=COALESCE(admin_note,'Paystack transfer '||ns) WHERE id=t.withdrawal_request_id AND status<>'paid' AND status<>'rejected'; END IF;
 ELSIF t.delivery_settlement_id IS NOT NULL THEN
   UPDATE public.delivery_settlements SET payout_status=ns WHERE id=t.delivery_settlement_id;
 END IF;
 RETURN ns;
END; $func$;

CREATE OR REPLACE FUNCTION public.finalize_customer_reimbursement_transfer_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; latest boolean;
BEGIN
 IF NEW.transfer_kind<>'customer_reimbursement' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
 SELECT NOT EXISTS (SELECT 1 FROM public.transfers newer WHERE newer.cancellation_id=NEW.cancellation_id AND newer.attempt_no>COALESCE(NEW.attempt_no,0)) INTO latest;
 IF NOT latest THEN RETURN NEW; END IF;
 SELECT * INTO c FROM public.cancellations WHERE id=NEW.cancellation_id FOR UPDATE; IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
 UPDATE public.cancellations SET stage=CASE NEW.status WHEN 'success' THEN 'reimbursed' WHEN 'failed' THEN 'reimbursement_failed' WHEN 'reversed' THEN 'reimbursement_reversed' ELSE c.stage END,reimbursement_transfer_id=CASE WHEN NEW.status='success' THEN NEW.id ELSE reimbursement_transfer_id END,reimbursement_failure_reason=CASE WHEN NEW.status IN ('failed','reversed') THEN COALESCE(NEW.raw_payload->>'message','Paystack reimbursement transfer was not successful') ELSE reimbursement_failure_reason END,resolved_at=CASE WHEN NEW.status IN ('success','failed','reversed') THEN COALESCE(resolved_at,now()) ELSE resolved_at END,updated_at=now() WHERE id=c.id;
 UPDATE public.orders SET cancellation_stage=CASE NEW.status WHEN 'success' THEN 'reimbursed' WHEN 'failed' THEN 'reimbursement_failed' WHEN 'reversed' THEN 'reimbursement_reversed' ELSE cancellation_stage END WHERE id=o.id;
 RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_finalize_customer_reimbursement ON public.transfers;
CREATE TRIGGER trg_finalize_customer_reimbursement BEFORE UPDATE OF status ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.finalize_customer_reimbursement_transfer_state();

CREATE OR REPLACE FUNCTION public.repair_customer_reimbursement_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text; transfer_id uuid;
BEGIN
 SELECT status,id INTO s,transfer_id FROM public.transfers WHERE cancellation_id=NEW.id AND transfer_kind='customer_reimbursement' ORDER BY attempt_no DESC,created_at DESC LIMIT 1;
 IF s='failed' AND NEW.stage='resolved' THEN NEW.stage:='reimbursement_failed';
 ELSIF s='reversed' AND NEW.stage='resolved' THEN NEW.stage:='reimbursement_reversed';
 ELSIF s='success' AND NEW.stage<>'reimbursed' THEN NEW.stage:='reimbursed'; NEW.reimbursement_transfer_id:=transfer_id; END IF;
 RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.create_pending_purchase_funding_transfer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_purchase_funding_transfer(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_transfer_for_execution(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transfer_for_execution(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.apply_transfer_webhook_event(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transfer_webhook_event(text,text,text,jsonb) TO service_role;
