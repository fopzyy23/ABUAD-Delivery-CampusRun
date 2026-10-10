# Dropzyy rewards Phase 4 staging verification

This is a manual, rollback-capable verification plan. Do not run it against production and do not deploy it automatically. Use two authenticated customer sessions, two browser tabs, an admin session with AAL2, and a Paystack test account.

## Fixture setup

Create (or identify) two customers, one referral code, a pending restaurant order with a rider fee of ₦1,500, a vendor rider order, a fixed coupon, a percentage coupon, and a coupon whose remaining capacity is one. Record the order UUIDs and payment UUIDs. Do not edit historical production rows.

Run `tests/db/rewards_phase4.sql` in a transaction and keep the transaction open while checking the assertions below. Roll back after each fixture scenario.

## Scenarios

1. Sign in a new customer with and without a referral code. Call `issue_customer_signup_reward` twice. Confirm exactly one positive `signup_reward` row for ₦200, an expiry 60 days after issuance, and exactly one notification with the signup message.
2. Confirm referral registration creates attribution but no referral credit. After the referred order reaches `Delivered`, process the transition twice. Confirm exactly one ₦100 `referral_reward` row, one `rewarded` referral, and one notification. Try the customer’s own code and confirm no referral relationship is created.
3. Reserve ₦300 credit from two concurrent pending orders. Confirm combined active allocations never exceed ₦300 and no ledger `remaining_amount` is negative. Repeat with ₦700 and two ₦400 attempts; the combined reservation must remain ≤ ₦700.
4. Reserve the last coupon slot concurrently from two users. Confirm only one succeeds. Release the reservation and confirm the capacity returns. Test inactive, not-yet-started, expired, fixed, percentage, global-limit, per-user-limit, and first-order-only coupons.
5. On one order apply credit, replace it with a coupon, replace it back with credit, and remove it. At every point assert one active reservation for the order and no stacked redemptions.
6. Initialize a payment twice and deliver the success webhook twice. Confirm only one reservation finalizes and only one credit allocation is consumed or coupon redemption finalized. Test verified failure, order/payment failed, cancellation before success, and an abandoned reservation older than 30 minutes; all must release idempotently. A successful payment must never be released by expiry cleanup.
7. On a vendor rider order compare before/after values: product subtotal and private-vendor amount unchanged; base delivery ₦1,500; rider share unchanged; team share reduced only by the approved discount; customer delivery charge and final payment amount match the server snapshot.
8. Edit the coupon after a successful order. Confirm that the historical order snapshot does not change. Confirm the admin UI can edit all permitted fields, activate/deactivate, and display finalized, reserved, remaining, per-user, and first-order values. Coupon code remains immutable.
9. Verify customer RLS cannot insert/update ledger, referrals, coupons, reservations, or order promotion snapshots, cannot finalize/release arbitrary reservations, and cannot read another customer’s rows. Verify coupon mutation RPCs require admin role plus AAL2.

## Phase 5: restoration after a full refund

10. Finalize a credit promotion with one or more allocations. Process a `full_order` refund whose amount equals the authoritative payment amount. Confirm one `promotion_restorations` row, exact per-ledger allocation restoration, unchanged original expiry, one notification, and no changes to payments or rider/team settlement.
11. Repeat the refund event. Confirm no second restoration or notification. Test a partial refund, `replacement_adjustment`, `legacy_unknown`, and additional-payment refund; none may restore promotional value.
12. Expire an original credit before processing the full refund. Confirm the audit/restoration row exists but the ledger remains unavailable and is not extended.
13. Finalize a coupon promotion and complete a full refund. Confirm the redemption becomes `reversed`, remains auditable, no longer counts toward usage, and can only be reused if current active/start/expiry/global/per-user/first-order rules pass. An expired or inactive coupon remains unusable.
14. Verify the current first-order rule exactly: coupon eligibility checks for an order with `payment_status='success'`. A product payment changed to `refunded` no longer satisfies that check; a reimbursement-only path that leaves payment status `success` remains ineligible. Owner approval is required before changing that existing definition.

## First-order-only coupon correction

15. Use the centralized `is_first_order_coupon_eligible(user_id, exclude_order_id)` helper. A normal successful paid order consumes eligibility. A processed, amount-matching `full_order` refund or completed, amount-matching full reimbursement excludes that prior order from the history. Partial, replacement, legacy/unknown, requested, approved, processing, failed, or partial reimbursement states continue to consume eligibility.
16. Pass the current checkout order ID as the exclusion argument. Confirm it cannot count as a previous order merely because it was created before coupon reservation.
17. After a genuine full reversal, verify first-order coupon reuse still applies current active/start/expiry/global/per-user/max-₦400/no-stacking rules. Expired and inactive coupons remain rejected.

## Cleanup

Confirm the five-minute cleanup job exists only where `pg_cron` is available. Run cleanup twice; the second run must produce no additional ledger restoration, redemption, notification, or order change. Roll back the staging transaction and remove only test fixtures created for this verification.
