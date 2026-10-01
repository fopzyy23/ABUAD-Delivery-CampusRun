-- 20270117: network/runtime remediation for the admin and rider workspaces.
-- This is a forward migration; previously applied migrations are unchanged.

CREATE OR REPLACE FUNCTION public.get_rider_details_for_orders(p_order_ids uuid[])
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  v_row record;
BEGIN
  IF p_order_ids IS NULL OR COALESCE(array_length(p_order_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;
  FOR v_order_id IN SELECT DISTINCT unnest(p_order_ids) LOOP
    -- Same privacy boundary as get_rider_details_for_order(): only the
    -- customer who owns this order can receive its approved rider details.
    SELECT o.id AS order_id, r.id AS rider_id, p.full_name, r.phone
      INTO v_row
      FROM public.orders o
      JOIN public.riders r ON r.id = o.rider_id AND r.status = 'approved'
      JOIN public.profiles p ON p.id = r.user_id
     WHERE o.id = v_order_id
       AND o.user_id = auth.uid()
       AND o.rider_id IS NOT NULL;
    IF FOUND THEN
      RETURN NEXT jsonb_build_object(
        'order_id', v_row.order_id,
        'rider_id', v_row.rider_id,
        'full_name', v_row.full_name,
        'phone', v_row.phone
      );
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_rider_details_for_orders(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rider_details_for_orders(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_rider_financial_summaries(p_rider_ids uuid[])
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rider_id uuid;
  v_balance jsonb;
  v_pending numeric;
  v_row record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin authorization required';
  END IF;
  PERFORM public.require_admin_aal2();
  IF p_rider_ids IS NULL OR COALESCE(array_length(p_rider_ids, 1), 0) = 0 THEN
    RETURN;
  END IF;
  FOR v_rider_id IN SELECT DISTINCT unnest(p_rider_ids) LOOP
    SELECT id INTO v_row FROM public.riders WHERE id = v_rider_id;
    IF NOT FOUND THEN CONTINUE; END IF;
    v_balance := public._calculate_rider_balance(v_rider_id);
    SELECT COALESCE(SUM(ds.rider_amount), 0)
      INTO v_pending
      FROM public.delivery_settlements ds
     WHERE ds.rider_id = v_rider_id AND ds.status = 'pending';
    RETURN NEXT v_balance || jsonb_build_object(
      'rider_id', v_rider_id,
      'pending_earnings', v_pending,
      'bonus_today', COALESCE(v_balance->'bonus_earned_today', '0'::jsonb)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_rider_financial_summaries(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_rider_financial_summaries(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_financial_resolution_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancellations jsonb;
  v_cutoff_claims jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin authorization required';
  END IF;
  PERFORM public.require_admin_aal2();
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_cancellations
    FROM public.cancellations c
   WHERE c.stage IN ('admin_resolution_required', 'reimbursement_failed');
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id, 'order_id', c.order_id, 'status', c.status,
      'reimbursement_amount', x.reimbursement_amount, 'last_error', c.last_error,
      'created_at', c.created_at, 'updated_at', c.updated_at
    ) ORDER BY c.created_at DESC), '[]'::jsonb)
    INTO v_cutoff_claims
    FROM public.automatic_cutoff_claims c
    LEFT JOIN public.cancellations x ON x.id = c.cancellation_id
   WHERE c.status IN ('admin_resolution_required', 'failed');
  RETURN jsonb_build_object('cancellations', v_cancellations, 'cutoff_claims', v_cutoff_claims);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_financial_resolution_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_financial_resolution_queue() TO authenticated;
