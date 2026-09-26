-- Phase 6A: verified customer reimbursement recipient setup.

ALTER TABLE public.transfer_recipients
  ADD COLUMN IF NOT EXISTS recipient_status text NOT NULL DEFAULT 'verified'
    CHECK (recipient_status IN ('verification_in_progress','verified','inactive','needs_attention')),
  ADD COLUMN IF NOT EXISTS bank_code text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS account_number_last4 text,
  ADD COLUMN IF NOT EXISTS verification_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
DROP INDEX IF EXISTS uq_customer_transfer_recipient;
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_customer_transfer_recipient
  ON public.transfer_recipients(profile_id) WHERE payee_type='customer' AND recipient_status='verified';

DROP POLICY IF EXISTS customers_read_own_transfer_recipients ON public.transfer_recipients;
CREATE POLICY customers_read_own_transfer_recipients ON public.transfer_recipients
  FOR SELECT TO authenticated USING (payee_type='customer' AND profile_id=auth.uid());

DROP FUNCTION IF EXISTS public.create_transfer_recipient(text,text,uuid,text,text,text,text);
CREATE OR REPLACE FUNCTION public.create_transfer_recipient(
  p_payee_type text,p_vendor_id text,p_profile_id uuid,p_recipient_code text,
  p_paystack_customer_code text DEFAULT NULL,p_account_name text DEFAULT NULL,
  p_bank_name text DEFAULT NULL,p_bank_code text DEFAULT NULL,
  p_account_number_last4 text DEFAULT NULL,p_currency text DEFAULT 'NGN'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE existing public.transfer_recipients%ROWTYPE; new_id uuid;
BEGIN
  IF p_payee_type NOT IN ('vendor','rider','customer') OR NULLIF(trim(p_recipient_code),'') IS NULL THEN RAISE EXCEPTION 'invalid recipient'; END IF;
  IF p_payee_type='vendor' AND p_vendor_id IS NULL THEN RAISE EXCEPTION 'vendor recipient requires vendor'; END IF;
  IF p_payee_type IN ('rider','customer') AND p_profile_id IS NULL THEN RAISE EXCEPTION 'profile recipient requires profile'; END IF;
  IF p_payee_type='customer' THEN
    UPDATE public.transfer_recipients SET recipient_status='inactive',deactivated_at=now(),updated_at=now()
    WHERE payee_type='customer' AND profile_id=p_profile_id AND recipient_status='verified';
  ELSE
    SELECT * INTO existing FROM public.transfer_recipients WHERE (p_payee_type='vendor' AND payee_type='vendor' AND vendor_id=p_vendor_id) OR (p_payee_type='rider' AND payee_type='rider' AND profile_id=p_profile_id) LIMIT 1;
    IF FOUND THEN RETURN existing.id; END IF;
  END IF;
  INSERT INTO public.transfer_recipients(payee_type,vendor_id,profile_id,recipient_code,paystack_customer_code,account_name,bank_name,recipient_status,bank_code,currency,account_number_last4,verification_requested_at,verified_at,activated_at)
  VALUES(p_payee_type,p_vendor_id,p_profile_id,p_recipient_code,p_paystack_customer_code,p_account_name,p_bank_name,'verified',p_bank_code,COALESCE(p_currency,'NGN'),p_account_number_last4,now(),now(),now()) RETURNING id INTO new_id;
  RETURN new_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_transfer_recipient(text,text,uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer_recipient(text,text,uuid,text,text,text,text,text,text,text) TO service_role;
