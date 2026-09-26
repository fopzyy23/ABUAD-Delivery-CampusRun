-- Phase F2: rider payout reconciliation and one authoritative balance path.
-- Existing settlement, bonus, withdrawal, and transfer rows remain the source
-- of truth; this table records their payout reconciliation state only.

CREATE TABLE IF NOT EXISTS public.rider_payout_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES public.riders(id),
  withdrawal_request_id bigint NOT NULL REFERENCES public.withdrawal_requests(id),
  transfer_id uuid REFERENCES public.transfers(id),
  amount numeric NOT NULL CHECK (amount > 0),
  withdrawal_status text NOT NULL,
  transfer_status text,
  reconciliation_status text NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_status IN ('unreconciled','reconciled')),
  fee_status text NOT NULL DEFAULT 'unknown'
    CHECK (fee_status IN ('unknown','reconciled')),
  fee_amount numeric CHECK (fee_amount IS NULL OR fee_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (withdrawal_request_id),
  UNIQUE (transfer_id)
);

ALTER TABLE public.rider_payout_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_payout_reconciliation FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rider_payout_reconciliation TO authenticated;
GRANT ALL ON public.rider_payout_reconciliation TO service_role;

DROP POLICY IF EXISTS rider_payout_reconciliation_select_own ON public.rider_payout_reconciliation;
CREATE POLICY rider_payout_reconciliation_select_own
  ON public.rider_payout_reconciliation FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = rider_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS rider_payout_reconciliation_select_admin ON public.rider_payout_reconciliation;
CREATE POLICY rider_payout_reconciliation_select_admin
  ON public.rider_payout_reconciliation FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_rider_payout_reconciliation_rider
  ON public.rider_payout_reconciliation(rider_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.sync_rider_payout_reconciliation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rider_id uuid;
  v_withdrawal_id bigint;
  v_amount numeric;
  v_transfer_status text;
  v_transfer_id uuid;
  v_withdrawal_status text;
BEGIN
  IF TG_TABLE_NAME = 'withdrawal_requests' THEN
    v_withdrawal_id := NEW.id;
    v_rider_id := NEW.rider_id;
    v_amount := NEW.amount;
    v_withdrawal_status := NEW.status;
    SELECT id, status INTO v_transfer_id, v_transfer_status
      FROM public.transfers
     WHERE withdrawal_request_id = NEW.id
     ORDER BY created_at DESC LIMIT 1;
  ELSE
    IF NEW.withdrawal_request_id IS NULL THEN RETURN NEW; END IF;
    v_transfer_id := NEW.id;
    v_withdrawal_id := NEW.withdrawal_request_id;
    v_transfer_status := NEW.status;
    SELECT rider_id, amount, status INTO v_rider_id, v_amount, v_withdrawal_status
      FROM public.withdrawal_requests WHERE id = NEW.withdrawal_request_id;
    IF NOT FOUND THEN RETURN NEW; END IF;
  END IF;

  INSERT INTO public.rider_payout_reconciliation
    (rider_id, withdrawal_request_id, transfer_id, amount, withdrawal_status,
     transfer_status, reconciliation_status, updated_at)
  VALUES
    (v_rider_id, v_withdrawal_id, v_transfer_id, v_amount, v_withdrawal_status,
     v_transfer_status,
     CASE WHEN v_transfer_status = 'success' THEN 'reconciled' ELSE 'unreconciled' END,
     now())
  ON CONFLICT (withdrawal_request_id) DO UPDATE SET
    rider_id = EXCLUDED.rider_id,
    transfer_id = COALESCE(EXCLUDED.transfer_id, rider_payout_reconciliation.transfer_id),
    amount = EXCLUDED.amount,
    withdrawal_status = EXCLUDED.withdrawal_status,
    transfer_status = COALESCE(EXCLUDED.transfer_status, rider_payout_reconciliation.transfer_status),
    reconciliation_status = CASE
      WHEN COALESCE(EXCLUDED.transfer_status, rider_payout_reconciliation.transfer_status) = 'success'
        THEN 'reconciled'
      ELSE 'unreconciled'
    END,
    updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_rider_payout_reconciliation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_rider_payout_reconciliation() TO service_role;

CREATE OR REPLACE TRIGGER trg_sync_rider_payout_reconciliation_withdrawal
AFTER INSERT OR UPDATE OF status, amount ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.sync_rider_payout_reconciliation();

CREATE OR REPLACE TRIGGER trg_sync_rider_payout_reconciliation_transfer
AFTER INSERT OR UPDATE OF status, transfer_code, withdrawal_request_id ON public.transfers
FOR EACH ROW EXECUTE FUNCTION public.sync_rider_payout_reconciliation();

INSERT INTO public.rider_payout_reconciliation
  (rider_id, withdrawal_request_id, transfer_id, amount, withdrawal_status,
   transfer_status, reconciliation_status)
SELECT w.rider_id, w.id, t.id, w.amount, w.status, t.status,
       CASE WHEN t.status = 'success' THEN 'reconciled' ELSE 'unreconciled' END
  FROM public.withdrawal_requests w
  LEFT JOIN LATERAL (
    SELECT id, status FROM public.transfers
     WHERE withdrawal_request_id = w.id
     ORDER BY created_at DESC LIMIT 1
  ) t ON true
ON CONFLICT (withdrawal_request_id) DO UPDATE SET
  transfer_id = COALESCE(EXCLUDED.transfer_id, rider_payout_reconciliation.transfer_id),
  amount = EXCLUDED.amount,
  withdrawal_status = EXCLUDED.withdrawal_status,
  transfer_status = EXCLUDED.transfer_status,
  reconciliation_status = EXCLUDED.reconciliation_status,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric,
  p_account_name text,
  p_account_number text,
  p_bank_name text,
  p_bank_code text
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rider public.riders%ROWTYPE;
  v_balance jsonb;
  v_available numeric;
  v_withdrawal_id bigint;
  v_account_name text := nullif(trim(coalesce(p_account_name, '')), '');
  v_account_number text := regexp_replace(coalesce(p_account_number, ''), '\s+', '', 'g');
  v_bank_name text := nullif(trim(coalesce(p_bank_name, '')), '');
  v_bank_code text := nullif(trim(coalesce(p_bank_code, '')), '');
BEGIN
  SELECT * INTO v_rider FROM public.riders WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR v_rider.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved riders can request withdrawals';
  END IF;
  IF p_amount IS NULL OR NOT (p_amount > 0 AND p_amount < 1000000) THEN
    RAISE EXCEPTION 'Amount must be a valid positive naira value';
  END IF;
  IF v_account_name IS NULL OR length(v_account_name) > 120 THEN RAISE EXCEPTION 'Account name is required (max 120 characters)'; END IF;
  IF v_account_number IS NULL OR v_account_number !~ '^[0-9]{6,20}$' THEN RAISE EXCEPTION 'Account number must be 6-20 digits'; END IF;
  IF v_bank_code IS NULL OR v_bank_code !~ '^[A-Za-z0-9]{2,10}$' THEN RAISE EXCEPTION 'Invalid bank code'; END IF;
  IF v_bank_name IS NULL OR length(v_bank_name) > 120 THEN RAISE EXCEPTION 'Bank name is required (max 120 characters)'; END IF;

  v_balance := public._calculate_rider_balance(v_rider.id);
  v_available := COALESCE((v_balance->>'available_balance')::numeric, 0);
  IF p_amount > v_available THEN
    RAISE EXCEPTION 'Requested amount exceeds your available balance (available: %)', v_available;
  END IF;

  INSERT INTO public.withdrawal_requests
    (rider_id, amount, status, account_name, account_number, bank_name, bank_code)
  VALUES (v_rider.id, p_amount, 'pending', v_account_name, v_account_number, v_bank_name, v_bank_code)
  RETURNING id INTO v_withdrawal_id;
  RETURN json_build_object('withdrawal_id', v_withdrawal_id, 'amount', p_amount,
    'status', 'pending', 'available_balance', v_available,
    'account_name', v_account_name, 'account_number', v_account_number,
    'bank_name', v_bank_name, 'bank_code', v_bank_code);
END;
$$;

REVOKE ALL ON FUNCTION public.request_withdrawal(numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text, text, text) TO authenticated;
