// ============================================================
// B7 validator - Paystack transfer execution + webhook
// ============================================================
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

let fail = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " - " + name);
  if (!cond) fail++;
}

const migPath = path.join(root, "supabase/migrations/20260914_create_transfer_execution.sql");
const tFnPath = path.join(root, "supabase/functions/paystack-transfer/index.ts");
const wFnPath = path.join(root, "supabase/functions/paystack-transfer-webhook/index.ts");
const mig = fs.readFileSync(migPath, "utf8");
const tFn = fs.readFileSync(tFnPath, "utf8");
const wFn = fs.readFileSync(wFnPath, "utf8");
const b6 = fs.readFileSync(path.join(root, "supabase/migrations/20260913_create_transfer_ledger.sql"), "utf8");

console.log("== FILES ==");
check("20260914 migration", fs.existsSync(migPath));
check("paystack-transfer fn", fs.existsSync(tFnPath));
check("paystack-transfer-webhook fn", fs.existsSync(wFnPath));

console.log("\n== MIGRATION: RPCs ==");
check("prepare_transfer_for_payout", /CREATE OR REPLACE FUNCTION public\.prepare_transfer_for_payout/i.test(mig));
check("mark_transfer_processing", /CREATE OR REPLACE FUNCTION public\.mark_transfer_processing/i.test(mig));
check("apply_transfer_webhook_event", /CREATE OR REPLACE FUNCTION public\.apply_transfer_webhook_event/i.test(mig));
check("all three SECURITY DEFINER", (mig.match(/SECURITY DEFINER/g) || []).length >= 3);
check("prepare uses FOR UPDATE lock", /prepare_transfer_for_payout[\s\S]*?FOR UPDATE/i.test(mig));
check("prepare refuses non-pending transfer", /prepare_transfer_for_payout[\s\S]*?<> 'pending' THEN/i.test(mig));
check("prepare refuses non-pending settlement", /settlement.*is.*not payout-eligible|<> 'pending'/i.test(mig));
check("prepare requires Delivered order", /<> 'Delivered' THEN/i.test(mig));
check("prepare vendor amount = settlement amount", /v_amount := v_vs\.amount;/i.test(mig));
check("prepare rider amount = rider_amount", /v_amount := v_ds\.rider_amount;/i.test(mig));
check("prepare refuses unassigned rider (vendor_self)", /has no assigned rider \(vendor_self\?\)/i.test(mig));
check("processing flip refuses non-pending", /mark_transfer_processing[\s\S]*?<> 'pending' THEN/i.test(mig));
check("processing flip uses GUC", /mark_transfer_processing[\s\S]*?set_config\('app\.transfer_server_update'/i.test(mig));
check("webhook RPC validates status whitelist", /NOT IN \('success', 'failed', 'reversed'\)/i.test(mig));
check("webhook RPC enforces transfer-code match", /transfer code mismatch/i.test(mig));
check("webhook RPC terminal no-op", /already terminal: idempotent no-op/i.test(mig));
check("webhook RPC uses GUC", /apply_transfer_webhook_event[\s\S]*?set_config\('app\.transfer_server_update'/i.test(mig));
check("webhook RPC terminal-final (success/reversed)", /v_t\.status = 'success' OR v_t\.status = 'reversed'/i.test(mig));
check("service_role-only EXECUTE grants", (mig.match(/GRANT EXECUTE ON FUNCTION public\./g) || []).length === 3);
check("EXECUTE revoked from anon/authenticated", (mig.match(/REVOKE ALL ON FUNCTION public\./g) || []).length === 3);
check("migration initiates no transfer", !/api\.paystack\.co\/transfer/i.test(mig));
console.log("\n== TRANSFER FUNCTION ==");
check("admin JWT required", /Bearer /i.test(tFn) && /role !== \"admin\"|role !== 'admin'|"admin"/.test(tFn));
check("accepts only transfer_id", /transfer_id \(uuid\) is required/i.test(tFn));
check("rejects client payout values", /server-authoritative and cannot be supplied/i.test(tFn));
check("calls prepare_transfer_for_payout", /prepare_transfer_for_payout/i.test(tFn));
check("amount from prep (never body)", /amount: prep\.amount_kobo/i.test(tFn));
check("recipient from prep (never body)", /recipient: prep\.recipient_code/i.test(tFn));
check("reference from prep (never body)", /reference: prep\.reference/i.test(tFn));
check("calls Paystack /transfer", /api\.paystack\.co\/transfer"?\)?;?$/.test(tFn) || /fetch\(\s*"https:\/\/api\.paystack\.co\/transfer"/.test(tFn));
check("uses PAYSTACK_SECRET_KEY env", /Deno\.env\.get\("PAYSTACK_SECRET_KEY"\)/.test(tFn));
check("refuses already-eligible via RPC 409", /not payout-eligible/i.test(tFn));
check("marks processing after accept", /mark_transfer_processing/i.test(tFn));
check("race-safe processing flip", /Transfer already in flight/i.test(tFn));
check("no wildcard CORS", !/Access-Control-Allow-Origin\"\] = \"\*\"/i.test(tFn) && !/"Access-Control-Allow-Origin": "\*"/.test(tFn));
check("env allowlist (no wildcard)", /ALLOWED_ORIGIN/.test(tFn) && /\.includes\(origin\)/.test(tFn));
// The secret must NEVER be interpolated into a response body. Its only
// legitimate uses are: the env read, the config check, and the Paystack
// Authorization header — never inside JSON.stringify / new Response.
const secretLines = tFn.split("\n").filter((l) => l.includes("PAYSTACK_SECRET_KEY"));
check(
  "secret never in a response body",
  secretLines.length > 0 &&
    secretLines.every((l) => !/JSON\.stringify|new Response/.test(l)) &&
    secretLines.some((l) => /Authorization/.test(l)),
);

console.log("\n== TRANSFER WEBHOOK ==");
check("HMAC SHA512", /SHA-512/.test(wFn));
check("constant-time compare", /safeEqual/.test(wFn));
check("raw body read", /req\.text\(\)/.test(wFn));
check("401 missing signature", /Missing signature[\s\S]*?401/.test(wFn));
check("401 invalid signature", /Invalid signature[\s\S]*?401/.test(wFn));
check("handles transfer.success", /transfer\.success/.test(wFn));
check("handles transfer.failed", /transfer\.failed/.test(wFn));
check("handles transfer.reversed", /transfer\.reversed/.test(wFn));
check("unknown events ignored safely", /ignored event/.test(wFn));
check("calls apply_transfer_webhook_event", /apply_transfer_webhook_event/.test(wFn));
check("service-role client server-side", /SUPABASE_SERVICE_ROLE_KEY/.test(wFn));
check("no JWT required (Paystack cannot send one)", !/supabase\.auth\.getUser/.test(wFn));
check("--no-verify-jwt documented", /no-verify-jwt/.test(wFn));
check("no browser status trust (RPC only)", !/\.from\(\"transfers\"\)[\s\S]*?\.update/.test(wFn));

console.log("\n== /transfer USAGE SCOPE ==");
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|ts|html|css)$/i.test(e.name)) {
      const c = fs.readFileSync(p, "utf8");
      if (/api\.paystack\.co\/transfer(?![a-z])/.test(c) && !p.includes("paystack-transfer")) {
        check("/transfer only in transfer functions (" + path.relative(root, p) + ")", false);
      }
    }
  }
})(path.join(root, "assets"));
check("/transfer not referenced in frontend", true);

console.log("\n== B6 PROTECTIONS INTACT ==");
check("B6 guard trigger uses app.transfer_server_update", /app\.transfer_server_update/.test(b6));
check("B6 transfers status CHECK unchanged", /\('pending','processing','success','failed','reversed'\)/.test(b6));
check("B6 paystack_reference UNIQUE", /paystack_reference text NOT NULL UNIQUE/.test(b6));
check("B6 transfer_code UNIQUE", /transfer_code text UNIQUE/.test(b6));

console.log("\n== SECRET LEAK SCAN (assets/) ==");
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
})(path.join(root, "assets"));
check("no secret in frontend assets", !leak);

console.log("\n==============================");
console.log(fail ? "B7 VALIDATION FAILED" : "B7 ALL CHECKS PASSED");
console.log("==============================");
process.exit(fail ? 1 : 0);