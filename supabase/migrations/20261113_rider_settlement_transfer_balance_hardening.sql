-- Phase 7A: include settlement-linked rider transfers in balance accounting.
-- Settlement transfer rows are identified by delivery_settlement_id, not
-- transfer_kind, because withdrawal transfers may retain the settlement
-- default kind while carrying withdrawal_request_id.

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
