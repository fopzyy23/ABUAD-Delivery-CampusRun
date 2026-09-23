-- ============================================================
-- ACTION 10 extension: bank details for rider withdrawal requests
-- ============================================================
-- Extends 20261022_rider_earnings_foundation.sql ADDITIVELY.
--
-- WHY: A pending withdrawal request is now a structured payout record: it
-- must carry the rider's payout bank details (account_name, account_number,
-- bank_name, bank_code) so an admin can action it manually outside the app,
-- AND so the paystack-transfer-recipient Edge Function has the data it needs
-- to register (or look up) the rider's Paystack transfer recipient when the
-- rider submits — without the recipient function ever trusting a client for
-- the payee identity (it derives rider identity from the JWT via
-- riders.user_id).
--
-- IMPORTANT: the withdrawal itself remains RECORD-ONLY (status pending ->
-- approved/rejected/paid via the existing admin workflow). No Paystack
-- TRANSFER is initiated here — that is the B7 paystack-transfer flow, gated
-- behind admin approval of a transfer row elsewhere. See BASELINE.md §1b/§6.6
-- and the Action 10 note in DOCUMENTATION.md.
--
-- SECURITY:
--   * Columns are added with IF NOT EXISTS so this migration is re-runnable.
--   * request_withdrawal is rebuilt to REQUIRE all four bank fields — it
--     validates them server-side (regex + length), mirroring the validation
--     the paystack-transfer-recipient Edge Function performs (index.ts:133):
--       account_number ~ ^[0-9]{6,20}$
--       bank_code      ~ ^[A-Za-z0-9]{2,10}$
--       account_name   1..120 chars
--       bank_name      1..120 chars
--     A direct INSERT can't reach this path (20261005 revoked INSERT from
--     authenticated + dropped the insert policy); the RPC (SECURITY DEFINER)
--     is the only creation path, and it is the only place the new columns are
--     populated on creation.
--   * The old single-argument signature is DROPPED so a stale client cannot
--     create a bank-less withdrawal: the only callable signature now requires
--     bank details.
--   * RLS is unchanged: riders SELECT/own INSERT(revoked), admins SELECT/
--     UPDATE all. Bank details are readable by the rider (own rows) and admins
--     — which is required for manual payout review. No rider UPDATE policy.
-- ============================================================

-- 1. Schema: add bank columns (idempotent).
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_code text;

-- Column-level guard: account_number, if set, must look like a NUBAN/bank
-- account number (digits only, 6-20). This protects rows edited via the
-- admin update path too — a malformed value can never be committed.
ALTER TABLE public.withdrawal_requests
  ADD CONSTRAINT withdrawal_requests_account_number_format
    CHECK (account_number IS NULL OR account_number ~ '^[0-9]{6,20}$');

-- 2. request_withdrawal(p_amount, p_account_name, p_account_number,
--    p_bank_name, p_bank_code)
--    Body is identical to 20261022_rider_earnings_foundation.sql:139-189 EXCEPT:
--      (a) the four bank parameters + their validation, and
--      (b) the INSERT now populates the bank columns.
--    The lifetime earnings boundary (ds.status <> 'reversed') from 20261022 is
--    PRESERVED here — the encumbrance logic is byte-for-byte the same. No
--    payout is subtracted yet (withdrawal flow does not move money in-app).
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_account_name text,
  p_account_number text,
  p_bank_name text,
  p_bank_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_rider public.riders%ROWTYPE;
  v_earned numeric;
  v_encumbered numeric;
  v_available numeric;
  v_withdrawal_id bigint;
  -- Normalized bank fields (trimmed). Mirrors the Edge Function's clean()/trim.
  v_account_name text;
  v_account_number text;
  v_bank_name text;
  v_bank_code text;
BEGIN
  SELECT * INTO v_rider
  FROM public.riders
  WHERE user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No rider application found for this account';
  END IF;
  IF v_rider.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved riders can request withdrawals';
  END IF;
  IF p_amount IS NULL OR NOT (p_amount > 0 AND p_amount < 1000000) THEN
    RAISE EXCEPTION 'Amount must be a valid positive naira value';
  END IF;

  -- ---- Bank details: validate server-authoritatively (never trust client) ----
  -- Regexes mirror supabase/functions/paystack-transfer-recipient/index.ts:133
  -- exactly, so the rider's payout record can always be fed back to Paystack.
  v_account_name := nullif(trim(coalesce(p_account_name, '')), '');
  v_account_number := regexp_replace(coalesce(p_account_number, ''), '\s+', '', 'g');
  v_bank_name := nullif(trim(coalesce(p_bank_name, '')), '');
  v_bank_code := nullif(trim(coalesce(p_bank_code, '')), '');

  IF v_account_name IS NULL OR length(v_account_name) > 120 THEN
    RAISE EXCEPTION 'Account name is required (max 120 characters)';
  END IF;
  IF v_account_number IS NULL OR v_account_number !~ '^[0-9]{6,20}$' THEN
    RAISE EXCEPTION 'Account number must be 6-20 digits';
  END IF;
  IF v_bank_code IS NULL OR v_bank_code !~ '^[A-Za-z0-9]{2,10}$' THEN
    RAISE EXCEPTION 'Invalid bank code';
  END IF;
  IF v_bank_name IS NULL OR length(v_bank_name) > 120 THEN
    RAISE EXCEPTION 'Bank name is required (max 120 characters)';
  END IF;

  SELECT COALESCE(SUM(ds.rider_amount), 0) INTO v_earned
  FROM public.delivery_settlements ds
  WHERE ds.rider_id = v_rider.id AND ds.status <> 'reversed';

  SELECT COALESCE(SUM(w.amount), 0) INTO v_encumbered
  FROM public.withdrawal_requests w
  WHERE w.rider_id = v_rider.id AND w.status <> 'rejected';

  v_available := GREATEST(v_earned - v_encumbered, 0);

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Requested amount exceeds your available balance (available: %)', v_available;
  END IF;

  INSERT INTO public.withdrawal_requests
    (rider_id, amount, status, account_name, account_number, bank_name, bank_code)
  VALUES
    (v_rider.id, p_amount, 'pending', v_account_name, v_account_number, v_bank_name, v_bank_code)
  RETURNING id INTO v_withdrawal_id;

  RETURN json_build_object(
    'withdrawal_id', v_withdrawal_id,
    'amount', p_amount,
    'status', 'pending',
    'available_balance', v_available,
    'account_name', v_account_name,
    'account_number', v_account_number,
    'bank_name', v_bank_name,
        'bank_code', v_bank_code
  );
END;
$func$;

-- 3. Permissions: the NEW signature is executable only by authenticated users.
REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text, text) TO authenticated;

-- 4. Remove the old single-argument signature so a rider can NEVER submit a
--    bank-less withdrawal (forces clients onto the bank-capturing RPC).
DROP FUNCTION IF EXISTS public.request_withdrawal(numeric);

-- NOTE: get_rider_earnings is NOT re-declared here — 20261022 already rebuilt
-- it with the lifetime boundary, and 20261005 keeps the authoritative pins.
-- No RPC/RLS/checkout/vendor/Paystack change beyond what is above.
-- ============================================================

