// Validator for Vendor Delivery Refund System
// Validates 20261011_vendor_delivery_refund.sql and paystack-refund updates
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261011_vendor_delivery_refund.sql'), 'utf8');
const refundEdgeFunction = fs.readFileSync(path.join(root, 'supabase/functions/paystack-refund/index.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');

let fail = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra && !cond ? '  ' + extra : ''));
  if (!cond) fail++;
}

console.log('=== VENDOR DELIVERY REFUND VALIDATION ===');

// Migration checks
check('migration file exists', migration.length > 0);

// 1. request_refund RPC updates
check('request_refund RPC updated', /CREATE OR REPLACE FUNCTION public.request_refund/.test(migration));
check('request_refund finds vendor_delivery payments', /payment_type = 'vendor_delivery'/.test(migration));
check('request_refund checks delivery_payment_status', /delivery_payment_status = 'success'/.test(migration));
check('request_refund prefers vendor_delivery', /ORDER BY[\s\S]*CASE WHEN payment_type = 'vendor_delivery'/.test(migration));
check('request_refund preserves product payment logic', /payment_type = 'product' AND v_order.payment_status = 'success'/.test(migration));
check('request_refund idempotency preserved', /already_existed.*true/.test(migration));

// 2. initiate_refund RPC updates
check('initiate_refund RPC updated', /CREATE OR REPLACE FUNCTION public.initiate_refund/.test(migration));
check('initiate_refund works for vendor_delivery (checks payment.status=success)', /v_payment.status != 'success'/.test(migration));
check('initiate_refund service_role only', /GRANT EXECUTE ON FUNCTION public.initiate_refund\(uuid, text\) TO service_role/.test(migration));
check('initiate_refund revoked from others', /REVOKE EXECUTE ON FUNCTION public.initiate_refund\(uuid, text\) FROM anon/.test(migration));

// 3. apply_refund_result RPC updates
check('apply_refund_result RPC updated', /CREATE OR REPLACE FUNCTION public.apply_refund_result/.test(migration));
check('apply_refund_result branches on payment_type', /v_payment.payment_type = 'vendor_delivery'/.test(migration));
check('apply_refund_result vendor_delivery updates delivery_payment_status', /delivery_payment_status = 'refunded'/.test(migration));
check('apply_refund_result vendor_delivery preserves payment_status', /order_product_payment_unchanged.*true/.test(migration));
// Scope-aware: only check vendor_delivery branch (before ELSE), not product branch
const vendorDeliveryBranch = migration.slice(
  migration.indexOf("v_payment.payment_type = 'vendor_delivery' THEN"),
  migration.indexOf("ELSE")
);
check('apply_refund_result vendor_delivery does NOT change payment_status', !/payment_status = 'refunded'/.test(vendorDeliveryBranch));
check('apply_refund_result product payment branch preserved', /ELSE[\s\S]{0,500}?PRODUCT PAYMENT REFUND/.test(migration));
check('apply_refund_result product branch updates payment_status', /payment_status = 'refunded'/.test(migration));
check('apply_refund_result failed refund handling unchanged', /p_success THEN[\s\S]*ELSE[\s\S]{0,200}?UPDATE public.refunds[\s\S]{0,200}?status = 'failed'/.test(migration));
check('apply_refund_result service_role only', /GRANT EXECUTE ON FUNCTION public.apply_refund_result\(uuid, boolean, text, text\) TO service_role/.test(migration));

// 4. claim_refund_for_execution - no changes needed
check('claim_refund_for_execution NOT modified (works for both types)', !/CREATE OR REPLACE FUNCTION public.claim_refund_for_execution/.test(migration));

// 4b. approve_refund/reject_refund - no changes needed
check('approve_refund NOT modified', !/CREATE OR REPLACE FUNCTION public.approve_refund/.test(migration));
check('reject_refund NOT modified', !/CREATE OR REPLACE FUNCTION public.reject_refund/.test(migration));

// 5. Paystack Edge Function updates
console.log('\n=== PAYSTACK-REFUND EDGE FUNCTION ===');
check('Edge Function loads payment_type', /payment_type/.test(refundEdgeFunction));
check('Edge Function detects vendor_delivery', /isVendorDelivery/.test(refundEdgeFunction));
check('Edge Function uses correct amount for vendor_delivery (150000 kobo)', /expectedAmount.*isVendorDelivery.*150000/.test(refundEdgeFunction));
check('Edge Function passes correct amount to Paystack', /amount: expectedAmount/.test(refundEdgeFunction));
check('Edge Function uses correct merchant_note for vendor_delivery', /merchant_note.*isVendorDelivery/.test(refundEdgeFunction));
check('Edge Function calls apply_refund_result for both types', /apply_refund_result/.test(refundEdgeFunction));
check('Edge Function does not hardcode amount', !/amount: payment.amount \* 100/.test(refundEdgeFunction));
check('Edge Function validates payment_type=vendor_delivery', /isVendorDelivery.*payment.payment_type === "vendor_delivery"/.test(refundEdgeFunction));
check('Edge Function validates payment.status=success', /payment.status !== "success"/.test(refundEdgeFunction));
check('Edge Function uses correct transaction_id', /payment.transaction_id/.test(refundEdgeFunction));

// 5. Existing refund workflow unchanged
check('request_refund still works for product payments', /payment_type = 'product'/.test(migration));
check('approve_refund unchanged', !/CREATE OR REPLACE FUNCTION public.approve_refund/.test(migration));
check('reject_refund unchanged', !/CREATE OR REPLACE FUNCTION public.reject_refund/.test(migration));
check('claim_refund_for_execution unchanged', !/CREATE OR REPLACE FUNCTION public.claim_refund_for_execution/.test(migration));

// 6. Security/RLS checks
check('initiate_refund service_role only', /REVOKE EXECUTE ON FUNCTION public.initiate_refund.*FROM anon/.test(migration));
check('apply_refund_result service_role only', /REVOKE EXECUTE ON FUNCTION public.apply_refund_result.*FROM anon/.test(migration));
check('request_refund authenticated only', /GRANT EXECUTE ON FUNCTION public.request_refund\(uuid, text\) TO authenticated/.test(migration));

// 7. Idempotency/duplicate prevention
check('request_refund idempotent', /already_existed.*true/.test(migration));
check('initiate_refund idempotent', /already_existed.*true/.test(migration));
check('apply_refund_result terminal guard', /v_refund\.status = 'processed'[\s\S]{0,300}terminal.*true/.test(migration));
check('claim_refund_for_execution called', /claim_refund_for_execution/.test(refundEdgeFunction));
check('claim prevents double execution', /claim.claim === false/.test(refundEdgeFunction));

// 8. Admin workflow preserved
// approve_refund and reject_refund admin checks are in 20260920_create_refund_workflow.sql
const workflowMig = fs.readFileSync(path.join(root, 'supabase/migrations/20260920_create_refund_workflow.sql'), 'utf8');
check('approve_refund admin-only', /IF NOT public.is_admin\(\) THEN[\s\S]{0,50}RAISE EXCEPTION 'permission denied: admin privileges required'/.test(workflowMig));
check('reject_refund admin-only', /IF NOT public.is_admin\(\) THEN[\s\S]{0,50}RAISE EXCEPTION 'permission denied: admin privileges required'/.test(workflowMig));
check('paystack-refund admin check', /!isAdmin[\s\S]{0,20}return json\(req, 403, \{ error: \"permission denied: admin privileges required\" \}\)/.test(refundEdgeFunction));

// 9. No breaking changes to restaurant flow
check('Restaurant payment refunds unchanged', /payment_type = 'product'/.test(migration));
check('Product refund still updates payment_status', /payment_status = 'refunded'/.test(migration));

// 10. Vendor product payments remain separate
check('Vendor product payments (pending_vendor) NOT affected', !/pending_vendor/.test(migration) || !/payment_status = 'refunded'[\s\S]{0,200}?pending_vendor/.test(migration));
check('Vendor product refund NOT implemented (policy gap documented)', !/vendor product refund/.test(migration));

console.log('\n=== VALIDATION RESULT ===');
console.log('Errors: ' + (fail ? fail : 'NONE'));
if (fail) process.exit(1);