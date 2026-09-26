CREATE OR REPLACE FUNCTION public.approve_withdrawal_for_payout(p_withdrawal_id bigint, p_admin_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE w public.withdrawal_requests%ROWTYPE; r public.transfer_recipients%ROWTYPE; t public.transfers%ROWTYPE; tid uuid;
BEGIN
  IF p_withdrawal_id IS NULL OR p_admin_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_admin_id AND role='admin') THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  SELECT * INTO w FROM public.withdrawal_requests WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal not found'; END IF;
  IF w.status='rejected' THEN RAISE EXCEPTION 'withdrawal is rejected'; END IF;
  SELECT * INTO t FROM public.transfers WHERE withdrawal_request_id=w.id AND status NOT IN ('failed','reversed') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
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
