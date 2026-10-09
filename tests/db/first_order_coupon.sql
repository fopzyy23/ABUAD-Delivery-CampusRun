-- First-order-only coupon eligibility regression checks.
-- Run against staging PostgreSQL with fixtures, inside a transaction.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.customer_has_prior_qualifying_order(uuid,uuid)') IS NULL
     OR to_regprocedure('public.is_first_order_coupon_eligible(uuid,uuid)') IS NULL
     OR to_regprocedure('public.order_has_authoritative_full_reversal(uuid)') IS NULL THEN
    RAISE EXCEPTION 'central first-order eligibility helpers are missing';
  END IF;
END $$;

-- Fixture assertions:
-- 1. No prior paid orders => eligible.
-- 2. Prior successful normal order => not eligible.
-- 3. Prior successful order + processed full_order refund whose amount equals
--    the authoritative full payment => eligible.
-- 4. Prior successful order + reimbursed cancellation whose successful
--    reimbursement equals the authoritative full order amount => eligible.
-- 5. Partial refund, replacement_adjustment, legacy_unknown, requested,
--    approved, processing, failed, pending, or partial reimbursement => order
--    still qualifies as a prior paid order and eligibility is false.
-- 6. The current checkout order is passed as p_exclude_order_id and does not
--    count as a prior order.
-- 7. A first-order-only coupon is accepted after a genuine full reversal only
--    when its current active, start, expiry, global, per-user, max-₦400, and
--    no-stacking checks pass.
-- 8. After a full reversal, an expired or inactive coupon remains rejected.
-- 9. A fully reversed first order followed by a second checkout remains
--    eligible; a normal completed first order does not.

ROLLBACK;
