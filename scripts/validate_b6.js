// ============================================================
// B6 validator â€” Paystack transfer (payout) infrastructure
// ============================================================
// Structural + security checks over:
//   supabase/migrations/20260913_create_transfer_ledger.sql
//   supabase/functions/paystack-transfer-recipient/index.ts
//   assets/js/  (frontend â€” must NOT contain Paystack secrets)
// No database access.  node scripts/validate_b6.js
// ============================================================
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

let fail = 0;
function check(name, cond, extra = "") {
  console.log((cond ? "PASS" : "FAIL") + " â€” " + name + (extra && !cond ? "  " + extra : ""));
  if (!cond) fail++;
}

const migPath = path.join(root, "supabase/migrations/20260913_create_transfer_ledger.sql");
const recFnPath = path.join(root, "supabase/functions/paystack-transfer-recipient/index.ts");
const mig = fs.readFileSync(migPath, "utf8");
const recFn = fs.readFileSync(recFnPath, "utf8");

console.log("== FILES EXIST ==");
check("20260913_create_transfer_ledger.sql exists", fs.existsSync(migPath));
check("paystack-transfer-recipient/index.ts exists", fs.existsSync(recFnPath));

console.log("\n== TRANSFER_RECIPIENTS TABLE ==");
check("transfer_recipients created", /CREATE TABLE IF NOT EXISTS public\.transfer_recipients/i.test(mig));
check("id uuid pk", /id uuid PRIMARY KEY DEFAULT gen_random_uuid/i.test(mig));
check("payee_type vendor|rider check", /payee_type IN \('vendor','rider'\)/i.test(mig));
check("vendor_id FK to vendors", /vendor_id text REFERENCES public\.vendors\(id\)/i.test(mig));
check("profile_id FK to profiles", /profile_id uuid REFERENCES public\.profiles\(id\)/i.test(mig));
check("recipient_code not null unique", /recipient_code text NOT NULL UNIQUE/i.test(mig));
check("account_name column", /account_name text/i.test(mig));
check("bank_name column", /bank_name text/i.test(mig));
check("timestamps", /created_at timestamptz NOT NULL DEFAULT now\(\)/i.test(mig) && /updated_at timestamptz NOT NULL DEFAULT now\(\)/i.test(mig));
check("payee shape constraint (xor vendor/rider)", /transfer_recipients_payee_shape_check/i.test(mig));
check("one recipient per vendor (partial unique idx)", /uq_transfer_recipient_vendor[\s\S]*?WHERE payee_type = 'vendor'/i.test(mig));
check("one recipient per rider (partial unique idx)", /uq_transfer_recipient_rider[\s\S]*?WHERE payee_type = 'rider'/i.test(mig));

console.log("\n== TRANSFERS LEDGER TABLE ==");
check("transfers created", /CREATE TABLE IF NOT EXISTS public\.transfers/i.test(mig));
check("vendor_settlement_id FK", /vendor_settlement_id uuid UNIQUE REFERENCES public\.vendor_settlements\(id\)/i.test(mig));
check("delivery_settlement_id FK", /delivery_settlement_id uuid UNIQUE REFERENCES public\.delivery_settlements\(id\)/i.test(mig));
check("payee_type check", /payee_type text NOT NULL CHECK \(payee_type IN \('vendor','rider'\)\)/i.test(mig));
check("amount >= 0", /amount numeric NOT NULL CHECK \(amount >= 0\)/i.test(mig));
check("currency default NGN", /currency text NOT NULL DEFAULT 'NGN'/i.test(mig));
check("status check (pending/processing/success/failed/reversed)", /status IN \('pending','processing','success','failed','reversed'\)/i.test(mig));
check("paystack_reference not null unique", /paystack_reference text NOT NULL UNIQUE/i.test(mig));
check("recipient_code not null", /recipient_code text NOT NULL/i.test(mig));
check("transfer_code unique", /transfer_code text UNIQUE/i.test(mig));
check("raw_payload jsonb", /raw_payload jsonb/i.test(mig));
check("one settlement per transfer (xor check)", /transfers_one_settlement_check/i.test(mig));
check("indexes on transfers", /idx_transfers_vendor_settlement_id/i.test(mig) && /idx_transfers_delivery_settlement_id/i.test(mig) && /idx_transfers_status/i.test(mig));

console.log("\n== IMMUTABILITY GUARD (B1 GUC pattern) ==");
check("prevent_transfer_unauthorized_changes fn", /CREATE OR REPLACE FUNCTION public\.prevent_transfer_unauthorized_changes/i.test(mig));
check("guard uses app.transfer_server_update GUC", /app\.transfer_server_update/i.test(mig));
check("identity columns immutable", /transfer identity columns are immutable/i.test(mig));
check("triggers bound to both tables", /trg_transfer_recipients_updated_at/i.test(mig) && /trg_transfers_updated_at/i.test(mig));
check("set_transfer_ledger_updated_at fn", /set_transfer_ledger_updated_at/i.test(mig));

console.log("\n== RLS / CLIENT WRITE PROTECTION ==");
check("transfer_recipients RLS enabled", /ALTER TABLE public\.transfer_recipients ENABLE ROW LEVEL SECURITY/i.test(mig));
check("transfers RLS enabled", /ALTER TABLE public\.transfers ENABLE ROW LEVEL SECURITY/i.test(mig));
check("no client insert transfers", /no_client_insert_transfers/i.test(mig));
check("no client update transfers", /no_client_update_transfers/i.test(mig));
check("no client delete transfers", /no_client_delete_transfers/i.test(mig));
check("no client insert recipients", /no_client_insert_transfer_recipients/i.test(mig));
check("no client update recipients", /no_client_update_transfer_recipients/i.test(mig));
check("no client delete recipients", /no_client_delete_transfer_recipients/i.test(mig));
check("REVOKE ALL transfers", /REVOKE ALL ON public\.transfers FROM anon, authenticated/i.test(mig));
check("REVOKE ALL recipients", /REVOKE ALL ON public\.transfer_recipients FROM anon, authenticated/i.test(mig));
check("GRANT SELECT transfers (read-only)", /GRANT SELECT ON public\.transfers TO authenticated/i.test(mig));

console.log("\n== SECURE RPCs (service-role only) ==");
check("create_transfer_recipient fn", /CREATE OR REPLACE FUNCTION public\.create_transfer_recipient/i.test(mig));
check("create_pending_transfer fn", /CREATE OR REPLACE FUNCTION public\.create_pending_transfer/i.test(mig));
check("RPCs are SECURITY DEFINER", /create_transfer_recipient[\s\S]*?SECURITY DEFINER/i.test(mig) && /create_pending_transfer[\s\S]*?SECURITY DEFINER/i.test(mig));
check("EXECUTE revoked from client roles", /REVOKE EXECUTE ON FUNCTION public\.create_transfer_recipient/i.test(mig) && /REVOKE EXECUTE ON FUNCTION public\.create_pending_transfer/i.test(mig));
check("EXECUTE granted to service_role only", /GRANT EXECUTE ON FUNCTION public\.create_transfer_recipient[\s\S]*?service_role/i.test(mig) && /GRANT EXECUTE ON FUNCTION public\.create_pending_transfer[\s\S]*?service_role/i.test(mig));
check("pending transfer amount from authoritative settlement", /v_amount := v_vendor_vs\.amount/i.test(mig) && /v_amount := v_ds\.rider_amount/i.test(mig));
check("vendor_self/no-rider rejected (no fake rider payout)", /has no rider \(vendor_self or unassigned\)/i.test(mig));
check("pending settlement required", /not payout-eligible/i.test(mig));
check("idempotent: existing transfer returned, not duplicated", /already_exists', true/i.test(mig));
check("recipient must match registered payee", /recipient_code does not match the registered/i.test(mig));
console.log("\n== EDGE FUNCTION: paystack-transfer-recipient ==");
check("function exists", recFn.length > 0);
check("JWT auth required", /Authorization|Bearer/.test(recFn) && /getUser/.test(recFn));
check("uses PAYSTACK_SECRET_KEY server-side only", /Deno\.env\.get\("PAYSTACK_SECRET_KEY"\)/.test(recFn));
check("calls Paystack transferrecipient API", /transferrecipient/.test(recFn));
check("POST only (no GET/DELETE of transfers)", /method !== "POST"/.test(recFn));
check("does NOT call transfer/authorize endpoint", !/transfer\/authorize|\/transfer\b/.test(recFn.replace(/\/\/[^\n]*/g, "").replace(/transferrecipient/g, "")));
check("env-driven CORS allowlist (no wildcard)", /ALLOWED_ORIGIN/.test(recFn) && !/"Access-Control-Allow-Origin": "\*"/.test(recFn));
check("create_transfer_recipient RPC invoked", /create_transfer_recipient/.test(recFn));
check("does not mark transfers successful", !/status.*=.*'success'|settled/.test(recFn));

// ---- ROOT-CAUSE GUARD: rider identity must NOT be checked via profiles.role ----
// profiles.role is never 'rider' (valid roles: 'user'/'vendor'/'admin'); the
// profiles_role_check constraint rejects role='rider'. Riders are identified
// exclusively through the `riders` table (riders.user_id = profiles.id).
const recFnNoComments = recFn.replace(/\/\/[^\n]*/g, "");
check("no profiles.role 'rider' lookup (root cause fixed)", !/profile\.role\s*!==?\s*["']rider["']/.test(recFnNoComments));
check("no profiles.role write to 'rider'", !/update.*from\("profiles"\)[\s\S]*?role\s*[:=]\s*["']rider["']/i.test(recFnNoComments));
check("rider identity verified via riders.user_id", /from\("riders"\)[\s\S]*?\.eq\("user_id"/i.test(recFn));
check("rider check gates on approved status", /status\s*!==?\s*"approved"/i.test(recFnNoComments));

console.log("\n== NO TRANSFER INITIATION (infrastructure only) ==");
check("migration never calls Paystack transfer API", !/transfer\/authorize|api\.paystack\.co\/transfer\b/i.test(mig));
const migNC = mig.replace(/--[^\n]*/g, "");
check("no db function initiates a transfer", !/http/i.test(migNC));
check("transfers remain pending (no settled writes)", !/SET status\s*=\s*'settled'/i.test(migNC));

console.log("\n== SETTLEMENT LOGIC UNCHANGED ==");
const b4b = fs.readFileSync(path.join(root, "supabase/migrations/20260910_create_settlement_ledger.sql"), "utf8");
check("vendor settlement still product revenue", /SUM\(oi\.price \* oi\.qty\)|SUM\(price \* qty\)|SUM\(oi\.price\s*\*\s*oi\.qty\)/i.test(b4b));
check("rider still 80% of fee", /0\.8/.test(b4b) && /rider_amount/.test(b4b));
check("B1 order payment-column guard intact", /payment_status IS DISTINCT FROM OLD\.payment_status/.test(
  fs.readFileSync(path.join(root, "supabase/migrations/20260907_lock_order_payment_columns.sql"), "utf8")));

console.log("\n== SECRET LEAK SCAN ==");
let leak = false;
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html|css|json)$/i.test(e.name)) {
      const c = fs.readFileSync(p, "utf8");
      if (/sk_live_[A-Za-z0-9]|sk_test_[A-Za-z0-9]|sb_secret_[A-Za-z0-9]/.test(c)) {
        leak = true; console.log("  LEAK: " + path.relative(root, p));
      }
    }
  }
})(path.join(root, "assets"));
check("no secret in frontend assets", !leak);

console.log("\n==============================");
console.log(fail ? "B6 VALIDATION FAILED" : "B6 ALL CHECKS PASSED");
console.log("==============================");
process.exit(fail ? 1 : 0);
