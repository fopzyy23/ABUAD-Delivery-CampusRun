// ============================================================
// B3 validator — Paystack server-side infrastructure
// ============================================================
// Structural + security checks over:
//   supabase/functions/paystack-initialize/index.ts
//   supabase/functions/paystack-webhook/index.ts
//   assets/js/  (frontend — must NOT contain Paystack secrets)
// No database access.  node scripts/validate_b3.js
// ============================================================
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

let fail = 0;
function check(name, cond, extra = "") {
  console.log(
    (cond ? "PASS" : "FAIL") + " — " + name +
      (extra && !cond ? "  " + extra : ""),
  );
  if (!cond) fail++;
}

const initPath = path.join(root, "supabase/functions/paystack-initialize/index.ts");
const hookPath = path.join(root, "supabase/functions/paystack-webhook/index.ts");
const init = fs.readFileSync(initPath, "utf8");
const hook = fs.readFileSync(hookPath, "utf8");

console.log("== FILES EXIST ==");
check("paystack-initialize/index.ts exists", fs.existsSync(initPath));
check("paystack-webhook/index.ts exists", fs.existsSync(hookPath));

console.log("\n== paystack-initialize: secrets via env (never hardcoded) ==");
check(
  "reads PAYSTACK_SECRET_KEY from env",
  /Deno\.env\.get\(\s*"PAYSTACK_SECRET_KEY"\s*\)/.test(init),
);
check(
  "reads SUPABASE_URL from env",
  /Deno\.env\.get\(\s*"SUPABASE_URL"\s*\)/.test(init),
);
check(
  "reads SUPABASE_SERVICE_ROLE_KEY from env",
  /Deno\.env\.get\(\s*"SUPABASE_SERVICE_ROLE_KEY"\s*\)/.test(init),
);
check(
  "no literal sk_ secret in initialize",
  !/\b(sk_live|sk_test)_[A-Za-z0-9_]+/.test(init),
);

console.log("\n== paystack-initialize: authentication ==");
check(
  "extracts + validates Bearer JWT",
  /startsWith\(\s*"Bearer "\s*\)/.test(init) &&
    /supabase\.auth\.getUser\(\s*jwt\s*\)/.test(init),
);
check(
  "rejects missing/invalid token with 401",
  /Invalid or expired session|Missing or invalid Authorization/.test(init),
);

console.log("\n== paystack-initialize: trusted inputs only ==");
check(
  "accepts order_id from body",
  /body\.order_id|\.order_id/.test(init),
);
check(
  "accepts email from body",
  /body\.email|\.email/.test(init),
);
check(
  "requires non-empty order_id + email (trimmed)",
  /!orderId \|\| !email/.test(init),
);
check(
  "does NOT accept amount from browser (no body.amount)",
  !/body\.amount|amount:\s*body|\.amount\s*=\s*body/.test(init),
);

console.log("\n== paystack-initialize: server-side order verification ==");
check(
  "fetches orders by id server-side",
  /from\(\s*"orders"\s*\)\s*\.select/.test(init),
);
check(
  "verifies order belongs to user",
  /order\.user_id\s*!==\s*user\.id|Order does not belong/.test(init),
);
check(
  "verifies payment_status === 'pending'",
  /order\.payment_status\s*!==\s*"pending"|not pending payment/.test(init),
);
check(
  "verifies order has items",
  /from\(\s*"order_items"\s*\)/.test(init),
);
check(
  "amount derived from server orders.total",
  /Number\(\s*order\.total\s*\)/.test(init) && /amountKobo/.test(init),
);
console.log("\n== paystack-initialize: Paystack API call ==");
check(
  "calls Paystack transaction/initialize",
  /https:\/\/api\.paystack\.co\/transaction\/initialize/.test(init),
);
check(
  "sends Authorization: Bearer secret",
  /`Bearer \$\{PAYSTACK_SECRET_KEY\}`|Authorization.*PAYSTACK_SECRET_KEY/.test(
    init,
  ),
);
check(
  "generates unique reference tied to order",
  /order_number.*Date\.now\(\)|dropzyy_/.test(init),
);
check(
  "returns only authorization_url/access_code/reference",
  /authorization_url/.test(init) && /access_code/.test(init) &&
    /reference/.test(init),
);



console.log("\n== paystack-webhook: signature validation ==");
check(
  "reads raw request body (req.text())",
  /await req\.text\(\)/.test(hook),
);
check(
  "reads x-paystack-signature header",
  /x-paystack-signature/.test(hook),
);
check(
  "uses HMAC SHA512",
  /"HMAC"/.test(hook) && /"SHA-512"/.test(hook) &&
    /crypto\.subtle\.sign/.test(hook),
);
check(
  "rejects invalid/missing signature with 401",
  /Invalid signature|Missing signature/.test(hook) && /401/.test(hook),
);

console.log("\n== paystack-webhook: event validation (never trust blindly) ==");
check(
  "maps event with paystackEventToStatus (never trusts raw event)",
  /paystackEventToStatus/.test(hook),
);
check(
  "requires non-empty reference + known status before processing",
  /!reference \|\| !status/.test(hook),
);
check(
  "branches success vs failed — only known statuses act",
  /if \(status === "success"\)/.test(hook),
);
check(
  "acknowledges with HTTP 200",
  /status:\s*200/.test(hook),
);

console.log("\n== paystack-webhook: scaffold does NOT mutate orders ==");
check(
  "no orders.update() in webhook (deferred to B4)",
  !/from\(\s*"orders"\s*\)\s*\.update|orders\.update/.test(hook),
);
check(
  "no payment_status mutation in webhook",
  !/payment_status\s*=/.test(hook),
);

console.log("\n== CORS handling ==");
check("initialize has CORS headers", /Access-Control-Allow-Origin/.test(init));
check("webhook has CORS headers", /Access-Control-Allow-Origin/.test(hook));
check("initialize handles OPTIONS preflight", /"OPTIONS"/.test(init));
check("webhook handles OPTIONS preflight", /"OPTIONS"/.test(hook));

console.log("\n== SECRET-LEAK SCAN: frontend/public assets ==");
// Scan every file under assets/ for embedded Paystack secrets.
let leaked = false;
const leakRe = /\b(sk_live|sk_test)_[A-Za-z0-9_]{10,}/;
(function scan(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (/\.(js|ts|html|json|css)$/.test(e.name)) {
      const txt = fs.readFileSync(p, "utf8");
      if (leakRe.test(txt)) {
        leaked = true;
        console.log("  !! secret-like token in " + path.relative(root, p));
      }
    }
  }
})("assets");
check("no sk_live/sk_test secret in frontend assets", !leaked);

// A real service-role key value must never be hardcoded in the public
// config.js. (The *name* appearing in a comment is fine — only the value,
// which for Supabase service-role keys starts with "sb_secret_", matters.)
const pubConfig = (() => {
  try {
    return fs.readFileSync(path.join(root, "assets/js/config.js"), "utf8");
  } catch {
    return "";
  }
})();
check(
  "no hardcoded service-role key value in public config.js",
  !/sb_secret_[A-Za-z0-9]+/.test(pubConfig),
);

console.log("\n" + (fail === 0 ? "ALL CHECKS PASSED" : fail + " CHECK(S) FAILED"));
process.exit(fail === 0 ? 0 : 1);
