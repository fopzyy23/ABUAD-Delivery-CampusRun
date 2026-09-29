-- 20261224_recipient_rotation.sql
-- Rotate verified Paystack recipients without rewriting transfer history.

ALTER TABLE public.transfer_recipients
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS account_fingerprint text;

DROP INDEX IF EXISTS uq_transfer_recipient_vendor;
DROP INDEX IF EXISTS uq_transfer_recipient_rider;
DROP INDEX IF EXISTS uq_active_customer_transfer_recipient;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_transfer_recipient_owner
  ON public.transfer_recipients (payee_type, COALESCE(vendor_id, profile_id::text))
  WHERE is_active = true AND recipient_status = 'verified';

DROP FUNCTION IF EXISTS public.create_transfer_recipient(text,text,uuid,text,text,text,text,text,text,text);
CREATE OR REPLACE FUNCTION public.create_transfer_recipient(
  p_payee_type text, p_vendor_id text, p_profile_id uuid, p_recipient_code text,
  p_paystack_customer_code text DEFAULT NULL, p_account_name text DEFAULT NULL,
  p_bank_name text DEFAULT NULL, p_bank_code text DEFAULT NULL,
  p_account_number_last4 text DEFAULT NULL, p_currency text DEFAULT 'NGN',
  p_account_fingerprint text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.transfer_recipients%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF p_payee_type NOT IN ('vendor','rider','customer')
     OR NULLIF(trim(p_recipient_code),'') IS NULL THEN
    RAISE EXCEPTION 'invalid recipient';
  END IF;
  IF p_payee_type = 'vendor' AND p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'vendor recipient requires vendor';
  END IF;
  IF p_payee_type IN ('rider','customer') AND p_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile recipient requires profile';
  END IF;

  SELECT * INTO v_existing
    FROM public.transfer_recipients
   WHERE payee_type = p_payee_type
     AND ((p_payee_type = 'vendor' AND vendor_id = p_vendor_id)
       OR (p_payee_type IN ('rider','customer') AND profile_id = p_profile_id))
     AND is_active = true AND recipient_status = 'verified'
   ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;

  -- A retry for the same verified account is idempotent. A different account
  -- gets a new Paystack code; the previous row remains immutable history.
  IF FOUND AND p_account_fingerprint IS NOT NULL
     AND v_existing.account_fingerprint = p_account_fingerprint THEN
    RETURN v_existing.id;
  END IF;

  IF FOUND THEN
    UPDATE public.transfer_recipients
       SET is_active = false, recipient_status = 'inactive',
           deactivated_at = now(), updated_at = now()
     WHERE id = v_existing.id;
  END IF;

  INSERT INTO public.transfer_recipients
    (payee_type,vendor_id,profile_id,recipient_code,paystack_customer_code,
     account_name,bank_name,recipient_status,bank_code,currency,
     account_number_last4,verification_requested_at,verified_at,activated_at,
     is_active,account_fingerprint)
  VALUES
    (p_payee_type,p_vendor_id,p_profile_id,p_recipient_code,p_paystack_customer_code,
     p_account_name,p_bank_name,'verified',p_bank_code,COALESCE(p_currency,'NGN'),
     p_account_number_last4,now(),now(),now(),true,p_account_fingerprint)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_transfer_recipient(text,text,uuid,text,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer_recipient(text,text,uuid,text,text,text,text,text,text,text,text)
  TO service_role;

-- Every new transfer must snapshot the active verified recipient. Existing
-- transfers retain their immutable recipient_code.
CREATE OR REPLACE FUNCTION public.create_pending_customer_reimbursement_transfer(p_cancellation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cancellations%ROWTYPE; o public.orders%ROWTYPE; r public.transfer_recipients%ROWTYPE; f public.purchase_funding%ROWTYPE; t uuid;
BEGIN
  SELECT * INTO c FROM public.cancellations WHERE id=p_cancellation_id FOR UPDATE;
  IF NOT FOUND OR c.stage NOT IN ('eligible_for_reimbursement','reimbursement_pending') THEN RAISE EXCEPTION 'cancellation is not eligible for reimbursement'; END IF;
  SELECT * INTO o FROM public.orders WHERE id=c.order_id FOR UPDATE;
  SELECT * INTO f FROM public.purchase_funding WHERE order_id=o.id FOR UPDATE;
  IF FOUND AND f.status IN ('transferred','processing') THEN RAISE EXCEPTION 'purchase funding is transferred or unresolved'; END IF;
  IF c.reimbursement_amount IS NULL OR c.reimbursement_amount<=0 THEN RAISE EXCEPTION 'no authoritative reimbursement amount'; END IF;
  SELECT * INTO r FROM public.transfer_recipients WHERE payee_type='customer' AND profile_id=o.user_id AND is_active=true AND recipient_status='verified' ORDER BY updated_at DESC LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN
    UPDATE public.cancellations SET stage='admin_resolution_required',updated_at=now(),reimbursement_failure_reason='No verified customer transfer recipient' WHERE id=c.id;
    UPDATE public.orders SET cancellation_stage='admin_resolution_required' WHERE id=o.id;
    RETURN NULL;
  END IF;
  SELECT id INTO t FROM public.transfers WHERE cancellation_id=c.id FOR UPDATE;
  IF FOUND THEN RETURN t; END IF;
  INSERT INTO public.transfers(transfer_kind,cancellation_id,payee_type,amount,currency,status,paystack_reference,recipient_code)
  VALUES('customer_reimbursement',c.id,'customer',c.reimbursement_amount,'NGN','pending','dropzyy-reimbursement-'||c.id::text,r.recipient_code) RETURNING id INTO t;
  UPDATE public.cancellations SET stage='reimbursement_pending',updated_at=now() WHERE id=c.id;
  UPDATE public.orders SET cancellation_stage='reimbursement_pending' WHERE id=o.id;
  RETURN t;
END; $$;
REVOKE ALL ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_customer_reimbursement_transfer(uuid) TO service_role;

-- Defense in depth for every transfer-producing RPC, including older RPC
-- bodies that predate recipient rotation: resolve the payee's current active
-- recipient at insert time. The transfer row keeps this resolved code as its
-- immutable snapshot.
CREATE OR REPLACE FUNCTION public.resolve_active_transfer_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NEW.payee_type = 'vendor' AND NEW.vendor_settlement_id IS NOT NULL THEN
    SELECT r.recipient_code INTO v_code
      FROM public.vendor_settlements s
      JOIN public.transfer_recipients r ON r.payee_type='vendor' AND r.vendor_id=s.vendor_id
     WHERE s.id=NEW.vendor_settlement_id AND r.is_active=true AND r.recipient_status='verified'
     ORDER BY r.updated_at DESC LIMIT 1;
  ELSIF NEW.payee_type = 'rider' AND NEW.delivery_settlement_id IS NOT NULL THEN
    SELECT r.recipient_code INTO v_code
      FROM public.delivery_settlements s
      JOIN public.riders rd ON rd.id=s.rider_id
      JOIN public.transfer_recipients r ON r.payee_type='rider' AND r.profile_id=rd.user_id
     WHERE s.id=NEW.delivery_settlement_id AND r.is_active=true AND r.recipient_status='verified'
     ORDER BY r.updated_at DESC LIMIT 1;
  ELSIF NEW.payee_type = 'rider' AND NEW.withdrawal_request_id IS NOT NULL THEN
    SELECT r.recipient_code INTO v_code
      FROM public.withdrawal_requests w
      JOIN public.riders rd ON rd.id=w.rider_id
      JOIN public.transfer_recipients r ON r.payee_type='rider' AND r.profile_id=rd.user_id
     WHERE w.id=NEW.withdrawal_request_id AND r.is_active=true AND r.recipient_status='verified'
     ORDER BY r.updated_at DESC LIMIT 1;
  ELSIF NEW.payee_type = 'rider' AND NEW.purchase_funding_id IS NOT NULL THEN
    SELECT r.recipient_code INTO v_code
      FROM public.purchase_funding f
      JOIN public.riders rd ON rd.id=f.rider_id
      JOIN public.transfer_recipients r ON r.payee_type='rider' AND r.profile_id=rd.user_id
     WHERE f.id=NEW.purchase_funding_id AND r.is_active=true AND r.recipient_status='verified'
     ORDER BY r.updated_at DESC LIMIT 1;
  ELSIF NEW.payee_type = 'customer' AND NEW.cancellation_id IS NOT NULL THEN
    SELECT r.recipient_code INTO v_code
      FROM public.cancellations c
      JOIN public.orders o ON o.id=c.order_id
      JOIN public.transfer_recipients r ON r.payee_type='customer' AND r.profile_id=o.user_id
     WHERE c.id=NEW.cancellation_id AND r.is_active=true AND r.recipient_status='verified'
     ORDER BY r.updated_at DESC LIMIT 1;
  END IF;
  IF v_code IS NULL THEN RAISE EXCEPTION 'no active verified transfer recipient'; END IF;
  NEW.recipient_code := v_code;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_resolve_active_transfer_recipient ON public.transfers;
CREATE TRIGGER trg_resolve_active_transfer_recipient BEFORE INSERT ON public.transfers FOR EACH ROW EXECUTE FUNCTION public.resolve_active_transfer_recipient();
