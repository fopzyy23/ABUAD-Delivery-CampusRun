-- Phase 2 finance workspaces: admin read access only.
DROP POLICY IF EXISTS "payments_select_admin" ON public.payments;
CREATE POLICY "payments_select_admin" ON public.payments
  FOR SELECT TO authenticated USING (public.is_admin());
