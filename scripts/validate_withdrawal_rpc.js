// ============================================================
// H-1 validator — server-authoritative withdrawal requests
// ============================================================
// Read-only structural checks over the 20261005 migration and app.js.
// Verifies that the RPC is the ONLY withdrawal-creation path and that the
// direct client INSERT bypass is closed. No database access.
//   node scripts/validate_withdrawal_rpc.js
// ============================================================
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const mig = fs.readFileSync(
  path.join(root, "supabase/migrations/20261005_secure_withdrawal_rpc.sql"),
  "utf8"
);
const app = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const mig05 = fs.readFileSync(
  path.join(root, "supabase/migrations/20260905_create_withdrawal_requests.sql"),
  "utf8"
);

let fail = 0;
function check(name, cond, extra = "") {
  console.log((cond ? "PASS" : "FAIL") + " — " + name + (extra && !cond ? "  " + extra : ""));
  if (!cond) fail++;
}

console.log("== FILES ==");
check("20261005 migration exists", fs.existsSync(path.join(root, "supabase/migrations/20261005_secure_withdrawal_rpc.sql")));

console.log("\n== request_withdrawal RPC ==");
check("request_withdrawal defined", /CREATE OR REPLACE FUNCTION public\.request_withdrawal\(p_amount numeric\)/.test(mig));
check("RPC is SECURITY DEFINER", /request_withdrawal\(p_amount numeric\)[\s\S]*?SECURITY DEFINER/.test(mig));
check("RPC pins search_path", /request_withdrawal\(p_amount numeric\)[\s\S]*?SET search_path = public/.test(mig));
check("RPC resolves caller rider via auth.uid()", /FROM public\.riders[\s\S]*?WHERE user_id = auth\.uid\(\)[\s\S]*?FOR UPDATE/.test(mig));
check("RPC locks the rider row (race closure)", /FOR UPDATE/.test(mig));
check("RPC requires an approved rider", /v_rider\.status <> 'approved'/.test(mig));
check("RPC validates amount > 0 server-side", /p_amount > 0 AND p_amount < 1000000/.test(mig));
check("RPC computes earnings from delivery_settlements", /delivery_settlements[\s\S]*?rider_amount/.test(mig));
check("RPC encumbers non-rejected withdrawals", /w\.status <> 'rejected'/.test(mig));
check("RPC rejects oversize amounts", /IF p_amount > v_available THEN/.test(mig));
check("RPC does not trust a client-supplied balance", mig.indexOf("p_available") === -1 && mig.indexOf("p_balance") === -1);
check("RPC inserts the withdrawal atomically", mig.indexOf("INSERT INTO public.withdrawal_requests (rider_id, amount, status)") !== -1);

console.log("\n== RPC PERMISSIONS ==");
check("request_withdrawal EXECUTE revoked from PUBLIC/anon", /REVOKE ALL ON FUNCTION public\.request_withdrawal\(numeric\) FROM PUBLIC, anon/.test(mig));
check("request_withdrawal EXECUTE granted to authenticated", /GRANT EXECUTE ON FUNCTION public\.request_withdrawal\(numeric\) TO authenticated/.test(mig));

console.log("\n== DIRECT-INSERT BYPASS CLOSED ==");
check("withdrawal_requests INSERT revoked from authenticated", /REVOKE INSERT ON public\.withdrawal_requests FROM authenticated/.test(mig));
check("withdrawal_requests_insert_own policy dropped", /DROP POLICY IF EXISTS \"withdrawal_requests_insert_own\" ON public\.withdrawal_requests/.test(mig));
check("SELECT + admin UPDATE grants preserved (20260905 file still grants them)", /GRANT SELECT, INSERT, UPDATE ON public\.withdrawal_requests TO authenticated/.test(mig05));

console.log("\n== get_rider_earnings ALIGNMENT ==");
check("get_rider_earnings re-created in 20261005", /CREATE OR REPLACE FUNCTION public\.get_rider_earnings\(p_rider_id uuid\)/.test(mig));
check("earnings RPC uses the same non-rejected encumbrance", /get_rider_earnings\(p_rider_id uuid\)[\s\S]*?w\.status <> 'rejected'/.test(mig));
check("earnings RPC keeps ownership check", /get_rider_earnings\(p_rider_id uuid\)[\s\S]*?r\.user_id = auth\.uid\(\)/.test(mig));
check("earnings RPC keeps authenticated grant", /GRANT EXECUTE ON FUNCTION public\.get_rider_earnings\(uuid\) TO authenticated/.test(mig));

console.log("\n== FRONTEND USES THE RPC ==");
check("app.js calls request_withdrawal RPC", /supabase\.rpc\('request_withdrawal', \{ p_amount: value \}\)/.test(app));
check("app.js no longer directly inserts withdrawal_requests", !/from\('withdrawal_requests'\)[\s\S]{0,120}\.insert/.test(app));
check("client pre-check kept as UX (value > available)", /value > available/.test(app));
check("withdrawal_requests load via SELECT untouched", /\.from\('withdrawal_requests'\)[\s\S]{0,60}\.select/.test(app));
check("no rider self-approve/self-update path in app.js", !/from\('withdrawal_requests'\)[\s\S]{0,120}update/i.test(app));

console.log("\n== NO ALIEN CHANGES ==");
check("no DELETEs, no DROP TABLE, no RLS disable", !/DELETE FROM|DROP TABLE|DISABLE ROW LEVEL SECURITY/.test(mig));

console.log("\n===============================");
console.log(fail ? "WITHDRAWAL RPC VALIDATION FAILED" : "WITHDRAWAL RPC ALL CHECKS PASSED");
console.log("===============================");
process.exit(fail ? 1 : 0);