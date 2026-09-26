-- Phase 7A: delivery settlement failure and withdrawal transfer reconciliation.
-- Keeps the existing settlement/transfer architecture and makes state changes
-- authoritative and atomic.

-- A Delivered order must not commit if its mandatory settlement cannot be
-- created. Vendor recipient/transfer creation remains best-effort inside the
-- settlement engine; the delivery settlement row itself is mandatory.
CREATE OR REPLACE FUNCTION public.auto_settle_delivered_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF NEW.status = 'Delivered' AND NEW.payment_status = 'success'
     AND (OLD.status IS DISTINCT FROM 'Delivered' OR OLD.payment_status IS DISTINCT FROM 'success') THEN
    PERFORM public._settle_order_core(NEW.id);
  END IF;
  RETURN NEW;
END;
$func$;

-- Paid is system-controlled. Failed/reversed transfer reconciliation is
-- allowed through the transfer-server guard, while ordinary admin updates may
-- review/reject but cannot manufacture a successful payout.
CREATE OR REPLACE FUNCTION public.guard_withdrawal_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_server_update boolean := COALESCE(current_setting('app.transfer_server_update', true), 'off') = 'on';
  v_success_exists boolean;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'paid' THEN
    RAISE EXCEPTION 'paid withdrawal cannot transition to %', NEW.status;
  END IF;

  IF NEW.status = 'paid' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.transfers t
      WHERE t.withdrawal_request_id = NEW.id
        AND t.status = 'success'
    ) INTO v_success_exists;
    IF NOT v_server_update OR NOT v_success_exists THEN
      RAISE EXCEPTION 'withdrawal can be marked paid only after a successful transfer';
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_guard_withdrawal_state_transition ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_state_transition
BEFORE UPDATE OF status ON public.withdrawal_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_withdrawal_state_transition();

-- Reconciliation is part of the same transaction as the transfer webhook
-- update. Failed/reversed payouts release the withdrawal reservation by
-- moving it to the existing rejected terminal state. Unknown outcomes are
-- untouched and remain reserved.
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
