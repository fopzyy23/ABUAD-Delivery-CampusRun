-- Dropzyy Phase 4 staging regression checks.
-- Run with psql against a staging clone only. The script is rollback-capable;
-- it intentionally does not create users, orders, payments, or coupons.
-- Supply fixture UUIDs in a staging session when running the marked scenarios.

BEGIN;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='promotion_reservations' AND column_name='expires_at';
  IF n <> 1 THEN RAISE EXCEPTION 'promotion reservation expiry column missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='promotion_reservations_one_active_per_order') THEN
    RAISE EXCEPTION 'one-active-reservation index missing';
  END IF;
  IF to_regprocedure('public.replace_delivery_promotion(uuid,text,text)') IS NULL THEN RAISE EXCEPTION 'replace RPC missing'; END IF;
  IF to_regprocedure('public.release_my_delivery_promotion(uuid)') IS NULL THEN RAISE EXCEPTION 'customer release RPC missing'; END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.customer_credit_ledger WHERE remaining_amount < 0) THEN
    RAISE EXCEPTION 'negative promotional credit remaining_amount exists';
  END IF;
  IF EXISTS (
    SELECT user_id FROM public.customer_credit_ledger
    WHERE source_type='signup_reward' AND amount > 0
    GROUP BY user_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'duplicate signup reward exists'; END IF;
  IF EXISTS (
    SELECT source_id FROM public.customer_credit_ledger
    WHERE source_type='referral_reward' AND amount > 0 AND source_id IS NOT NULL
    GROUP BY source_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'duplicate referral reward exists'; END IF;
  IF EXISTS (
    SELECT coupon_id FROM public.coupon_redemptions
    WHERE status IN ('reserved','finalized')
    GROUP BY coupon_id HAVING count(*) > (SELECT COALESCE(max(c.usage_limit),2147483647) FROM public.coupons c WHERE c.id=coupon_id)
  ) THEN RAISE EXCEPTION 'coupon capacity is oversubscribed'; END IF;
  IF EXISTS (
    SELECT order_id FROM public.promotion_reservations WHERE status='reserved'
    GROUP BY order_id HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'more than one active reservation exists for an order'; END IF;
END $$;

-- Signup idempotency: call issue_customer_signup_reward(referral_code) twice
-- as the same fixture customer; assert exactly one positive signup row and one
-- matching notification, then rollback.
-- Referral idempotency/self-block: attribute a referral, call
-- qualify_referral_on_delivery(delivered_order_id) twice, and assert one
-- referral_reward row; call signup with the customer's own code and assert no
-- referral row is created.
-- Credit concurrency: run two sessions concurrently against two pending
-- orders and the same credit ledger; assert SUM(reserved allocations) <= the
-- ledger's available balance, no remaining_amount < 0, and no duplicate
-- (reservation_id, ledger_id).
-- Coupon concurrency: run two sessions against the final coupon slot; assert
-- one succeeds, one fails, and finalized + reserved <= usage_limit. Release
-- the winner and assert the slot becomes available again.
-- Reservation safety: apply credit, replace with coupon, replace with credit;
-- assert one row with status=reserved for the order and no simultaneous
-- credit/coupon redemptions.
-- Payment safety: mark the authoritative payment success twice and assert one
-- finalized reservation and one consumed credit/coupon redemption. Mark a
-- failed attempt twice and assert it is released, never finalized.
-- Financial snapshot: assert base_delivery_fee, rider_delivery_share,
-- team_share_before_promotion, promotion_discount, customer_delivery_charge,
-- and total are unchanged after editing the coupon.

ROLLBACK;
