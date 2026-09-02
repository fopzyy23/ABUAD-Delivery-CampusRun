-- ============================================================
-- ACTION 10: Withdrawal request foundation (rider earnings)
-- ============================================================
-- Pending / admin-reviewed RECORDS ONLY. Nothing in this table moves
-- money — approvals are recorded here and any actual settlement
-- happens outside the platform (out of scope for the app).
--
-- Security model (RLS):
--   INSERT: only the approved rider themself, and only with
--           status = 'pending' (a rider cannot forge a pre-approved row).
--   SELECT: own requests (rider) + every request (admin).
--   UPDATE: admin only. No rider UPDATE policy exists, so a rider can
--           NEVER approve/reject/pay their own request, and cannot
--           change the amount after submitting.
--   DELETE: no policy at all — nobody deletes request records.
-- The riders subquery pattern matches the existing recursion-safe
-- orders_select_unassigned policy style (see
-- 20260821_fix_orders_rls_recursion.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- riders.id is uuid (see 20260819_restore_rider_hub.sql), so the FK column
  -- MUST be uuid too. A bigint column here would fail to reference riders(id).
  rider_id uuid NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id),
  admin_note text
);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- Rider: submit an own withdrawal request. Only approved riders can
-- create rows, the row must be born 'pending', and it must arrive with NO
-- admin-review fields pre-set (a rider cannot forge a reviewed/approved row).
DROP POLICY IF EXISTS "withdrawal_requests_insert_own" ON public.withdrawal_requests;
CREATE POLICY "withdrawal_requests_insert_own" ON public.withdrawal_requests
  FOR INSERT
  WITH CHECK (
    rider_id IN (
      SELECT id FROM public.riders
      WHERE user_id = auth.uid() AND status = 'approved'
    )
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND admin_note IS NULL
  );

-- Rider: view only their own requests.
DROP POLICY IF EXISTS "withdrawal_requests_select_own" ON public.withdrawal_requests;
CREATE POLICY "withdrawal_requests_select_own" ON public.withdrawal_requests
  FOR SELECT
  USING (
    rider_id IN (
      SELECT id FROM public.riders WHERE user_id = auth.uid()
    )
  );

-- Admin: view every request.
DROP POLICY IF EXISTS "withdrawal_requests_select_admin" ON public.withdrawal_requests;
CREATE POLICY "withdrawal_requests_select_admin" ON public.withdrawal_requests
  FOR SELECT
  USING (public.is_admin());

-- Admin: review requests (approve / reject / mark paid).
DROP POLICY IF EXISTS "withdrawal_requests_update_admin" ON public.withdrawal_requests;
CREATE POLICY "withdrawal_requests_update_admin" ON public.withdrawal_requests
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Index for the rider's "view own requests" SELECT (rider_id lookup).
CREATE INDEX IF NOT EXISTS withdrawal_requests_rider_id_idx
  ON public.withdrawal_requests(rider_id);

GRANT SELECT, INSERT, UPDATE ON public.withdrawal_requests TO authenticated;
