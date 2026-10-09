-- Dropzyy Phase 5 staging regression checks.
-- Run against a staging clone with fixture UUIDs and roll back after each
-- scenario. This file does not create users, payments, refunds, or transfers.

BEGIN;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema='public' AND table_name='promotion_restorations';
  IF n <> 1 THEN RAISE EXCEPTION 'promotion restoration audit table missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='coupon_redemptions_status_check') THEN
    RAISE EXCEPTION 'coupon reversed status is not supported';
  END IF;
  IF to_regprocedure('public.restore_order_promotion_after_full_refund(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'restoration function missing';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.promotion_restorations GROUP BY order_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'more than one promotion restoration exists for an order';
  END IF;
  IF EXISTS (SELECT 1 FROM public.promotion_restorations WHERE amount_restored <= 0) THEN
    RAISE EXCEPTION 'invalid restoration amount';
  END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_redemptions WHERE status='reversed' AND redeemed_at IS NULL) THEN
    RAISE EXCEPTION 'reversed coupon redemption lost its history';
  END IF;
END $$;

-- Fixture scenarios to run in staging:
-- 1. Finalize one credit promotion using two original ledger allocations;
--    process a full_order refund once and twice; assert one restoration row,
--    each ledger remaining_amount increased by exactly its allocation, and
--    each original expires_at is unchanged.
-- 2. Repeat with an already-expired allocation; this is the expired credit
--    case. Assert its status remains
--    expired and available credit does not increase.
-- 3. Process a partial refund, replacement_adjustment refund, legacy_unknown
--    refund, and additional-payment refund; assert no restoration row and no
--    ledger change.
-- 4. Cancel before payment success; assert reservation becomes released, no
--    restoration row exists, and no credit is created.
-- 5. Finalize a coupon promotion and complete a full refund; assert one
--    promotion_restorations row, one coupon_redemptions row with status
--    reversed, and no duplicate reversal on retry.
-- 6. After reversal, test the coupon again while active/eligible, expired,
--    inactive, at its global limit, over its per-user limit, and with
--    first_order_only. Verify the existing first-order rule: it checks for
--    any order whose payment_status='success'; a refunded product order has
--    payment_status='refunded', while a reimbursement-only path may retain
--    success and therefore remains ineligible.
-- 7. Confirm restored promotional value never changes payments, refunds,
--    transfers, rider settlements, or vendor settlements.
-- 8. Confirm one notification is created per actual restoration and retries
--    create no second notification.

ROLLBACK;
