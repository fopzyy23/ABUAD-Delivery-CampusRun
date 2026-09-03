// B4A validator — Paystack payment ledger + server-side handling
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
let fail = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " — " + name);
  if (!cond) fail++;
}
const mig = fs.readFileSync(path.join(root, "supabase/migrations/20260909_create_payments_ledger.sql"), "utf8");
const hook = fs.readFileSync(path.join(root, "supabase/functions/paystack-webhook/index.ts"), "utf8");
const init = fs.readFileSync(path.join(root, "supabase/functions/paystack-initialize/index.ts"), "utf8");
console.log("== FILES EXIST ==");
check("20260909 migration", mig.length > 0);
check("webhook", hook.length > 0);
check("initialize", init.length > 0);
console.log("\n== PAYMENTS TABLE ==");
check("table created", /CREATE TABLE IF NOT EXISTS public\.payments/i.test(mig));
check("id uuid pk", /id uuid PRIMARY KEY DEFAULT gen_random_uuid/i.test(mig));
check("order_id fk", /order_id uuid NOT NULL REFERENCES public\.orders/i.test(mig));
check("reference unique", /reference text NOT NULL UNIQUE/i.test(mig));
check("txn_id unique", /transaction_id bigint UNIQUE/i.test(mig));
check("amount>=0", /CHECK \(amount >= 0\)/i.test(mig));
check("currency NGN", /currency text NOT NULL DEFAULT 'NGN'/i.test(mig));
check("status chk", /CHECK \(status IN/.test(mig));
check("gateway paystack", /gateway text NOT NULL DEFAULT 'paystack'/i.test(mig));
check("raw_payload", /raw_payload jsonb/i.test(mig));
console.log("\n== INDEXES/PAID_AT/TRIGGER ==");
check("idx order_id", /idx_payments_order_id/i.test(mig));
check("idx status", /idx_payments_status/i.test(mig));
check("idx reference", /idx_payments_reference/i.test(mig));
check("orders.paid_at", /ALTER TABLE public\.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz/i.test(mig));
check("updated_at trigger", /trg_payments_set_updated_at/i.test(mig));
console.log("\n== RLS ==");
check("RLS on", /ENABLE ROW LEVEL SECURITY/i.test(mig));
check("read own", /customers_read_own_payments/i.test(mig));
check("no insert", /no_client_insert_payments/i.test(mig));
check("no update", /no_client_update_payments/i.test(mig));
check("no delete", /no_client_delete_payments/i.test(mig));
check("REVOKE", /REVOKE ALL ON public\.payments FROM anon, authenticated/i.test(mig));
check("GRANT SELECT", /GRANT SELECT ON public\.payments TO authenticated/i.test(mig));
console.log("\n== RPCS ==");
check("success fn", /CREATE OR REPLACE FUNCTION public\.handle_paystack_payment_success/i.test(mig));
check("failed fn", /CREATE OR REPLACE FUNCTION public\.handle_paystack_payment_failed/i.test(mig));
check("pending fn", /CREATE OR REPLACE FUNCTION public\.create_pending_payment/i.test(mig));
check("success DEFINER", /handle_paystack_payment_success[\s\S]*?SECURITY DEFINER/i.test(mig));
check("success GUC", /handle_paystack_payment_success[\s\S]*?set_config\('app\.order_server_update'/i.test(mig));
check("failed GUC", /handle_paystack_payment_failed[\s\S]*?set_config\('app\.order_server_update'/i.test(mig));
check("success FOR UPDATE", /handle_paystack_payment_success[\s\S]*?FOR UPDATE/i.test(mig));
check("success ownership", /handle_paystack_payment_success[\s\S]*?order_id != p_order_id/i.test(mig));

console.log("\n== WEBHOOK ==");
check("createClient", /createClient/.test(hook));
check("SUPABASE_URL env", /Deno\.env\.get\("SUPABASE_URL"\)/.test(hook));
check("SERVICE_ROLE env", /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(hook));
check("signature header", /x-paystack-signature/.test(hook));
check("HMAC SHA512", /SHA-512/.test(hook));
check("401 missing", /Missing signature[\s\S]*?401/.test(hook));
check("401 invalid", /Invalid signature[\s\S]*?401/.test(hook));
check("safeEqual", /safeEqual/.test(hook));
check("raw body", /req\.text\(\)/.test(hook));
check("charge.success", /charge\.success/.test(hook));
check("failed events", /charge\.failed|abandoned|failed_transaction/.test(hook));
check("event mapper", /paystackEventToStatus/.test(hook));
check("lookup by ref", /eq\("reference", reference\)/.test(hook));
check("fetch order", /from\("orders"\)[\s\S]*?eq\("id", payment\.order_id\)/.test(hook));
check("ownership check (delegates to secure RPC)", /p_order_id: payment\.order_id/.test(hook));
check("currency NGN", /NGN/.test(hook));
check("amount verify", /expectedKobo|paystackAmountKobo/.test(hook));
check("success RPC call", /handle_paystack_payment_success/.test(hook));
check("failed RPC call", /handle_paystack_payment_failed/.test(hook));
check("no direct orders update", !/\.from\("orders"\)[\s\S]?\.update/.test(hook));

console.log("\n== INITIALIZE ==");
check("pending RPC", /create_pending_payment/.test(init));
check("order_id param", /p_order_id: order\.id/.test(init));
check("reference param", /p_reference: reference/.test(init));
check("server total", /p_amount: Number\(order\.total\)/.test(init));
check("NGN param", /p_currency: "NGN"/.test(init));
check("error handle", /create_pending_payment failed/.test(init));
check("no browser amount", !/body\.amount|req\.amount/.test(init));
check("auth url", /authorization_url/.test(init));
check("access_code", /access_code/.test(init));
console.log("\n== B1 PRESERVED ==");
const b1 = fs.readFileSync(path.join(root, "supabase/migrations/20260907_lock_order_payment_columns.sql"), "utf8");
check("B1 fn", /CREATE OR REPLACE FUNCTION public\.prevent_order_unauthorized_changes/i.test(b1));
check("B1 payment_status", /payment_status IS DISTINCT FROM OLD\.payment_status/i.test(b1));
check("B1 payment_reference", /payment_reference IS DISTINCT FROM OLD\.payment_reference/i.test(b1));
check("B1 transaction_id", /transaction_id IS DISTINCT FROM OLD\.transaction_id/i.test(b1));
check("B1 subtotal", /subtotal IS DISTINCT FROM OLD\.subtotal/i.test(b1));
check("B1 GUC", /app\.order_server_update/i.test(b1));
console.log("\n== SECRET LEAK SCAN ==");
const assetsDir = path.join(root, "assets");
let leak = false;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html|css|json)$/i.test(e.name)) {
      const c = fs.readFileSync(p, "utf8");
      if (/sk_live_[A-Za-z0-9]/.test(c) || /sk_test_[A-Za-z0-9]/.test(c) || /sb_secret_[A-Za-z0-9]/.test(c)) {
        leak = true; console.log("  LEAK: " + path.relative(root, p));
      }
    }
  }
})(assetsDir);
check("no secret in assets", !leak);
console.log("\n==============================");
console.log(fail ? "B4A VALIDATION FAILED" : "B4A ALL CHECKS PASSED");
console.log("==============================");
process.exit(fail ? 1 : 0);
check("no direct payments update", !/\.from\("payments"\)[\s\S]?\.update/.test(hook));
check("no-op on success", /status === 'success'[\s\S]*?already success[\s\S]*?no-op/.test(hook));
check("200 on no-op", /status === 'success'[\s\S]*?200/.test(hook));
check("success sets ok", /handle_paystack_payment_success[\s\S]*?payment_status = 'success'/i.test(mig));
check("success paid_at", /handle_paystack_payment_success[\s\S]*?paid_at = now/i.test(mig));
check("failed no-overwrite", /handle_paystack_payment_failed[\s\S]*?status = 'success' THEN RETURN/i.test(mig));
check("failed sets failed", /handle_paystack_payment_failed[\s\S]*?payment_status = 'failed'/i.test(mig));
check("pending amount", /create_pending_payment[\s\S]*?p_amount != v_order_total/i.test(mig));
check("pending idempotency", /create_pending_payment[\s\S]*?reference = p_reference[\s\S]*?IF FOUND THEN/i.test(mig));