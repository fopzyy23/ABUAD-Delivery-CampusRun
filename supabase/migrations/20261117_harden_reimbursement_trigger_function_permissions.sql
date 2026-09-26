REVOKE ALL ON FUNCTION public.finalize_customer_reimbursement_transfer_state()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.finalize_customer_reimbursement_transfer_state()
TO service_role;

REVOKE ALL ON FUNCTION public.repair_customer_reimbursement_state()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.repair_customer_reimbursement_state()
TO service_role;
