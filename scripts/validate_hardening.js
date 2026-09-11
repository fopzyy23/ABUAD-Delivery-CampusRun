// Post-review hardening validator — 20260930 + 20261002 + EF changes
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
let fail = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " — " + name);
  if (!cond) fail++;
}

const mig30 = fs.readFileSync(path.join(root, "supabase/migrations/20260930_critical_hardening.sql"), "utf8");
const mig01 = fs.readFileSync(path.join(root, "supabase/migrations/20261001_rider_pool_payment_visibility.sql"), "utf8");
const mig02Path = path.join(root, "supabase/migrations/20261002_close_delivery_hijack_and_transfer_toctou.sql");
const mig02 = fs.readFileSync(mig02Path, "utf8");
const initFn = fs.readFileSync(path.join(root, "supabase/functions/paystack-initialize/index.ts"), "utf8");
const transferFn = fs.readFileSync(path.join(root, "supabase/functions/paystack-transfer/index.ts"), "utf8");
const webhookFn = fs.readFileSync(path.join(root, "supabase/functions/paystack-webhook/index.ts"), "utf8");
const refundFn = fs.readFileSync(path.join(root, "supabase/functions/paystack-refund/index.ts"), "utf8");
const adminJs = fs.readFileSync(path.join(root, "assets/js/admin.js"), "utf8");

console.log("== FILES ==");
check("20260930 migration exists", fs.existsSync(path.join(root, "supabase/migrations/20260930_critical_hardening.sql")));
check("20261002 migration exists", fs.existsSync(mig02Path));

console.log("\n== 20260930 PAYMENT RPC LOCKDOWN ==");
check("create_pending_payment EXECUTE revoked from PUBLIC/anon/authenticated", /'create_pending_payment'[\s\S]{0,2000}REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated/.test(mig30));
check("handle_paystack_payment_success locked", /'handle_paystack_payment_success'/.test(mig30));
check("handle_paystack_payment_failed locked", /'handle_paystack_payment_failed'/.test(mig30));
check("service_role granted for payment RPCs", /GRANT EXECUTE ON FUNCTION %s TO service_role/.test(mig30));

console.log("\n== 20260930 DIRECT INSERT lockdown ==");
check("orders INSERT revoked from anon+authenticated", /REVOKE INSERT ON public\.orders FROM anon, authenticated/.test(mig30));
check("order_items INSERT revoked from anon+authenticated", /REVOKE INSERT ON public\.order_items FROM anon, authenticated/.test(mig30));
check("orders_insert_own policy dropped", /DROP POLICY IF EXISTS "orders_insert_own"/.test(mig30));
check("order_items_insert_own policy dropped", /DROP POLICY IF EXISTS "order_items_insert_own"/.test(mig30));

console.log("\n== 20260930 QTY CAP ==");
check("quantity upper cap 1..99", /1\s*\.\.\s*99/.test(mig30));

console.log("\n== 20260930 DELIVERY SETTLEMENTS FK ==");
check("rider_id references public.riders(id)", /delivery_settlements[\s\S]*?rider_id[\s\S]{0,400}REFERENCES public\.riders\s*\(id\)/.test(mig30) || /REFERENCES public\.riders\s*\(id\)[\s\S]{0,400}delivery_settlements/.test(mig30));

console.log("\n== 20260930 generate_settlement ADMIN GATE ==");
check("is_admin() gate present", /generate_settlement[\s\S]{0,1500}IF NOT public\.is_admin\(\)[\s\S]{0,200}admin privileges required/.test(mig30));
check("rider recipient via riders.user_id", /generate_settlement[\s\S]{0,4000}public\.riders[\s\S]{0,200}user_id/.test(mig30));

console.log("\n== 20260930 REFUND HARDENING ==");
check("refunds status check includes 'processing'", /refunds_status_check[\s\S]{0,800}'processing'/.test(mig30));
check("approve_refund accepts failed", /approve_refund[\s\S]{0,300}('requested'|'failed')/.test(mig30));
check("claim_refund_for_execution defined", /CREATE OR REPLACE FUNCTION public\.claim_refund_for_execution/.test(mig30));
check("release_stuck_refund defined", /CREATE OR REPLACE FUNCTION public\.release_stuck_refund/.test(mig30));
check("claim_refund_for_execution service_role only", /REVOKE ALL ON FUNCTION public\.claim_refund_for_execution[^\n]*FROM PUBLIC, anon, authenticated/.test(mig30) && /GRANT EXECUTE ON FUNCTION public\.claim_refund_for_execution[^\n]*TO service_role/.test(mig30));
check("refunds_select_admin policy", /CREATE POLICY "refunds_select_admin"/.test(mig30));

console.log("\n== 20261001 RIDER POOL PAYMENT GATE ==");
check("orders_select_unassigned requires payment_status = success", /orders_select_unassigned[\s\S]{0,600}payment_status = 'success'/.test(mig01));
check("claim branch requires OLD paid", /enforce_order_status_transitions[\s\S]{0,2500}OLD\.payment_status = 'success'/.test(mig01));

console.log("\n== 20261002 DELIVERY-METHOD HIJACK GUARD ==");
check("guard blocks non-both delivery_method flips", /NEW\.delivery_method IS DISTINCT FROM OLD\.delivery_method[\s\S]{0,400}OLD\.delivery_method <> 'both'[\s\S]{0,400}RAISE EXCEPTION 'delivery_method can only be changed from ''both''/.test(mig02));
check("guard runs before the no-status-change early return", (() => {
  const idxGuard = mig02.indexOf("NEW.delivery_method IS DISTINCT");
  const idxEarly = mig02.indexOf("No status change: nothing to validate");
  return idxGuard >= 0 && idxEarly > idxGuard;
})());

console.log("\n== 20261002 DOUBLE-PAYMENT RACE ==");
check("partial unique index on payments(order_id) WHERE pending", /CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_pending_per_order[\s\S]{0,200}WHERE status = 'pending'/.test(mig02));
check("paystack-initialize handles 23505 race", /paymentErr\.code === "23505"/.test(initFn));
check("paystack-initialize reuses winner on race", /raceWinner[\s\S]{0,300}reused: true/.test(initFn));

console.log("\n== 20261002 TRANSFER TOCTOU ==");
check("claim_transfer_for_execution defined", /CREATE OR REPLACE FUNCTION public\.claim_transfer_for_execution/.test(mig02));
check("claim flips to processing", /claim_transfer_for_execution[\s\S]{0,5000}SET status = 'processing'/m.test(mig02));
check("claim returns authoritative payout values", /claim_transfer_for_execution[\s\S]{0,5000}recipient_code[\s\S]{0,500}'claim', true/.test(mig02));
check("release_transfer_for_retry defined", /CREATE OR REPLACE FUNCTION public\.release_transfer_for_retry/.test(mig02));
check("record_transfer_code defined", /CREATE OR REPLACE FUNCTION public\.record_transfer_code/.test(mig02));
check("transfer RPCs service_role only", /REVOKE ALL ON FUNCTION public\.claim_transfer_for_execution\(uuid\) FROM PUBLIC, anon, authenticated[\s\S]*?REVOKE ALL ON FUNCTION public\.release_transfer_for_retry\(uuid\) FROM PUBLIC, anon, authenticated[\s\S]*?REVOKE ALL ON FUNCTION public\.record_transfer_code\(uuid, text\) FROM PUBLIC, anon, authenticated/.test(mig02));

console.log("\n== 20261002 ORDERS FEE CHECK ==");
check("orders_fee_check (fee >= 0)", /ALTER TABLE public\.orders ADD CONSTRAINT orders_fee_check CHECK \(fee >= 0\)/.test(mig02));

console.log("\n== paystack-transfer USES CLAIM-FIRST ==");
check("calls claim_transfer_for_execution before Paystack", /claim_transfer_for_execution[\s\S]{0,1200}api\.paystack\.co\/transfer/.test(transferFn));
check("handles claim=false (already processing)", /claim === false[\s\S]{0,200}already being processed/.test(transferFn));
check("releases claim on missing prereqs", /release_transfer_for_retry[\s\S]{0,200}missing payout prerequisites/.test(transferFn));
check("releases claim on Paystack refusal", /!paystackRes\.ok[\s\S]{0,600}release_transfer_for_retry/.test(transferFn));
check("records transfer code after success", /record_transfer_code/.test(transferFn));
check("no mark_transfer_processing post-call", !/mark_transfer_processing/.test(transferFn));

console.log("\n== paystack-webhook RETRIES ON RPC FAILURE ==");
check("success RPC failure returns 500", /handle_paystack_payment_success[\s\S]{0,600}status:\s*500/.test(webhookFn));
check("failed RPC failure returns 500", /handle_paystack_payment_failed[\s\S]{0,600}status:\s*500/.test(webhookFn));

console.log("\n== paystack-refund APPLY FAILURE ==");
check("apply_refund_result failure returns 500 (not 200)", /apply_refund_result failed[\s\S]{0,400}json\(req, 500/.test(refundFn));
check("no 200 'processed' on apply failure", !/warning:.*local record update failed[\s\S]{0,120}status:\s*200/.test(refundFn));

console.log("\n== admin.js CATALOG XSS ==");
check("product form vendor option escaped", /<option value="\$\{escHtml\(v\.id\)\}"[^>]*>\$\{escHtml\(v\.name\)\}<\/option>/.test(adminJs));
check("vendors table name escaped", /<td>\$\{v\.icon\}\s*<b>\$\{escHtml\(v\.name\)\}<\/b><\/td>/.test(adminJs));
check("products table name escaped", /<b>\$\{escHtml\(p\.name\)\}<\/b>/.test(adminJs));
check("products table vendor name escaped", /\$\{vendor \? escHtml\(vendor\.name\) : '—'\}/.test(adminJs));
check("products table category escaped", /\$\{escHtml\(p\.category\)\}/.test(adminJs));
check("user-vendor select option escaped", /<option value="\$\{escHtml\(v\.id\)\}" \$\{user\.vendor_id === v\.id[\s\S]{0,80}escHtml\(v\.name\)/.test(adminJs));

console.log("\n==============================");
console.log(fail ? "HARDENING VALIDATION FAILED (" + fail + " failures)" : "HARDENING ALL CHECKS PASSED");
console.log("==============================");
process.exit(fail ? 1 : 0);