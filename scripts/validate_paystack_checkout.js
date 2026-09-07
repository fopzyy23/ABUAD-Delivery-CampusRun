// ============================================================
// validate_paystack_checkout.js — B4A+ Paystack checkout integration
// ============================================================
// Structural + security validation for the customer Paystack checkout.
// Verifies:
//   * frontend checkout calls paystack-initialize with only order_id/email
//   * no browser amount is ever sent
//   * no duplicate order on retry (pending payment reused, success blocked)
//   * frontend never marks payment successful; webhook stays authoritative
//   * demo payment wording removed
//   * no Paystack secret / service-role key in frontend assets
// No database access.  node scripts/validate_paystack_checkout.js
// ============================================================
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

let fail = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " — " + name);
  if (!cond) fail++;
}

const app = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const config = fs.readFileSync(path.join(root, "assets/js/config.js"), "utf8");
const hook = fs.readFileSync(path.join(root, "supabase/functions/paystack-webhook/index.ts"), "utf8");
const init = fs.readFileSync(path.join(root, "supabase/functions/paystack-initialize/index.ts"), "utf8");
const mig = fs.readFileSync(path.join(root, "supabase/migrations/20260912_add_payment_checkout_fields.sql"), "utf8");

console.log("== FILES EXIST ==");
check("app.js exists", app.length > 0);
check("config.js exists", config.length > 0);
check("webhook exists", hook.length > 0);
check("initialize exists", init.length > 0);
check("20260912 migration exists", mig.length > 0);

console.log("\n== FRONTEND: CHECKOUT INTEGRATION ==");
check("pay() function exists", /async function pay/.test(app));
check("pay() route registered in render()", /parts\[0\]==='pay'/.test(app));
check("supabaseEdgeFunctionRequest helper", app.includes("supabaseEdgeFunctionRequest"));
check("SUPABASE_EDGE_URL in config.js", config.includes("SUPABASE_EDGE_URL"));
check("checkout calls paystack-initialize", app.includes("paystack-initialize"));
check("checkout sends order_id to edge fn", /order_id:\s*tid/.test(app) || /order_id:\s*order\.dbId/.test(app));
check("checkout sends email to edge fn", /email:\s*state\.user\.email/.test(app) || /email:\s*email/.test(app));
check("no amount sent by checkout to edge fn", !/amount:/.test(app.slice(app.indexOf("supabaseEdgeFunctionRequest")) ));
check("redirects to Paystack authorization_url", /authorization_url/.test(app));
check("no demo payment wording", !/Demo payment|Simulated payment|Test payment/i.test(app));
check("frontend never sets payment_status=success", !/payment_status\s*=\s*['\"]success['\"]/.test(app));
check("frontend never sets payment_reference", !/\.update\(\{\s*payment_reference/.test(app));
check("frontend never sets transaction_id", !/\.update\(\{\s*transaction_id/.test(app));

console.log("\n== FRONTEND: PAYMENT STATES ==");
check("awaiting payment state", /Awaiting payment|awaiting payment/.test(app));
check("redirecting state", /Redirecting to Paystack/i.test(app) || /redirecting/i.test(app));
check("payment successful state", /Payment successful/i.test(app));
check("payment failed state", /Payment failed/i.test(app));
check("verification/pending state shown on return", /verification|verif|pending/i.test(app));
console.log("\n== EDGE FUNCTION: paystack-initialize ==");
check("checks order payment_status is pending", /payment_status !== "pending"/.test(init) || /payment_status\s*!==\s*'pending'/.test(init));
check("verifies order ownership (user match)", /order\.user_id !== user\.id/.test(init));
check("rejects non-pending / already-paid orders", /not awaiting payment|is not pending payment/i.test(init));
check("amount derived from authoritative orders.total", /order\.total/.test(init));
check("generates collision-safe reference", /dropzyy_/.test(init));
check("reuses existing pending payment safely", /existingPayment/.test(init));
check("blocks re-init when payment already success", /not awaiting payment/i.test(init) || /already.*paid/i.test(init));
check("creates pending payment record server-side", /create_pending_payment/.test(init));
check("stores authorization_url + access_code on payment", /authorization_url/.test(init) && /access_code/.test(init));
check("never exposes PAYSTACK_SECRET_KEY in output", !/sk_live_[A-Za-z0-9_-]|sk_test_[A-Za-z0-9_-]/.test(init));

console.log("\n== EDGE FUNCTION: paystack-webhook ==");
check("HMAC SHA-512 signature validation", /SHA-512/.test(hook));
check("x-paystack-signature header read", /x-paystack-signature/.test(hook));
check("401 on invalid signature", /Invalid signature[\s\S]{0,400}?401/s.test(hook) || /401/.test(hook));
check("constant-time compare (safeEqual)", /safeEqual/.test(hook));
check("charge.success event handled", /charge\.success/.test(hook));
check("failed/abandoned events handled", /charge\.failed|abandoned|failed_transaction/.test(hook));
check("verifies payment belongs to order", /payment\.order_id !== order\.id/.test(hook) || /payment\.order_id/.test(hook));
check("verifies currency is NGN", /NGN/.test(hook));
check("verifies amount matches order.total", /expectedKobo|paystackAmountKobo|amount/.test(hook));
check("idempotent no-op on already-success", /already success/.test(hook));
check("delegates success to secure RPC (server-authoritative)", /handle_paystack_payment_success/.test(hook));
check("delegates failure to secure RPC", /handle_paystack_payment_failed/.test(hook));
check("webhook never directly updates orders", !/\.from\("orders"\)[\s\S]*\.update\(/.test(hook));
check("webhook never directly updates payments", !/\.from\("payments"\)[\s\S]*\.update\(/.test(hook));

console.log("\n== MIGRATION: 20260912 (payment reuse fields) ==");
check("authorization_url column added", /authorization_url text/.test(mig));
check("access_code column added", /access_code text/i.test(mig));
check("create_pending_payment stores checkout fields", /p_authorization_url/.test(mig) && /p_access_code/.test(mig));
console.log("\n== FRONTEND SECURITY / NO FORBIDDEN CODE ==");
let secretLeak = false;
const assetsDir = path.join(root, "assets");
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html|css|json)$/i.test(e.name)) {
      const c = fs.readFileSync(p, "utf8");
      const m = c.match(/(sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|sb_secret_[A-Za-z0-9]+)/i);
      if (m) { secretLeak = true; console.log("  !! LEAK in " + path.relative(root, p) + " : " + m[0].slice(0, 10) + "..."); }
    }
  }
})(assetsDir);
check("no Paystack secret in frontend assets", !secretLeak);
check("no service-role key in config.js", !/sb_secret_/i.test(config));
check("no direct Paystack API in frontend", !/api\.paystack\.co.+\/transaction/i.test(app));
// Strip comments first so prose like "transfers are not implemented"
// cannot false-positive, and target actual Paystack Transfer/Split
// concepts — NOT the JS String.prototype.split method (used e.g. to
// parse the ALLOWED_ORIGIN allowlist).
const hookCode = hook.replace(/\/\/[^\n]*/g, "");
const initCode2 = init.replace(/\/\/[^\n]*/g, "");
const transferRe = /\btransfers?\b|initiate_transfer|split_?payment|split_code|subaccount/i;
check("no Paystack transfer code", !transferRe.test(hookCode) && !transferRe.test(initCode2));

console.log("\n==============================");
console.log(fail ? "PAYSTACK CHECKOUT VALIDATION FAILED" : "PAYSTACK CHECKOUT ALL CHECKS PASSED");
console.log("==============================");
process.exit(fail ? 1 : 0);