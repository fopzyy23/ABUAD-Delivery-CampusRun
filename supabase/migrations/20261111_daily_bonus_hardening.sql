-- ============================================================
-- 20261111_daily_bonus_hardening.sql
-- Phase 8A.2 — daily bonus hardening (deliberately small)
-- ============================================================
-- FIX 1: orders.delivery_completed_at becomes server-managed.
--   * Clients (admin included) can neither choose the completion timestamp
--     nor change it once set.
--   * capture_delivery_completion_time() — the existing Delivered-transition
--     trigger — remains the authoritative setter, with byte-identical stamping
--     behaviour. It now also announces its own write with a transaction-local
--     GUC so the guard can tell "the trigger wrote it" from "a client sent it".
--   * No trigger is dropped, renamed or re-bound, and the Delivered status
--     transition rules are untouched.
--
-- FIX 2: get_rider_earnings().bonus_earned_today becomes reversal-aware by
--   reusing _calculate_rider_balance() — the existing server-side source that
--   already applies "a bonus whose qualifying settlement was reversed does not
--   count". Gross / withdrawn / reserved / available are computed exactly as
--   before. No bonus row is deleted; awarding is untouched (no duplicates).
--
-- NOT touched, deliberately: Edge Functions, Paystack / payment execution,
-- withdrawal execution, customer reimbursement, purchase funding, vendor
-- settlement, referral logic, and issues A2 / A3 / A4 / A7.
-- No schema change, no data change, no deploy.
-- ============================================================


-- ============================================================
-- FIX 1a — capture trigger: same stamp + authoritative-write latch
-- ============================================================
-- The value written here is unchanged from 20261110 (now(), first transition
-- into 'Delivered', only when still NULL). The latch is transaction-local
-- (set_config third argument = true) so it can never outlive this statement.
-- A trigger function cannot be invoked as an ordinary function, and PostgREST
-- clients cannot set GUCs, so no client can raise this flag.
CREATE OR REPLACE FUNCTION public.capture_delivery_completion_time()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.status = 'Delivered'
     AND OLD.status IS DISTINCT FROM 'Delivered'
     AND NEW.delivery_completed_at IS NULL THEN
    NEW.delivery_completed_at := now();
    PERFORM set_config('app.order_delivery_completion_stamped', 'on', true);
  END IF;
  RETURN NEW;
END; $func$;

-- No trigger re-bind: trg_capture_delivery_completion_time keeps pointing at
-- this function, so there is exactly one capture trigger (no duplicates).


-- ============================================================
-- FIX 1b — guard: delivery_completed_at added to the existing
-- server-managed block of prevent_order_unauthorized_changes()
-- ============================================================
-- This replaces the 20260907 body with the SAME body plus one guard; every
-- pre-existing guard (payment_status / payment_reference / transaction_id /
-- subtotal, user_id, order_number, admin-only total/fee/spot) is preserved
-- verbatim, as are SECURITY DEFINER and SET search_path = public.
CREATE OR REPLACE FUNCTION public.prevent_order_unauthorized_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 'on' ONLY when trusted server-side code (a SECURITY DEFINER
  -- payment/settlement/maintenance function) opted in for THIS
  -- transaction. Clients cannot set GUCs through PostgREST.
  v_server_update boolean :=
    COALESCE(current_setting('app.order_server_update', true), 'off') = 'on';
  -- Phase 8A.2: 'on' only while capture_delivery_completion_time() is
  -- stamping its own authoritative value inside THIS transaction. Raised by
  -- that trigger function only (it cannot be called as an RPC), and it is
  -- transaction-local, so clients can neither forge it nor reuse it later.
  v_completion_stamped boolean :=
    COALESCE(current_setting('app.order_delivery_completion_stamped', true), 'off') = 'on';
BEGIN
  -- ---- B1 (20260907): payment/financial columns are server-managed ----
  -- Blocked for every client role, admin included. Only server-side code
  -- that set app.order_server_update may change these.
  IF NOT v_server_update THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'payment_status is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.payment_reference IS DISTINCT FROM OLD.payment_reference THEN
      RAISE EXCEPTION 'payment_reference is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
      RAISE EXCEPTION 'transaction_id is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
      RAISE EXCEPTION 'subtotal is server-managed and cannot be changed by clients';
    END IF;

    -- ---- Phase 8A.2 FIX 1: delivery_completed_at is server-managed ----
    -- Blocked for every client role, admin included. The only writers are:
    --   (a) capture_delivery_completion_time(), on the first transition to
    --       Delivered (it announces itself with the latch above), and
    --   (b) trusted server-side code holding app.order_server_update='on'.
    -- A client that supplies the column is rejected — including on a
    -- Delivered transition, where the capture trigger would then have no
    -- stamp to make — so the timestamp can never be client-chosen. Updates
    -- that do not touch the column are unaffected, so existing order update
    -- permissions keep working normally.
    IF NOT v_completion_stamped
       AND NEW.delivery_completed_at IS DISTINCT FROM OLD.delivery_completed_at THEN
      RAISE EXCEPTION 'delivery_completed_at is server-managed and cannot be changed by clients';
    END IF;
  END IF;

  -- ---- Legacy guards (unchanged from 20260815) ----
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change order user_id';
  END IF;
  IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
    RAISE EXCEPTION 'Cannot change order_number';
  END IF;
  IF NOT public.is_admin() THEN
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'Cannot change order total';
    END IF;
    IF NEW.fee IS DISTINCT FROM OLD.fee THEN
      RAISE EXCEPTION 'Cannot change order fee';
    END IF;
    IF NEW.spot IS DISTINCT FROM OLD.spot THEN
      RAISE EXCEPTION 'Cannot change order spot';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- No trigger re-bind: trg_prevent_order_unauthorized_changes keeps its name,
-- BEFORE UPDATE timing and binding, so existing references still hold and
-- there is exactly one guard trigger.


-- ============================================================
-- FIX 2a — _calculate_rider_balance() reports a reversal-aware
-- bonus_earned_today from the query it already uses for gross
-- ============================================================
-- 8A.1 already made the gross bonus term skip bonuses whose qualifying
-- settlement was reversed. Today's slice is now produced by that SAME query
-- (same reversal rule, same Africa/Lagos calendar day) instead of a separate
-- non-reversal-aware sum. gross_earned / withdrawn_amount / reserved_amount /
-- available_balance keep their exact previous values; this only ADDS the
-- bonus_earned_today key (additive, same pattern as 20261022).
CREATE OR REPLACE FUNCTION public._calculate_rider_balance(p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE g numeric; w numeric; r numeric; b numeric; bon numeric; today numeric;
BEGIN
  SELECT COALESCE(SUM(rider_amount),0) INTO g FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status <> 'reversed';
  -- One query, one rule: bonuses with a non-reversed qualifying settlement.
  -- `bon` feeds gross (unchanged semantics); `today` is the dashboard slice.
  SELECT COALESCE(SUM(bn.amount),0),
         COALESCE(SUM(CASE WHEN bn.qualifying_date=(now() AT TIME ZONE 'Africa/Lagos')::date THEN bn.amount ELSE 0 END),0)
    INTO bon, today
    FROM public.rider_daily_bonuses bn
    JOIN public.delivery_settlements ds ON ds.id = bn.qualifying_settlement_id
   WHERE bn.rider_id = p_rider_id
     AND ds.status <> 'reversed';
  g := g + bon;
  SELECT COALESCE(SUM(wr.amount),0) INTO w FROM public.withdrawal_requests wr WHERE wr.rider_id=p_rider_id AND wr.status='paid' AND EXISTS (SELECT 1 FROM public.transfers t WHERE t.withdrawal_request_id=wr.id AND t.status='success');
  SELECT COALESCE(SUM(amount),0) INTO r FROM public.withdrawal_requests WHERE rider_id=p_rider_id AND status IN ('pending','approved');
  b:=GREATEST(g-w-r,0);
  RETURN jsonb_build_object('gross_earned',g,'withdrawn_amount',w,'reserved_amount',r,'available_balance',b,'bonus_earned_today',today);
END; $func$;


-- ============================================================
-- FIX 2b — get_rider_earnings() reads today's bonus from that source
-- ============================================================
-- Only the `today` line changes: it no longer sums rider_daily_bonuses
-- directly (which ignored reversals). Everything else — ownership check,
-- pending earnings, bonus_history, grants — is unchanged, and no other key
-- in the returned object moves. bonus_earned_today keeps the same name, so
-- the frontend (state.riderBalance.bonus_earned_today) needs no change.
CREATE OR REPLACE FUNCTION public.get_rider_earnings(p_rider_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
DECLARE b jsonb; p numeric; o jsonb; a jsonb; today numeric; hist jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.riders WHERE id=p_rider_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'Not authorized to view earnings for this rider'; END IF;
  b:=public._calculate_rider_balance(p_rider_id);
  SELECT COALESCE(SUM(rider_amount),0) INTO p FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status='pending';
  -- Phase 8A.2 FIX 2: reuse the balance source so today's figure applies the
  -- same reversal rule and the same Africa/Lagos calendar day as the bonus
  -- system itself, instead of re-summing raw rider_daily_bonuses rows.
  today := COALESCE((b->>'bonus_earned_today')::numeric,0);
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.qualifying_date DESC),'[]'::jsonb) INTO hist FROM (SELECT qualifying_date,amount,bonus_type,created_at FROM public.rider_daily_bonuses WHERE rider_id=p_rider_id ORDER BY qualifying_date DESC LIMIT 30) x;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id',order_id,'rider_amount',rider_amount)),'[]'::jsonb) INTO o FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status='pending';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('order_id',order_id,'rider_amount',rider_amount,'status',status)),'[]'::jsonb) INTO a FROM public.delivery_settlements WHERE rider_id=p_rider_id AND status <> 'reversed';
  RETURN b || jsonb_build_object('lifetime_earnings',(b->>'gross_earned')::numeric,'lifetime_available_balance',(b->>'available_balance')::numeric,'pending_earnings',p,'pending_withdrawals',(b->>'reserved_amount')::numeric,'bonus_earned_today',today,'bonus_history',hist,'orders',o,'all_orders',a);
END; $func$;
