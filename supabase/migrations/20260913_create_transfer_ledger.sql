-- ============================================================
-- 20260913_create_transfer_ledger.sql
-- B6 - Paystack transfer (payout) INFRASTRUCTURE ONLY
-- ============================================================
-- Creates the payout ledger that FUTURE Paystack transfers will be
-- recorded in, linked 1:1 to the existing settlement records.
--
-- THIS MIGRATION DOES NOT INITIATE ANY TRANSFER:
--   * No Paystack /transfer API call exists anywhere in this repo.
--   * Settlement calculations are UNCHANGED:
--       vendor  = own product-line revenue (vendor_settlements.amount)
--       rider   = 80% of delivery fee = N800 (delivery_settlements.rider_amount)
--       Dropzyy = 20% of delivery fee = N200 (delivery_settlements.platform_amount)
--   * vendor_self orders have no rider settlement, therefore no rider
--     payout can ever reference them.
--
-- Depends on:
--   20260910_create_settlement_ledger.sql (B4B)
--   20260909_create_payments_ledger.sql   (B4A)
-- ============================================================

-- 1. transfer_recipients (Paystack recipient codes, one per payee)
CREATE TABLE IF NOT EXISTS public.transfer_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payee_type text NOT NULL CHECK (payee_type IN ('vendor','rider')),
  vendor_id text REFERENCES public.vendors(id),
  profile_id uuid REFERENCES public.profiles(id),
  recipient_code text NOT NULL UNIQUE,
  paystack_customer_code text,
  account_name text,
  bank_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfer_recipients_payee_shape_check CHECK (
    (payee_type = 'vendor' AND vendor_id IS NOT NULL AND profile_id IS NULL)
    OR
    (payee_type = 'rider' AND profile_id IS NOT NULL AND vendor_id IS NULL)
  )
);

-- One recipient record per payee (NULLs break plain UNIQUE, so use
-- partial unique indexes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_recipient_vendor
  ON public.transfer_recipients (vendor_id) WHERE payee_type = 'vendor';
CREATE UNIQUE INDEX IF NOT EXISTS uq_transfer_recipient_rider
  ON public.transfer_recipients (profile_id) WHERE payee_type = 'rider';

-- 2. transfers (payout ledger, 1:1 with settlement rows)
CREATE TABLE IF NOT EXISTS public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_settlement_id uuid UNIQUE REFERENCES public.vendor_settlements(id),
  delivery_settlement_id uuid UNIQUE REFERENCES public.delivery_settlements(id),
  payee_type text NOT NULL CHECK (payee_type IN ('vendor','rider')),
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','success','failed','reversed')),
  paystack_reference text NOT NULL UNIQUE,
  recipient_code text NOT NULL,
  transfer_code text UNIQUE,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transfers_one_settlement_check CHECK (
    (vendor_settlement_id IS NOT NULL AND delivery_settlement_id IS NULL)
    OR
    (delivery_settlement_id IS NOT NULL AND vendor_settlement_id IS NULL)
  )
);
-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_transfers_vendor_settlement_id ON public.transfers (vendor_settlement_id);
CREATE INDEX IF NOT EXISTS idx_transfers_delivery_settlement_id ON public.transfers (delivery_settlement_id);
CREATE INDEX IF NOT EXISTS idx_transfers_payee_type ON public.transfers (payee_type);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON public.transfers (status);
CREATE INDEX IF NOT EXISTS idx_transfer_recipients_payee_type ON public.transfer_recipients (payee_type);

-- 4. updated_at triggers
CREATE OR REPLACE FUNCTION public.set_transfer_ledger_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_transfer_recipients_updated_at ON public.transfer_recipients;
CREATE TRIGGER trg_transfer_recipients_updated_at
  BEFORE UPDATE ON public.transfer_recipients FOR EACH ROW
  EXECUTE FUNCTION public.set_transfer_ledger_updated_at();

DROP TRIGGER IF EXISTS trg_transfers_updated_at ON public.transfers;
CREATE TRIGGER trg_transfers_updated_at
  BEFORE UPDATE ON public.transfers FOR EACH ROW
  EXECUTE FUNCTION public.set_transfer_ledger_updated_at();

-- 5. Transfer immutability guard (mirrors the B1 GUC pattern)
-- Money movement records are server-managed: NO client role may change
-- the identity columns (amount, references, recipient, settlement link)
-- or flip the status. Only trusted server-side code that announces
-- itself with the transaction-local GUC app.transfer_server_update may
-- mutate status/transfer_code/raw_payload (e.g. the future transfer
-- webhook / verification function). PostgREST clients cannot set GUCs.
CREATE OR REPLACE FUNCTION public.prevent_transfer_unauthorized_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_server_update boolean :=
    COALESCE(current_setting('app.transfer_server_update', true), 'off') = 'on';
BEGIN
  -- Identity columns are immutable for everyone (server code included).
  IF NEW.vendor_settlement_id IS DISTINCT FROM OLD.vendor_settlement_id
     OR NEW.delivery_settlement_id IS DISTINCT FROM OLD.delivery_settlement_id
     OR NEW.payee_type IS DISTINCT FROM OLD.payee_type
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.paystack_reference IS DISTINCT FROM OLD.paystack_reference
     OR NEW.recipient_code IS DISTINCT FROM OLD.recipient_code THEN
    RAISE EXCEPTION 'transfer identity columns are immutable';
  END IF;

  -- State columns change only via trusted server-side code.
  IF NOT v_server_update THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'transfer status is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.transfer_code IS DISTINCT FROM OLD.transfer_code THEN
      RAISE EXCEPTION 'transfer_code is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.raw_payload IS DISTINCT FROM OLD.raw_payload THEN
      RAISE EXCEPTION 'transfer raw_payload is server-managed and cannot be changed by clients';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_transfer_unauthorized_changes ON public.transfers;
CREATE TRIGGER trg_prevent_transfer_unauthorized_changes
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_transfer_unauthorized_changes();
-- 6. RLS on transfer_recipients
--    Vendors read their own recipient record; riders read their own;
--    admins read all. NO client INSERT/UPDATE/DELETE (recipient creation
--    is a server-side operation that will call the Paystack API).
ALTER TABLE public.transfer_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendors_read_own_transfer_recipient" ON public.transfer_recipients
  FOR SELECT TO authenticated
  USING (
    payee_type = 'vendor'
    AND vendor_id = (SELECT p.vendor_id FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY "riders_read_own_transfer_recipient" ON public.transfer_recipients
  FOR SELECT TO authenticated
  USING (
    payee_type = 'rider'
    AND profile_id = auth.uid()
  );

CREATE POLICY "admins_read_all_transfer_recipients" ON public.transfer_recipients
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "no_client_insert_transfer_recipients" ON public.transfer_recipients
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_client_update_transfer_recipients" ON public.transfer_recipients
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_client_delete_transfer_recipients" ON public.transfer_recipients
  FOR DELETE TO authenticated USING (false);

-- 7. RLS on transfers
--    A vendor reads transfers linked to settlements on their own
--    order_items; a rider reads transfers linked to their own delivery
--    settlement; admin reads all. NO client INSERT/UPDATE/DELETE.
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vendors_read_own_transfers" ON public.transfers
  FOR SELECT TO authenticated
  USING (
    payee_type = 'vendor'
    AND vendor_settlement_id IN (
      SELECT vs.id FROM public.vendor_settlements vs
      WHERE vs.vendor_id = (SELECT p.vendor_id FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

CREATE POLICY "riders_read_own_transfers" ON public.transfers
  FOR SELECT TO authenticated
  USING (
    payee_type = 'rider'
    AND delivery_settlement_id IN (
      SELECT ds.id FROM public.delivery_settlements ds
      WHERE ds.rider_id = auth.uid()
    )
  );

CREATE POLICY "admins_read_all_transfers" ON public.transfers
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "no_client_insert_transfers" ON public.transfers
  FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "no_client_update_transfers" ON public.transfers
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "no_client_delete_transfers" ON public.transfers
  FOR DELETE TO authenticated USING (false);
-- 8. Secure server-side RPCs (B6 infrastructure)
--    Both are SECURITY DEFINER but EXECUTE is revoked from every client
--    role: only the service-role key (Edge Functions / trusted server
--    code) can call them. PostgREST callers get "permission denied".

-- 8a. Record a Paystack transfer recipient (idempotent per payee).
--     Called by the paystack-transfer-recipient Edge Function AFTER the
--     Paystack /transferrecipient API call succeeds. The payee identity
--     is supplied by trusted server code (derived from the authenticated
--     user's JWT), never from an unauthenticated browser payload.
CREATE OR REPLACE FUNCTION public.create_transfer_recipient(
  p_payee_type text,
  p_vendor_id text,
  p_profile_id uuid,
  p_recipient_code text,
  p_paystack_customer_code text DEFAULT NULL,
  p_account_name text DEFAULT NULL,
  p_bank_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.transfer_recipients%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF p_payee_type NOT IN ('vendor','rider') THEN
    RAISE EXCEPTION 'invalid payee_type %', p_payee_type;
  END IF;
  IF p_payee_type = 'vendor' AND p_vendor_id IS NULL THEN
    RAISE EXCEPTION 'vendor recipient requires vendor_id';
  END IF;
  IF p_payee_type = 'rider' AND p_profile_id IS NULL THEN
    RAISE EXCEPTION 'rider recipient requires profile_id';
  END IF;
  IF p_recipient_code IS NULL OR p_recipient_code = '' THEN
    RAISE EXCEPTION 'recipient_code is required';
  END IF;

  -- Idempotency: one recipient record per payee (partial unique indexes
  -- back this up at the schema level).
  IF p_payee_type = 'vendor' THEN
    SELECT * INTO v_existing FROM public.transfer_recipients
    WHERE payee_type = 'vendor' AND vendor_id = p_vendor_id;
  ELSE
    SELECT * INTO v_existing FROM public.transfer_recipients
    WHERE payee_type = 'rider' AND profile_id = p_profile_id;
  END IF;

  IF FOUND THEN
    -- Keep the FIRST recipient code (RCMP-issued codes are stable); only
    -- refresh descriptive metadata. Never create a second row.
    UPDATE public.transfer_recipients
    SET paystack_customer_code = COALESCE(p_paystack_customer_code, paystack_customer_code),
        account_name = COALESCE(p_account_name, account_name),
        bank_name = COALESCE(p_bank_name, bank_name)
    WHERE id = v_existing.id;
    RETURN v_existing.id;
  END IF;

  INSERT INTO public.transfer_recipients (
    payee_type, vendor_id, profile_id, recipient_code,
    paystack_customer_code, account_name, bank_name
  ) VALUES (
    p_payee_type, p_vendor_id, p_profile_id, p_recipient_code,
    p_paystack_customer_code, p_account_name, p_bank_name
  ) RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$$;
-- 8b. Create a PENDING transfer record for an eligible settlement
--     (infrastructure scaffold ONLY - initiates nothing).
--     * Amount is derived from the AUTHORITATIVE settlement row, never
--       from a caller argument: vendor = vendor_settlements.amount
--       (product revenue); rider = delivery_settlements.rider_amount
--       (80% of the delivery fee = N800 on the current N1,000 fee).
--     * vendor_self / unassigned-rider orders have rider_id NULL and are
--       rejected - no rider payout can ever exist for them.
--     * Idempotent: the UNIQUE columns on vendor_settlement_id /
--       delivery_settlement_id guarantee one transfer per settlement;
--       a repeat call returns the existing record instead of duplicating.
--     * Does NOT call Paystack and does NOT mark anything settled.
CREATE OR REPLACE FUNCTION public.create_pending_transfer(
  p_vendor_settlement_id uuid DEFAULT NULL,
  p_delivery_settlement_id uuid DEFAULT NULL,
  p_paystack_reference text DEFAULT NULL,
  p_recipient_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor_vs public.vendor_settlements%ROWTYPE;
  v_ds public.delivery_settlements%ROWTYPE;
  v_recipient public.transfer_recipients%ROWTYPE;
  v_existing public.transfers%ROWTYPE;
  v_payee_type text;
  v_amount numeric;
  v_transfer_id uuid;
BEGIN
  IF (p_vendor_settlement_id IS NULL) = (p_delivery_settlement_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one of vendor_settlement_id / delivery_settlement_id is required';
  END IF;
  IF p_paystack_reference IS NULL OR p_paystack_reference = '' THEN
    RAISE EXCEPTION 'paystack_reference is required';
  END IF;

  IF p_vendor_settlement_id IS NOT NULL THEN
    SELECT * INTO v_vendor_vs FROM public.vendor_settlements
    WHERE id = p_vendor_settlement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'vendor settlement % not found', p_vendor_settlement_id; END IF;
    IF v_vendor_vs.status != 'pending' THEN
      RAISE EXCEPTION 'vendor settlement % is % - not payout-eligible', p_vendor_settlement_id, v_vendor_vs.status;
    END IF;
    v_payee_type := 'vendor';
    v_amount := v_vendor_vs.amount;

    -- Recipient must belong to the settlement's own vendor.
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'vendor' AND vendor_id = v_vendor_vs.vendor_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no transfer recipient registered for vendor %', v_vendor_vs.vendor_id;
    END IF;
    IF p_recipient_code != v_recipient.recipient_code THEN
      RAISE EXCEPTION 'recipient_code does not match the registered vendor recipient';
    END IF;
  ELSE
    SELECT * INTO v_ds FROM public.delivery_settlements
    WHERE id = p_delivery_settlement_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'delivery settlement % not found', p_delivery_settlement_id; END IF;
    IF v_ds.status != 'pending' THEN
      RAISE EXCEPTION 'delivery settlement % is % - not payout-eligible', p_delivery_settlement_id, v_ds.status;
    END IF;
    -- vendor_self / unassigned-rider orders have rider_id NULL.
    IF v_ds.rider_id IS NULL THEN
      RAISE EXCEPTION 'delivery settlement % has no rider (vendor_self or unassigned) - no rider payout', p_delivery_settlement_id;
    END IF;
    v_payee_type := 'rider';
    v_amount := v_ds.rider_amount;

    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'rider' AND profile_id = v_ds.rider_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no transfer recipient registered for rider %', v_ds.rider_id;
    END IF;
    IF p_recipient_code != v_recipient.recipient_code THEN
      RAISE EXCEPTION 'recipient_code does not match the registered rider recipient';
    END IF;
  END IF;

  -- Idempotency: return the existing transfer for this settlement.
  IF p_vendor_settlement_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.transfers WHERE vendor_settlement_id = p_vendor_settlement_id;
  ELSE
    SELECT * INTO v_existing FROM public.transfers WHERE delivery_settlement_id = p_delivery_settlement_id;
  END IF;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'transfer_id', v_existing.id,
      'reference', v_existing.paystack_reference,
      'status', v_existing.status,
      'already_exists', true
    );
  END IF;

  INSERT INTO public.transfers (
    vendor_settlement_id, delivery_settlement_id, payee_type,
    amount, currency, status, paystack_reference, recipient_code
  ) VALUES (
    p_vendor_settlement_id, p_delivery_settlement_id, v_payee_type,
    v_amount, 'NGN', 'pending', p_paystack_reference, p_recipient_code
  ) RETURNING id INTO v_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', v_transfer_id,
    'reference', p_paystack_reference,
    'status', 'pending',
    'already_exists', false
  );
END;
$$;

-- 9. EXECUTE lockdown: these RPCs are server-only.
REVOKE EXECUTE ON FUNCTION public.create_transfer_recipient(text, text, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_pending_transfer(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_transfer_recipient(text, text, uuid, text, text, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_pending_transfer(uuid, uuid, text, text)
  TO service_role;
-- 10. Table privilege lockdown (read-only for clients)
REVOKE ALL ON public.transfer_recipients FROM anon, authenticated;
REVOKE ALL ON public.transfers FROM anon, authenticated;
GRANT SELECT ON public.transfer_recipients TO authenticated;
GRANT SELECT ON public.transfers TO authenticated;

-- ============================================================
-- SUMMARY (B6 - infrastructure only, NO transfers initiated)
-- ============================================================
-- * transfer_recipients  : Paystack recipient codes per vendor/rider,
--                          one row per payee (partial unique indexes).
-- * transfers            : payout ledger, 1:1 with settlement rows
--                          (UNIQUE settlement FKs), status pending /
--                          processing / success / failed / reversed.
-- * Immutability trigger : identity columns immutable for EVERYONE;
--                          status / transfer_code / raw_payload change
--                          only via the app.transfer_server_update GUC
--                          (same pattern as the B1 order guard).
-- * RLS                  : vendor sees own payouts, rider sees own
--                          payouts, admin sees all; zero client writes.
-- * RPCs                 : create_transfer_recipient +
--                          create_pending_transfer, SECURITY DEFINER,
--                          EXECUTE revoked from PUBLIC/anon/authenticated
--                          and granted to service_role only.
-- * NOT DONE HERE        : no Paystack /transfer call, no transfer
--                          webhook, no settlement status changes, no
--                          withdrawal integration - future work.
-- ============================================================