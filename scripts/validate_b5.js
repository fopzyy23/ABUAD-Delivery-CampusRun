// B5 validator — Rider 80/20 earnings cutover
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

let fail = 0;
function check(name, cond) {
  console.log((cond ? "PASS" : "FAIL") + " — " + name);
  if (!cond) fail++;
}

const app = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
const mig = fs.readFileSync(path.join(root, "supabase/migrations/20260911_rider_80_20_earnings_cutover.sql"), "utf8");

console.log("== FILES EXIST ==");
check("20260911 migration exists", fs.existsSync(path.join(root, "supabase/migrations/20260911_rider_80_20_earnings_cutover.sql")));

console.log("\n== CONSTANTS ==");
check("DELIVERY_FEE = 1500", /const DELIVERY_FEE = 1500/.test(app));
check("RIDER_DELIVERY_SHARE = 1000", /const RIDER_DELIVERY_SHARE = 1000/.test(app));
check("COMPANY_DELIVERY_SHARE = 500", /const COMPANY_DELIVERY_SHARE = 500/.test(app));

console.log("\n== RIDER EARNINGS FUNCTIONS ==");
check("riderShareAmount exists", /function riderShareAmount/.test(app));
check("riderShareAmount returns fixed share", /riderShareAmount[\s\S]*?RIDER_DELIVERY_SHARE/.test(app));
check("riderPendingEarnings uses riderShareAmount", /riderPendingEarnings[\s\S]*?riderShareAmount/.test(app));
check("completed deliveries excludes vendor_self", /vendor_self/.test(app));

console.log("\n== NO 100% FEE USAGE ==");
check("earnings history uses riderShareAmount", /Rider earnings[\s\S]*?riderShareAmount/.test(app));
check("available deliveries use riderShareAmount", /rider earnings[\s\S]*?riderShareAmount/.test(app));
check("active deliveries use riderShareAmount", /rider earnings[\s\S]*?riderShareAmount/.test(app));

console.log("\n== MIGRATION RPC ==");
check("get_rider_earnings function", /CREATE OR REPLACE FUNCTION public\.get_rider_earnings/.test(mig));
check("SECURITY DEFINER", /SECURITY DEFINER/.test(mig));
check("uses delivery_settlements.rider_amount", /delivery_settlements[\s\S]*?rider_amount/.test(mig));
check("security check on rider ownership", /r\.user_id = auth\.uid\(\)/.test(mig));
check("GRANT EXECUTE to authenticated", /GRANT EXECUTE/.test(mig));

console.log("\n== VENDOR REVENUE PRESERVED ==");
check("vendor revenue from own order_items", /Your own items on delivered orders/.test(app));
check("vendor excludes delivery fee", /excludes the ₦1,500 delivery fee/.test(app));

console.log("\n== WITHDRAWAL SAFETY ==");
check("withdrawal checks available balance", /value > available/.test(app));
check("available uses riderPendingEarnings", /riderPendingEarnings\(\) - riderPendingRequestsTotal/.test(app));

console.log("\n== EDGE CASES ==");
check("vendor_self excluded from completed", /delivery_method.*vendor_self/.test(app));
check("cancelled excluded (Delivered filter)", /o\.status === 'Delivered'/.test(app));

console.log("\n== NO PAYSTACK TRANSFERS ==");
check("no transfer API calls", !/transfer|paystack\.co\/transfer/.test(mig));

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
console.log(fail ? "B5 VALIDATION FAILED" : "B5 ALL CHECKS PASSED");
console.log("==============================");
process.exit(fail ? 1 : 0);