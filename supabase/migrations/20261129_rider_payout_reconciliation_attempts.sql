-- Phase F2.1: preserve every rider payout transfer attempt and enforce the
-- withdrawal-paid plus transfer-success reconciliation invariant.

CREATE TABLE IF NOT EXISTS public.rider_payout_reconciliation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid REFERENCES public.riders(id),
  withdrawal_request_id bigint NOT NULL REFERENCES public.withdrawal_requests(id),
  transfer_id uuid NOT NULL REFERENCES public.transfers(id),
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  amount numeric NOT NULL CHECK (amount > 0),
  transfer_status text NOT NULL,
  reconciliation_status text NOT NULL DEFAULT 'unreconciled'
    CHECK (reconciliation_status IN ('unreconciled','reconciled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transfer_id),
  UNIQUE (withdrawal_request_id, attempt_no)
);

ALTER TABLE public.rider_payout_reconciliation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rider_payout_reconciliation_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rider_payout_reconciliation_attempts TO authenticated;
GRANT ALL ON public.rider_payout_reconciliation_attempts TO service_role;

DROP POLICY IF EXISTS rider_payout_reconciliation_attempts_select_own
  ON public.rider_payout_reconciliation_attempts;
CREATE POLICY rider_payout_reconciliation_attempts_select_own
  ON public.rider_payout_reconciliation_attempts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.riders r
    WHERE r.id = rider_id AND r.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS rider_payout_reconciliation_attempts_select_admin
  ON public.rider_payout_reconciliation_attempts;
CREATE POLICY rider_payout_reconciliation_attempts_select_admin
  ON public.rider_payout_reconciliation_attempts FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_rider_payout_reconciliation_attempts_rider
  ON public.rider_payout_reconciliation_attempts(rider_id, created_at DESC);

-- Backfill every withdrawal-linked transfer. Existing transfer amounts and
-- statuses are copied from transfers; only missing legacy attempt numbers are
-- assigned deterministically after the explicit numbers for that withdrawal.
WITH numbered AS (
  SELECT t.id AS transfer_id,
         w.rider_id,
         w.id AS withdrawal_request_id,
         t.attempt_no AS explicit_attempt_no,
         CASE WHEN t.attempt_no IS NULL THEN
           COALESCE(MAX(t.attempt_no) OVER (PARTITION BY t.withdrawal_request_id), 0)
           + ROW_NUMBER() OVER (
               PARTITION BY t.withdrawal_request_id, (t.attempt_no IS NULL)
               ORDER BY t.created_at, t.id
             )
         END AS legacy_attempt_no,
         t.amount,
         t.status,
         w.status AS withdrawal_status,
         t.created_at,
         t.updated_at
    FROM public.transfers t
    JOIN public.withdrawal_requests w ON w.id = t.withdrawal_request_id
), backfill AS (
  SELECT rider_id, withdrawal_request_id, transfer_id,
         COALESCE(explicit_attempt_no, legacy_attempt_no)::integer AS attempt_no,
         amount, status AS transfer_status, withdrawal_status,
         created_at, COALESCE(updated_at, created_at) AS updated_at
    FROM numbered
)
INSERT INTO public.rider_payout_reconciliation_attempts
  (rider_id, withdrawal_request_id, transfer_id, attempt_no, amount,
   transfer_status, reconciliation_status, created_at, updated_at)
SELECT rider_id, withdrawal_request_id, transfer_id, attempt_no, amount,
       transfer_status,
       CASE WHEN withdrawal_status = 'paid' AND transfer_status = 'success'
         THEN 'reconciled' ELSE 'unreconciled' END,
       created_at, updated_at
  FROM backfill
ON CONFLICT (transfer_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_rider_payout_reconciliation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rider_id uuid;
  v_withdrawal_id bigint;
  v_amount numeric;
  v_transfer_status text;
  v_transfer_id uuid;
  v_withdrawal_status text;
  v_attempt_no integer;
BEGIN
  IF TG_TABLE_NAME = 'withdrawal_requests' THEN
    v_withdrawal_id := NEW.id;
    v_rider_id := NEW.rider_id;
    v_amount := NEW.amount;
    v_withdrawal_status := NEW.status;
    SELECT id, status INTO v_transfer_id, v_transfer_status
      FROM public.transfers
     WHERE withdrawal_request_id = NEW.id
     ORDER BY created_at DESC, id DESC LIMIT 1;
    UPDATE public.rider_payout_reconciliation_attempts a
       SET reconciliation_status = CASE
         WHEN NEW.status = 'paid' AND t.status = 'success'
           THEN 'reconciled' ELSE 'unreconciled' END,
           transfer_status = t.status,
           updated_at = now()
      FROM public.transfers t
     WHERE t.id = a.transfer_id
       AND a.withdrawal_request_id = NEW.id;
  ELSE
    IF NEW.withdrawal_request_id IS NULL THEN RETURN NEW; END IF;
    v_transfer_id := NEW.id;
    v_withdrawal_id := NEW.withdrawal_request_id;
    v_transfer_status := NEW.status;
    SELECT rider_id, amount, status INTO v_rider_id, v_amount, v_withdrawal_status
      FROM public.withdrawal_requests WHERE id = NEW.withdrawal_request_id FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;

    SELECT attempt_no INTO v_attempt_no
      FROM public.rider_payout_reconciliation_attempts
     WHERE transfer_id = NEW.id;
    IF NOT FOUND THEN
      v_attempt_no := COALESCE((
        SELECT MAX(attempt_no) FROM public.rider_payout_reconciliation_attempts
        WHERE withdrawal_request_id = NEW.withdrawal_request_id
      ), 0) + 1;
      INSERT INTO public.rider_payout_reconciliation_attempts
        (rider_id, withdrawal_request_id, transfer_id, attempt_no, amount,
         transfer_status, reconciliation_status)
      VALUES
        (v_rider_id, v_withdrawal_id, v_transfer_id, v_attempt_no, NEW.amount,
         NEW.status,
         CASE WHEN v_withdrawal_status = 'paid' AND NEW.status = 'success'
           THEN 'reconciled' ELSE 'unreconciled' END)
      ON CONFLICT (transfer_id) DO UPDATE SET
        transfer_status = EXCLUDED.transfer_status,
        reconciliation_status = EXCLUDED.reconciliation_status,
        updated_at = now();
    ELSE
      UPDATE public.rider_payout_reconciliation_attempts
         SET transfer_status = NEW.status,
             reconciliation_status = CASE
               WHEN v_withdrawal_status = 'paid' AND NEW.status = 'success'
                 THEN 'reconciled' ELSE 'unreconciled' END,
             updated_at = now()
       WHERE transfer_id = NEW.id;
    END IF;
  END IF;

  INSERT INTO public.rider_payout_reconciliation
    (rider_id, withdrawal_request_id, transfer_id, amount, withdrawal_status,
     transfer_status, reconciliation_status, updated_at)
  VALUES
    (v_rider_id, v_withdrawal_id, v_transfer_id, v_amount, v_withdrawal_status,
     v_transfer_status,
     CASE WHEN v_withdrawal_status = 'paid' AND v_transfer_status = 'success'
       THEN 'reconciled' ELSE 'unreconciled' END,
     now())
  ON CONFLICT (withdrawal_request_id) DO UPDATE SET
    rider_id = EXCLUDED.rider_id,
    transfer_id = COALESCE(EXCLUDED.transfer_id, rider_payout_reconciliation.transfer_id),
    amount = EXCLUDED.amount,
    withdrawal_status = EXCLUDED.withdrawal_status,
    transfer_status = COALESCE(EXCLUDED.transfer_status, rider_payout_reconciliation.transfer_status),
    reconciliation_status = CASE
      WHEN EXCLUDED.withdrawal_status = 'paid'
       AND COALESCE(EXCLUDED.transfer_status, rider_payout_reconciliation.transfer_status) = 'success'
        THEN 'reconciled' ELSE 'unreconciled'
    END,
    updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_rider_payout_reconciliation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_rider_payout_reconciliation() TO service_role;

-- Correct existing summary rows without rewriting source financial history.
UPDATE public.rider_payout_reconciliation r
   SET reconciliation_status = CASE
     WHEN r.withdrawal_status = 'paid' AND r.transfer_status = 'success'
       THEN 'reconciled' ELSE 'unreconciled' END,
       updated_at = now();

-- Keep transfer identity and original amount immutable in attempt history;
-- only the transfer status and reconciliation state follow the source rows.
UPDATE public.rider_payout_reconciliation_attempts AS a
   SET reconciliation_status = CASE
     WHEN w.status = 'paid' AND t.status = 'success'
       THEN 'reconciled' ELSE 'unreconciled' END,
       transfer_status = t.status,
       updated_at = now()
  FROM public.withdrawal_requests AS w,
       public.transfers AS t
 WHERE w.id = a.withdrawal_request_id
   AND t.id = a.transfer_id;
