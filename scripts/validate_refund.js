// Refund infrastructure validator — full refund system
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
let fail = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " — " + name);
  if (!cond) fail++;
}

const mig19 = fs.readFileSync(path.join(root, "supabase/migrations/20260919_create_refund_infrastructure.sql"), "utf8");
const mig20 = fs.readFileSync(path.join(root, "supabase/migrations/20260920_create_refund_workflow.sql"), "utf8");
const mig21 = fs.readFileSync(path.join(root, "supabase/migrations/20260921_create_refund_notifications.sql"), "utf8");
const refundFn = fs.readFileSync(path.join(root, "supabase/functions/paystack-refund/index.ts"), "utf8");

console.log("== FILES ==");
check("migration 20260919 exists", fs.existsSync(path.join(root, "supabase/migrations/20260919_create_refund_infrastructure.sql")));
check("migration 20260920 exists", fs.existsSync(path.join(root, "supabase/migrations/20260920_create_refund_workflow.sql")));
check("paystack-refund Edge Function exists", fs.existsSync(path.join(root, "supabase/functions/paystack-refund/index.ts")));

console.log("\n== PAYMENT STATUS CHECK (20260919) ==");
check("orders allows 'refunded'", /orders_payment_status_check[\s\S]*?'refunded'/i.test(mig19));

console.log("\n== REFUNDS STATUS CHECK (20260920) ==");
check("status allows 'requested'", /'requested'/.test(mig20));
check("status allows 'approved'", /'approved'/.test(mig20));
check("status allows 'rejected'", /'rejected'/.test(mig20));
check("status allows 'pending'", /'pending'/.test(mig20));
check("status allows 'processed'", /'processed'/.test(mig20));
check("status allows 'failed'", /'failed'/.test(mig20));

console.log("\n== INITIATE_REFUND RPC (20260919) ==");
check("fn exists", /CREATE OR REPLACE FUNCTION public\.initiate_refund/i.test(mig19));
check("SECURITY DEFINER", /initiate_refund[\s\S]*?SECURITY DEFINER/i.test(mig19));
check("locks payment FOR UPDATE", /initiate_refund[\s\S]*?WHERE id = p_payment_id[\s\S]*?FOR UPDATE/i.test(mig19));
check("verifies status success", /initiate_refund[\s\S]*?only payments with status/i.test(mig19));
check("verifies transaction_id present", /initiate_refund[\s\S]*?no transaction_id/i.test(mig19));
check("checks existing refund", /initiate_refund[\s\S]*?ORDER BY created_at DESC/i.test(mig19));
check("does not call Paystack", !/initiate_refund[\s\S]*?https:\/\/api\.paystack/i.test(mig19));

console.log("\n== APPLY_REFUND_RESULT RPC (20260919) ==");
check("fn exists", /CREATE OR REPLACE FUNCTION public\.apply_refund_result/i.test(mig19));
check("SECURITY DEFINER", /apply_refund_result[\s\S]*?SECURITY DEFINER/i.test(mig19));
check("locks refund FOR UPDATE", /apply_refund_result[\s\S]*?WHERE id = p_refund_id[\s\S]*?FOR UPDATE/i.test(mig19));
check("terminal idempotency guard", /apply_refund_result[\s\S]*?already processed/i.test(mig19));
check("uses order_server_update guard", /apply_refund_result[\s\S]*?app\.order_server_update/i.test(mig19));
check("sets payment refunded on success", /apply_refund_result[\s\S]*?status = 'refunded'/i.test(mig19));

console.log("\n== APPLY_REFUND_RESULT GUC VALUE (corrective 20260924 — structural) ==");
// The B1 trigger (20260907 prevent_order_unauthorized_changes) accepts exactly
// current_setting('app.order_server_update') = 'on'. The 20260919 definition
// set 'true'/'false', which the trigger treats as NOT opted in, so a successful
// refund aborted on the protected orders.payment_status update. The corrective
// migration 20260924 re-emits the function with 'on'/'off'. These checks target
// the EFFECTIVE (latest) definition, not the original 20260919 text.
const mig24Path = path.join(root, "supabase/migrations/20260924_fix_refund_guc_value.sql");
check("corrective migration 20260924 exists", fs.existsSync(mig24Path));
if (fs.existsSync(mig24Path)) {
  const mig24 = fs.readFileSync(mig24Path, "utf8");
  // Scope to the apply_refund_result function body only (up to the grants block).
  // Start at the CREATE statement — the header comment documents the OLD
  // 'true' value and must not be included in the GUC-value scans below.
  const fnStart = mig24.indexOf("CREATE OR REPLACE FUNCTION public.apply_refund_result");
  const fnEnd = mig24.indexOf("REVOKE ALL ON FUNCTION", fnStart);
  const fnBody = fnStart >= 0 && fnEnd > fnStart ? mig24.slice(fnStart, fnEnd) : "";
  check("redefines apply_refund_result", /CREATE OR REPLACE FUNCTION public\.apply_refund_result/.test(mig24));
  check("signature unchanged (uuid, boolean, text, text)", /apply_refund_result\s*\(\s*p_refund_id uuid\s*,\s*p_success boolean\s*,\s*p_gateway_refund_id text\s+DEFAULT NULL\s*,\s*p_reason text\s+DEFAULT NULL\s*\)/i.test(mig24));
  check("SECURITY DEFINER preserved", /apply_refund_result[\s\S]*?SECURITY DEFINER/i.test(mig24));
  check("search_path = public preserved", /apply_refund_result[\s\S]*?SET search_path = public/i.test(mig24));
  check("success path sets app.order_server_update = 'on'", /set_config\('app\.order_server_update',\s*'on',\s*true\)/.test(fnBody));
  check("reset sets app.order_server_update = 'off'", /set_config\('app\.order_server_update',\s*'off',\s*true\)/.test(fnBody));
  check("no 'true' GUC value remains in function body", !/set_config\('app\.order_server_update',\s*'true'/.test(fnBody));
  check("no 'false' GUC value remains in function body", !/set_config\('app\.order_server_update',\s*'false'/.test(fnBody));
  check("B1 trigger accepts exactly 'on'", /COALESCE\(current_setting\('app\.order_server_update',\s*true\),\s*'off'\)\s*=\s*'on'/.test(fs.readFileSync(path.join(root, "supabase/migrations/20260907_lock_order_payment_columns.sql"), "utf8")));
  check("service_role-only EXECUTE preserved", /REVOKE ALL ON FUNCTION public\.apply_refund_result\(uuid, boolean, text, text\) FROM PUBLIC, anon, authenticated/.test(mig24) && /GRANT EXECUTE ON FUNCTION public\.apply_refund_result\(uuid, boolean, text, text\) TO service_role/.test(mig24));
}


console.log("\n== REQUEST_REFUND RPC (20260920) ==");
check("fn exists", /CREATE OR REPLACE FUNCTION public\.request_refund/i.test(mig20));
check("SECURITY DEFINER", /request_refund[\s\S]*?SECURITY DEFINER/i.test(mig20));
check("search_path public", /request_refund[\s\S]*?SET search_path = public/i.test(mig20));
check("takes p_order_id", /p_order_id uuid/i.test(mig20));
check("validates ownership auth.uid", /request_refund[\s\S]*?user_id != auth\.uid/i.test(mig20));
check("verifies successful payment", /request_refund[\s\S]*?status = 'success'/i.test(mig20));
check("creates status requested", /request_refund[\s\S]*?'requested'/i.test(mig20));
check("does not take amount from caller", !/p_amount/i.test(mig20));

console.log("\n== APPROVE_REFUND RPC (20260920) ==");
check("fn exists", /CREATE OR REPLACE FUNCTION public\.approve_refund/i.test(mig20));
check("SECURITY DEFINER", /approve_refund[\s\S]*?SECURITY DEFINER/i.test(mig20));
check("uses is_admin()", /approve_refund[\s\S]*?is_admin/i.test(mig20));
check("locks refund FOR UPDATE", /approve_refund[\s\S]*?FOR UPDATE/i.test(mig20));
check("validates status requested", /only ''requested'' refunds can be approved/i.test(mig20));
check("transitions to approved", /approve_refund[\s\S]*?status = 'approved'/i.test(mig20));

console.log("\n== REJECT_REFUND RPC (20260920) ==");
check("fn exists", /CREATE OR REPLACE FUNCTION public\.reject_refund/i.test(mig20));
check("SECURITY DEFINER", /reject_refund[\s\S]*?SECURITY DEFINER/i.test(mig20));
check("uses is_admin()", /reject_refund[\s\S]*?is_admin/i.test(mig20));
check("validates status requested", /only ''requested'' refunds can be rejected/i.test(mig20));
check("transitions to rejected", /reject_refund[\s\S]*?status = 'rejected'/i.test(mig20));
check("records rejection reason", /reject_refund[\s\S]*?COALESCE\(p_reason/i.test(mig20));

console.log("\n== SECURITY LOCKDOWN (20260920) ==");
check("request_refund REVOKE from PUBLIC", /REVOKE ALL ON FUNCTION public\.request_refund[\s\S]*?FROM PUBLIC/i.test(mig20));
check("request_refund GRANT authenticated", /GRANT EXECUTE ON FUNCTION public\.request_refund[\s\S]*?TO authenticated/i.test(mig20));
check("approve_refund REVOKE from PUBLIC", /REVOKE ALL ON FUNCTION public\.approve_refund[\s\S]*?FROM PUBLIC/i.test(mig20));
check("approve_refund GRANT authenticated", /GRANT EXECUTE ON FUNCTION public\.approve_refund[\s\S]*?TO authenticated/i.test(mig20));
check("reject_refund REVOKE from PUBLIC", /REVOKE ALL ON FUNCTION public\.reject_refund[\s\S]*?FROM PUBLIC/i.test(mig20));
check("reject_refund GRANT authenticated", /GRANT EXECUTE ON FUNCTION public\.reject_refund[\s\S]*?TO authenticated/i.test(mig20));

console.log("\n== EDGE FUNCTION: AUTH ==");
check("admin JWT check (is_admin)", /is_admin/.test(refundFn));
check("Bearer token extraction", /Bearer /.test(refundFn));
check("token validation via getUser", /auth\.getUser/.test(refundFn));
check("401 on missing auth", /401.*Missing/.test(refundFn));
check("403 on non-admin", /403.*permission denied/.test(refundFn));

console.log("\n== EDGE FUNCTION: INPUT VALIDATION ==");
check("accepts only refund_id", /refund_id/.test(refundFn));
check("UUID validation for refund_id", /0-9a-f.{2}8.*0-9a-f.{2}4/i.test(refundFn));
check("rejects client refund values", /server-authoritative and cannot be supplied/.test(refundFn));

console.log("\n== EDGE FUNCTION: PAYSTACK CALL ==");
check("calls Paystack /refund endpoint", /api\.paystack\.co\/refund/.test(refundFn));
check("uses Bearer PAYSTACK_SECRET_KEY", /Authorization.*Bearer.*PAYSTACK_SECRET_KEY/.test(refundFn));
check("sends transaction_id in body", /transaction.*transaction_id/.test(refundFn));

console.log("\n== EDGE FUNCTION: STATUS HANDLING ==");
check("handles processed status (idempotent)", /already_processed/.test(refundFn));
check("handles rejected status (idempotent)", /"processed" \|\|[\s\S]{0,50}"rejected"/.test(refundFn));
check("blocks non-approved status", /only 'approved' refunds can be executed/.test(refundFn));
check("blocks failed status retry", /previously failed/.test(refundFn));

console.log("\n== EDGE FUNCTION: APPLY_REFUND_RESULT ==");
check("calls apply_refund_result on success", /apply_refund_result[\s\S]{0,300}p_success:\s*true/.test(refundFn));
check("calls apply_refund_result on failure", /apply_refund_result[\s\S]{0,300}p_success:\s*false/.test(refundFn));
check("passes gateway_refund_id", /gateway_refund_id/.test(refundFn));

console.log("\n== EDGE FUNCTION: CORS ==");
check("CORS allowlist (no wildcard)", /ALLOWED_ORIGIN/.test(refundFn));
check("Vary Origin header", /Vary.*Origin/.test(refundFn));
check("OPTIONS preflight handled", /OPTIONS/.test(refundFn));
check("no static wildcard ACAO", !/Access-Control-Allow-Origin.*"\*"/.test(refundFn));

console.log("\n== EDGE FUNCTION: ERROR RESPONSES ==");
check("400 invalid JSON", /400.*Invalid JSON/.test(refundFn));
check("404 refund not found", /404.*Refund not found/.test(refundFn));
check("502 Paystack failure", /502[\s\S]{0,100}Paystack/.test(refundFn));
check("500 internal error", /500.*Internal server error/.test(refundFn));

console.log("\n== NO DUPLICATED INFRASTRUCTURE ==");
// Strip SQL line comments (--) before checking for duplicates in code
const mig20Code = mig20.replace(/--[^\n]*/g, "");
check("no duplicate request_refund in mig19", !/request_refund/i.test(mig19));
check("no duplicate initiate_refund in mig20", !/initiate_refund/i.test(mig20Code));
check("no duplicate apply_refund_result in mig20", !/apply_refund_result/i.test(mig20Code));
check("no refunds table recreated in mig20", !/CREATE TABLE.*refunds/i.test(mig20Code));
check("no refund_items table (not needed)", !/refund_items/i.test(mig20Code));
check("no refund_audit table (not needed)", !/refund_audit/i.test(mig20Code));

console.log("\n== REFUND NOTIFICATION MIGRATION (20260921) ==");
check("migration 20260921 exists", fs.existsSync(path.join(root, "supabase/migrations/20260921_create_refund_notifications.sql")));
check("fn handle_refund_status_notifications exists", /CREATE OR REPLACE FUNCTION public\.handle_refund_status_notifications/i.test(mig21));
check("trigger trg_refund_status_notify exists", /trg_refund_status_notify/i.test(mig21));
check("trigger fires AFTER INSERT OR UPDATE", /AFTER INSERT OR UPDATE ON public\.refunds/i.test(mig21));
check("SECURITY DEFINER on trigger fn", /handle_refund_status_notifications[\s\S]*?SECURITY DEFINER/i.test(mig21));
check("search_path set to public", /SET search_path = public/i.test(mig21));

console.log("\n== REFUND NOTIFICATION: DUPLICATE PREVENTION ==");
check("checks OLD.status IS DISTINCT FROM NEW.status", /OLD\.status IS DISTINCT FROM NEW\.status/i.test(mig21));
check("skips INSERT for non-requested status", /TG_OP = 'INSERT'[\s\S]*?NEW\.status = 'requested'/i.test(mig21));
check("only fires on UPDATE when status changes", /TG_OP = 'UPDATE'[\s\S]*?IS DISTINCT FROM/i.test(mig21));

console.log("\n== REFUND NOTIFICATION: SUPPORTED STATUSES ==");
check("supports 'requested' status", /WHEN 'requested'/i.test(mig21));
check("supports 'approved' status", /WHEN 'approved'/i.test(mig21));
check("supports 'rejected' status", /WHEN 'rejected'/i.test(mig21));
check("supports 'processed' status", /WHEN 'processed'/i.test(mig21));
check("supports 'failed' status", /WHEN 'failed'/i.test(mig21));

console.log("\n== REFUND NOTIFICATION: CUSTOMER RELATIONSHIP ==");
check("looks up customer from orders table", /SELECT o\.user_id[\s\S]*?FROM public\.orders o/i.test(mig21));
check("uses related_order_id for notification", /related_order_id/i.test(mig21));
check("notification type is 'order_status'", /'order_status'/i.test(mig21));

console.log("\n== REFUND NOTIFICATION: FRONTEND DEDUP ==");
// Read app.js and check that the duplicate addNotification call is removed
const appJs = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
check("frontend does NOT call addNotification for refund requested", !/addNotification\(['"]Refund requested/i.test(appJs));

console.log("\n==============================");
console.log(fail ? "REFUND VALIDATION FAILED (" + fail + " failures)" : "REFUND ALL CHECKS PASSED");
console.log("==============================");
process.exit(fail ? 1 : 0);
