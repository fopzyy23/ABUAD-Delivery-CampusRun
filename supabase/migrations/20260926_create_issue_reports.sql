-- ============================================================
-- Dropzyy — Issue Reports (customer → admin support intake)
-- ============================================================
-- Creates an issue/report backend for the homepage "Report an
-- Issue" + "Become a Vendor" flows, reviewed from the Admin Panel.
--
-- Security model (RLS), mirroring the existing withdrawal_requests
-- conventions (see 20260905_create_withdrawal_requests.sql):
--   INSERT: only the authenticated caller, only for THEMSELVES
--           (user_id = auth.uid()), the report must be born 'Open',
--           admin-only fields must be NULL, and the optional order_id
--           must belong to the caller (order ownership guard).
--   SELECT: own reports (user) + every report (admin via is_admin()).
--   UPDATE: admin only (status + admin_response). There is NO user
--           UPDATE policy, so a reporter can never edit/close their
--           own report or tamper with admin responses.
--   DELETE: no policy at all — reports are retained.
--
-- The order-ownership subquery does NOT create RLS recursion: the
-- orders table never references issue_reports, so the policy check is
-- a one-directional lookup (the orders policies use SECURITY DEFINER
-- helpers from 20260821, which break any inner-table cycles).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.issue_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- auth.users.id (same pattern as notifications.user_id)
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Issue subject / category chosen from the app's dropdown
  -- (e.g. 'Order problem', 'Delivery / Rider problem', 'Become a vendor').
  subject text NOT NULL,
  description text NOT NULL,
  -- Optional order; uuid to match orders.id (see 20260910 ledger FKs).
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'In Review', 'Resolved', 'Closed')),
  admin_response text,
  admin_reviewed_at timestamptz,
  admin_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS issue_reports_user_idx
  ON public.issue_reports (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS issue_reports_status_idx
  ON public.issue_reports (status, created_at DESC);

-- Auto-maintain updated_at (same trigger pattern as payments.updated_at).
CREATE OR REPLACE FUNCTION public.set_issue_reports_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_issue_reports_set_updated_at ON public.issue_reports;
CREATE TRIGGER trg_issue_reports_set_updated_at
  BEFORE UPDATE ON public.issue_reports FOR EACH ROW
  EXECUTE FUNCTION public.set_issue_reports_updated_at();

ALTER TABLE public.issue_reports ENABLE ROW LEVEL SECURITY;

-- INSERT: own report, born 'Open', no admin fields, optional own order.
DROP POLICY IF EXISTS "issue_reports_insert_own" ON public.issue_reports;
CREATE POLICY "issue_reports_insert_own" ON public.issue_reports
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Open'
    AND admin_response IS NULL
    AND admin_reviewed_at IS NULL
    AND admin_reviewed_by IS NULL
    AND (
      order_id IS NULL
      OR order_id IN (
        SELECT id FROM public.orders WHERE user_id = auth.uid()
      )
    )
  );

-- SELECT: own reports only (normal users can never view others' reports).
DROP POLICY IF EXISTS "issue_reports_select_own" ON public.issue_reports;
CREATE POLICY "issue_reports_select_own" ON public.issue_reports
  FOR SELECT
  USING (user_id = auth.uid());

-- SELECT: admin sees every report.
DROP POLICY IF EXISTS "issue_reports_select_admin" ON public.issue_reports;
CREATE POLICY "issue_reports_select_admin" ON public.issue_reports
  FOR SELECT
  USING (public.is_admin());

-- UPDATE: admin only (status / admin_response / review timestamps).
-- No user UPDATE policy exists, so reporters can never modify reports.
DROP POLICY IF EXISTS "issue_reports_update_admin" ON public.issue_reports;
CREATE POLICY "issue_reports_update_admin" ON public.issue_reports
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy: reports are retained for the audit trail.

-- ------------------------------------------------------------
-- Grants: authenticated may SELECT/INSERT/UPDATE (RLS-gated above);
-- anon/PUBLIC get nothing; DELETE stays ungranted (nobody deletes rows).
-- ------------------------------------------------------------
REVOKE ALL ON public.issue_reports FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.issue_reports TO authenticated;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * Table: issue_reports (id, user_id, subject, description,
--   order_id, status, admin_response, admin_reviewed_at,
--   admin_reviewed_by, created_at, updated_at).
-- * Statuses: 'Open' (default) → 'In Review' → 'Resolved' | 'Closed'.
-- * RLS: users see/insert only their own; admins review everything.
-- * The optional order_id is server-validated to belong to the caller.
-- * No email/SMS/push; no changes to existing tables or policies.
-- ============================================================