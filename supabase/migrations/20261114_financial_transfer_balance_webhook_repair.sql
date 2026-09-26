-- Corrective repair: rider-isolated settlement balance accounting and
-- complete purpose-aware transfer webhook reconciliation.

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
     AND wr.status='paid'
     AND EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=wr.id AND t.status='success');
  SELECT COALESCE(SUM(amount),0) INTO r
    FROM public.withdrawal_requests
   WHERE rider_id=p_rider_id AND status IN ('pending','approved');
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

REVOKE ALL ON FUNCTION public._calculate_rider_balance(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._calculate_rider_balance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_transfer_webhook_event(
  p_reference text,
  p_transfer_code text,
  p_event_status text,
  p_payload jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  t public.transfers%ROWTYPE;
  ns text;
  f public.purchase_funding%ROWTYPE;
  c public.cancellations%ROWTYPE;
  o public.orders%ROWTYPE;
BEGIN
  IF p_event_status NOT IN ('success', 'failed', 'reversed') THEN
    RAISE EXCEPTION 'unsupported transfer status';
  END IF;

  SELECT * INTO t
  FROM public.transfers
  WHERE paystack_reference = p_reference
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no transfer for reference';
  END IF;

  IF NULLIF(p_transfer_code, '') IS NOT NULL
     AND t.transfer_code IS NOT NULL
     AND p_transfer_code <> t.transfer_code THEN
    RAISE EXCEPTION 'transfer code mismatch';
  END IF;

  IF t.status = 'reversed'
     OR (t.status = 'success' AND p_event_status <> 'reversed')
     OR t.status = 'failed' THEN
    RETURN t.status;
  END IF;

  -- A pending/processing transfer receiving a non-success event is still
  -- authoritative only when Paystack reports failed/reversed. The existing
  -- transfer webhook supplies that evidence; no browser can invoke this RPC.
  ns := p_event_status;
  PERFORM set_config('app.transfer_server_update', 'on', true);

  UPDATE public.transfers
  SET status = ns,
      transfer_code = COALESCE(transfer_code, NULLIF(p_transfer_code, '')),
      raw_payload = COALESCE(p_payload, raw_payload)
  WHERE id = t.id;

  IF t.transfer_kind = 'purchase_funding' THEN
    SELECT * INTO f
    FROM public.purchase_funding
    WHERE id=t.purchase_funding_id
    FOR UPDATE;
    UPDATE public.purchase_funding
    SET status=CASE ns
                 WHEN 'success' THEN 'transferred'
                 WHEN 'reversed' THEN 'reversed'
                 ELSE 'failed'
               END,
        transferred_at=CASE WHEN ns='success' THEN COALESCE(transferred_at,now()) ELSE transferred_at END,
        failure_reason=CASE WHEN ns<>'success' THEN COALESCE(p_payload->>'message','Purchase funding transfer was not successful') ELSE failure_reason END,
        updated_at=now()
    WHERE id=t.purchase_funding_id;
    UPDATE public.orders
    SET purchase_funding_status=CASE ns
      WHEN 'success' THEN 'transferred'
      WHEN 'reversed' THEN 'reversed'
      ELSE 'failed'
    END
    WHERE id=f.order_id;
  ELSIF t.transfer_kind = 'customer_reimbursement' THEN
    SELECT * INTO c
    FROM public.cancellations
    WHERE id=t.cancellation_id
    FOR UPDATE;
    SELECT * INTO o
    FROM public.orders
    WHERE id=c.order_id
    FOR UPDATE;
    UPDATE public.cancellations
    SET stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END,
        reimbursement_transfer_id=CASE WHEN ns='success' THEN t.id ELSE reimbursement_transfer_id END,
        resolved_at=COALESCE(resolved_at,now()),
        updated_at=now()
    WHERE id=t.cancellation_id;
    UPDATE public.orders
    SET cancellation_stage=CASE ns WHEN 'success' THEN 'reimbursed' ELSE 'resolved' END
    WHERE id=c.order_id;
  ELSIF t.withdrawal_request_id IS NOT NULL THEN
    IF ns = 'success' THEN
      UPDATE public.withdrawal_requests
      SET status = 'paid', reviewed_at = COALESCE(reviewed_at, now())
      WHERE id = t.withdrawal_request_id
        AND status <> 'paid';
    ELSIF ns IN ('failed', 'reversed') THEN
      UPDATE public.withdrawal_requests
      SET status = 'rejected',
          reviewed_at = COALESCE(reviewed_at, now()),
          admin_note = COALESCE(admin_note, 'Paystack transfer ' || ns)
      WHERE id = t.withdrawal_request_id
        AND status <> 'paid'
        AND status <> 'rejected';
    END IF;
  ELSIF t.delivery_settlement_id IS NOT NULL THEN
    UPDATE public.delivery_settlements
    SET payout_status=ns
    WHERE id=t.delivery_settlement_id;
  END IF;

  RETURN ns;
END;
$func$;

REVOKE ALL ON FUNCTION public.apply_transfer_webhook_event(text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transfer_webhook_event(text, text, text, jsonb)
  TO service_role;
