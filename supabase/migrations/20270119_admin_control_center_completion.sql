BEGIN;

-- Account lifecycle is independent of role/vendor/rider capabilities.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspension_reason text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check CHECK (account_status IN ('active','suspended'));

CREATE OR REPLACE FUNCTION public.is_account_active(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p_user_id IS NOT NULL AND COALESCE((SELECT account_status='active' FROM public.profiles WHERE id=p_user_id),false)
$$;
REVOKE ALL ON FUNCTION public.is_account_active(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO authenticated;

-- Suspension removes every admin capability without changing the account's
-- durable role, so restoring the account restores the same role safely.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id=auth.uid() AND role='admin' AND account_status='active'
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_set_admin_role(p_target_user_id uuid,p_make_admin boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.profiles%ROWTYPE; v_new public.profiles%ROWTYPE; v_admin_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required' USING ERRCODE='42501'; END IF;
  PERFORM public.require_admin_aal2();
  IF p_target_user_id IS NULL THEN RAISE EXCEPTION 'target user is required'; END IF;
  IF p_target_user_id=auth.uid() THEN RAISE EXCEPTION 'admins cannot change their own admin access'; END IF;
  SELECT * INTO v_old FROM public.profiles WHERE id=p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target profile not found'; END IF;
  IF p_make_admin AND v_old.account_status<>'active' THEN RAISE EXCEPTION 'a suspended account cannot be promoted'; END IF;
  IF p_make_admin AND v_old.role='admin' THEN RAISE EXCEPTION 'target is already an admin'; END IF;
  IF NOT p_make_admin AND v_old.role<>'admin' THEN RAISE EXCEPTION 'target is not an admin'; END IF;
  IF NOT p_make_admin THEN
    PERFORM id FROM public.profiles WHERE role='admin' ORDER BY id FOR UPDATE;
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role='admin';
    IF v_admin_count<=1 THEN RAISE EXCEPTION 'the final admin cannot be removed'; END IF;
  END IF;
  UPDATE public.profiles SET role=CASE WHEN p_make_admin THEN 'admin' ELSE 'user' END
    WHERE id=p_target_user_id RETURNING * INTO v_new;
  PERFORM public._admin_audit(CASE WHEN p_make_admin THEN 'promote_admin' ELSE 'demote_admin' END,
    'profile',p_target_user_id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_admin_role(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_admin_role(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_account_status(p_target_user_id uuid,p_status text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old public.profiles%ROWTYPE; v_new public.profiles%ROWTYPE; v_admin_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required' USING ERRCODE='42501'; END IF;
  PERFORM public.require_admin_aal2();
  IF p_target_user_id IS NULL OR p_status NOT IN ('active','suspended') THEN RAISE EXCEPTION 'invalid account status'; END IF;
  IF p_target_user_id=auth.uid() THEN RAISE EXCEPTION 'admins cannot change their own account status'; END IF;
  SELECT * INTO v_old FROM public.profiles WHERE id=p_target_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target profile not found'; END IF;
  IF v_old.account_status=p_status THEN RAISE EXCEPTION 'account already has requested status'; END IF;
  IF p_status='suspended' AND v_old.role='admin' THEN
    PERFORM id FROM public.profiles WHERE role='admin' AND account_status='active' ORDER BY id FOR UPDATE;
    SELECT count(*) INTO v_admin_count FROM public.profiles WHERE role='admin' AND account_status='active';
    IF v_admin_count<=1 THEN RAISE EXCEPTION 'the final active admin cannot be suspended'; END IF;
  END IF;
  UPDATE public.profiles SET account_status=p_status,
    suspended_at=CASE WHEN p_status='suspended' THEN now() ELSE NULL END,
    suspended_by=CASE WHEN p_status='suspended' THEN auth.uid() ELSE NULL END,
    suspension_reason=CASE WHEN p_status='suspended' THEN NULLIF(left(trim(COALESCE(p_reason,'')),500),'') ELSE NULL END
    WHERE id=p_target_user_id RETURNING * INTO v_new;
  PERFORM public._admin_audit(CASE WHEN p_status='suspended' THEN 'suspend_account' ELSE 'restore_account' END,
    'profile',p_target_user_id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_account_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_status(uuid,text,text) TO authenticated;

-- Central enforcement at critical mutation tables also covers SECURITY DEFINER
-- order/vendor/withdrawal RPCs and direct application paths while leaving
-- service workers (auth.uid NULL) intact.  Issue reports remain deliberately
-- available as the suspended account's support/appeal channel.
CREATE OR REPLACE FUNCTION public.reject_suspended_account_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_account_active(auth.uid()) THEN
    RAISE EXCEPTION 'account suspended' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.reject_suspended_account_mutation() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['orders','products','vendors','withdrawal_requests','riders','vendor_applications'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_reject_suspended_account_mutation ON public.%I',t);
    -- PostgreSQL executes same-kind triggers alphabetically.  The leading name
    -- makes the account boundary run before domain-specific validation triggers.
    EXECUTE format('DROP TRIGGER IF EXISTS aaa_reject_suspended_account_mutation ON public.%I',t);
    EXECUTE format('CREATE TRIGGER aaa_reject_suspended_account_mutation BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.reject_suspended_account_mutation()',t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  SELECT jsonb_build_object(
    'total_users',(SELECT count(*) FROM profiles),
    'active_accounts',(SELECT count(*) FROM profiles WHERE account_status='active'),
    'suspended_accounts',(SELECT count(*) FROM profiles WHERE account_status='suspended'),
    'total_vendors',(SELECT count(*) FROM vendors),
    'active_vendors',(SELECT count(*) FROM vendors WHERE open=true),
    'total_riders',(SELECT count(*) FROM riders),
    'approved_riders',(SELECT count(*) FROM riders WHERE status='approved'),
    'suspended_riders',(SELECT count(*) FROM riders WHERE status='suspended'),
    'pending_rider_applications',(SELECT count(*) FROM riders WHERE status='pending'),
    'total_orders',(SELECT count(*) FROM orders),
    'orders_today',(SELECT count(*) FROM orders WHERE created_at>=date_trunc('day',now())),
    'active_orders',(SELECT count(*) FROM orders WHERE status NOT IN ('Delivered','Rated','Cancelled')),
    'completed_orders',(SELECT count(*) FROM orders WHERE status IN ('Delivered','Rated')),
    'cancelled_orders',(SELECT count(*) FROM orders WHERE status='Cancelled'),
    'order_value',(SELECT COALESCE(sum(total),0) FROM orders),
    'successful_payment_count',(SELECT count(*) FROM payments WHERE status='success'),
    'successful_payment_volume',(SELECT COALESCE(sum(amount),0) FROM payments WHERE status='success'),
    'vendor_settlement_total',(SELECT COALESCE(sum(amount),0) FROM vendor_settlements WHERE status<>'reversed'),
    -- Gross accrued rider earnings: non-reversed delivery shares plus only
    -- bonuses whose qualifying delivery settlement is also non-reversed.
    'rider_earnings_total',(
      (SELECT COALESCE(sum(rider_amount),0) FROM delivery_settlements WHERE status<>'reversed') +
      (SELECT COALESCE(sum(bn.amount),0) FROM rider_daily_bonuses bn
        JOIN delivery_settlements ds ON ds.id=bn.qualifying_settlement_id
       WHERE ds.status<>'reversed')
    ),
    'platform_delivery_share',(SELECT COALESCE(sum(platform_amount),0) FROM delivery_settlements WHERE status<>'reversed'),
    'pending_withdrawals',(SELECT count(*) FROM withdrawal_requests WHERE status IN ('pending','approved')),
    'pending_transfers',(SELECT count(*) FROM transfers WHERE status IN ('pending','processing')),
    'failed_transfers',(SELECT count(*) FROM transfers WHERE status IN ('failed','reversed')),
    'pending_refunds',(SELECT count(*) FROM refunds WHERE status IN ('requested','approved','processing')),
    'failed_reimbursements',(SELECT count(*) FROM cancellations WHERE stage IN ('reimbursement_failed','admin_resolution_required')),
    'open_reports',(SELECT count(*) FROM issue_reports WHERE status IN ('Open','In Review')),
    'average_rider_rating',(SELECT COALESCE(avg(rating),0) FROM rider_ratings)
  ) INTO result;
  RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.admin_get_dashboard_metrics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_metrics() TO authenticated;

-- The Financial Resolution screen consumes this one server-authoritative
-- queue.  Each branch mirrors an existing exception category without changing
-- any provider or ledger state.
CREATE OR REPLACE FUNCTION public.admin_get_financial_resolution_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_cancellations jsonb; v_cutoff_claims jsonb; v_transfers jsonb;
        v_payment_mismatches jsonb; v_withdrawals jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC),'[]'::jsonb) INTO v_cancellations
    FROM public.cancellations c WHERE c.stage IN ('admin_resolution_required','reimbursement_failed');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'order_id',c.order_id,'status',c.status,
      'reimbursement_amount',x.reimbursement_amount,'last_error',c.last_error,'created_at',c.created_at,'updated_at',c.updated_at)
      ORDER BY c.created_at DESC),'[]'::jsonb) INTO v_cutoff_claims
    FROM public.automatic_cutoff_claims c LEFT JOIN public.cancellations x ON x.id=c.cancellation_id
   WHERE c.status IN ('admin_resolution_required','failed');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'status',t.status,'created_at',t.created_at)
      ORDER BY t.created_at DESC),'[]'::jsonb) INTO v_transfers
    FROM public.transfers t WHERE t.status IN ('failed','reversed');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'order_id',p.order_id,'payment_type',p.payment_type,
      'status',p.status,'created_at',p.created_at) ORDER BY p.created_at DESC),'[]'::jsonb) INTO v_payment_mismatches
    FROM public.payments p JOIN public.orders o ON o.id=p.order_id
   WHERE p.status='success' AND ((p.payment_type='product' AND o.payment_status<>'success')
      OR (p.payment_type='vendor_delivery' AND o.delivery_payment_status<>'success'));
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',w.id,'status',w.status,'created_at',w.requested_at)
      ORDER BY w.requested_at DESC),'[]'::jsonb) INTO v_withdrawals
    FROM public.withdrawal_requests w
   WHERE w.status IN ('approved','paid')
     AND NOT EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=w.id);
  RETURN jsonb_build_object('cancellations',v_cancellations,'cutoff_claims',v_cutoff_claims,
    'transfers',v_transfers,'payment_mismatches',v_payment_mismatches,'withdrawals',v_withdrawals);
END; $$;
REVOKE ALL ON FUNCTION public.admin_get_financial_resolution_queue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_financial_resolution_queue() TO authenticated;

COMMIT;
