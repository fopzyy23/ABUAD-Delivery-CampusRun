-- Phase 7B: authoritative rider earnings and balance semantics.

CREATE OR REPLACE FUNCTION public._calculate_rider_balance(p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE v_gross numeric; v_withdrawn numeric; v_reserved numeric;
BEGIN
  SELECT COALESCE(SUM(rider_amount),0) INTO v_gross FROM public.delivery_settlements
    WHERE rider_id=p_rider_id AND status <> 'reversed';
  SELECT COALESCE(SUM(w.amount),0) INTO v_withdrawn
    FROM public.withdrawal_requests w
    WHERE w.rider_id=p_rider_id AND w.status='paid'
      AND EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=w.id AND t.status='success');
  SELECT COALESCE(SUM(amount),0) INTO v_reserved FROM public.withdrawal_requests
    WHERE rider_id=p_rider_id AND status IN ('pending','approved');
  RETURN jsonb_build_object(
    'gross_earned',v_gross,'withdrawn_amount',v_withdrawn,
    'reserved_amount',v_reserved,
    'available_balance',GREATEST(v_gross-v_withdrawn-v_reserved,0));
END; $func$;
REVOKE ALL ON FUNCTION public._calculate_rider_balance(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._calculate_rider_balance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_rider_earnings(p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE b jsonb; p numeric; o jsonb; a jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.riders WHERE id=p_rider_id AND user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to view earnings for this rider';
  END IF;
  b:=public._calculate_rider_balance(p_rider_id);
  SELECT COALESCE(SUM(rider_amount),0) INTO p FROM public.delivery_settlements
    WHERE rider_id=p_rider_id AND status='pending';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id',order_id,'rider_amount',rider_amount)),'[]'::jsonb) INTO o
    FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status='pending';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id',order_id,'rider_amount',rider_amount,'status',status)),'[]'::jsonb) INTO a
    FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status <> 'reversed';
  RETURN b || jsonb_build_object('lifetime_earnings',(b->>'gross_earned')::numeric,
    'lifetime_available_balance',(b->>'available_balance')::numeric,'pending_earnings',p,
    'pending_withdrawals',(b->>'reserved_amount')::numeric,'orders',o,'all_orders',a);
END; $func$;
GRANT EXECUTE ON FUNCTION public.get_rider_earnings(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric,p_account_name text,p_account_number text,p_bank_name text,p_bank_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE r public.riders%ROWTYPE; b jsonb; v numeric; id bigint; an text; ac text; bn text; bc text;
BEGIN
  SELECT * INTO r FROM public.riders WHERE user_id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR r.status<>'approved' THEN RAISE EXCEPTION 'Only approved riders can request withdrawals'; END IF;
  IF p_amount IS NULL OR NOT (p_amount>0 AND p_amount<1000000) THEN RAISE EXCEPTION 'Amount must be a valid positive naira value'; END IF;
  an:=nullif(trim(coalesce(p_account_name,'')),''); ac:=regexp_replace(coalesce(p_account_number,''),'\s+','','g'); bn:=nullif(trim(coalesce(p_bank_name,'')),''); bc:=nullif(trim(coalesce(p_bank_code,'')),'');
  IF an IS NULL OR length(an)>120 THEN RAISE EXCEPTION 'Account name is required (max 120 characters)'; END IF;
  IF ac IS NULL OR ac !~ '^[0-9]{6,20}$' THEN RAISE EXCEPTION 'Account number must be 6-20 digits'; END IF;
  IF bc IS NULL OR bc !~ '^[A-Za-z0-9]{2,10}$' THEN RAISE EXCEPTION 'Invalid bank code'; END IF;
  IF bn IS NULL OR length(bn)>120 THEN RAISE EXCEPTION 'Bank name is required (max 120 characters)'; END IF;
  b:=public._calculate_rider_balance(r.id); v:=(b->>'available_balance')::numeric;
  IF p_amount>v THEN RAISE EXCEPTION 'Requested amount exceeds your available balance (available: %)',v; END IF;
  INSERT INTO public.withdrawal_requests(rider_id,amount,status,account_name,account_number,bank_name,bank_code)
    VALUES(r.id,p_amount,'pending',an,ac,bn,bc) RETURNING id INTO id;
  RETURN json_build_object('withdrawal_id',id,'amount',p_amount,'status','pending','available_balance',v-p_amount);
END; $func$;
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric,text,text,text,text) TO authenticated;
