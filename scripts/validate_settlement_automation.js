// ============================================================
// L-B1 validator — automatic settlement on delivered orders
// ============================================================
// Read-only structural checks, no database access:
//   1. HISTORICAL: the append-only 20261004 settlement-automation migration
//      (origin of _settle_order_core / generate_settlement / triggers).
//   2. EFFECTIVE: the CURRENT auto_settle_delivered_order() definition,
//      resolved deterministically as the latest (lexicographically last,
//      date-prefixed) migration that re-declares the function — i.e. the
//      definition the database runs once all migrations are applied.
//   node scripts/validate_settlement_automation.js
// ============================================================
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const mig = fs.readFileSync(
  path.join(root, "supabase/migrations/20261004_auto_settlement_on_delivered.sql"),
  "utf8"
);
const mig30 = fs.readFileSync(
  path.join(root, "supabase/migrations/20260930_critical_hardening.sql"),
  "utf8"
);

// --- Resolve the EFFECTIVE auto_settle_delivered_order() definition. ---
// Migrations are date-prefixed and applied in name order, so the
// lexicographically last migration that re-declares the function is the
// definition the database runs after all migrations are applied.
const migDir = path.join(root, "supabase/migrations");
const definingMigrations = fs
  .readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) =>
    /CREATE OR REPLACE FUNCTION public\.auto_settle_delivered_order\s*\(/.test(
      fs.readFileSync(path.join(migDir, f), "utf8")
    )
  )
  .sort();
const effectiveName = definingMigrations[definingMigrations.length - 1] || "";
const effective = effectiveName
  ? fs.readFileSync(path.join(migDir, effectiveName), "utf8")
  : "";
const effStart = effective.indexOf(
  "CREATE OR REPLACE FUNCTION public.auto_settle_delivered_order()"
);
const effEnd = effStart >= 0 ? effective.indexOf("$func$;", effStart) : -1;
const effBody =
  effStart >= 0 && effEnd >= 0
    ? effective.slice(effStart, effEnd + "$func$;".length)
    : "";
const effBodyNoComments = effBody.replace(/--[^\n]*/g, "");
const effDefinitionCount = (
  effective.match(
    /CREATE OR REPLACE FUNCTION public\.auto_settle_delivered_order\s*\(/g
  ) || []
).length;
const migrationFiles = fs
  .readdirSync(migDir)
  .filter((f) => f.endsWith(".sql"));
const coreFunctionDefined = migrationFiles.some((f) =>
  /CREATE OR REPLACE FUNCTION public\._settle_order_core/.test(
    fs.readFileSync(path.join(migDir, f), "utf8")
  )
);
const bonusFunctionDefined = migrationFiles.some((f) =>
  /CREATE OR REPLACE FUNCTION public\._award_rider_daily_bonus/.test(
    fs.readFileSync(path.join(migDir, f), "utf8")
  )
);

let fail = 0;
function check(name, cond, extra = "") {
  console.log((cond ? "PASS" : "FAIL") + " — " + name + (extra && !cond ? "  " + extra : ""));
  if (!cond) fail++;
}

console.log("== FILES ==");
check("20261004 migration exists", fs.existsSync(path.join(root, "supabase/migrations/20261004_auto_settlement_on_delivered.sql")));

console.log("\n== SHARED SETTLEMENT ENGINE (_settle_order_core) ==");
check("core engine defined", /CREATE OR REPLACE FUNCTION public\._settle_order_core\(p_order_id uuid\)/.test(mig));
check("core is SECURITY DEFINER", /_settle_order_core\(p_order_id uuid\)[\s\S]*?SECURITY DEFINER/.test(mig));
check("core pins search_path", /_settle_order_core\(p_order_id uuid\)[\s\S]*?SET search_path = public/.test(mig));
check("core locks the order row (FOR UPDATE)", /_settle_order_core[\s\S]*?FOR UPDATE/.test(mig));
check("core requires a successful payment", /_settle_order_core[\s\S]*?no successful payment/.test(mig));
check("core requires Delivered status", /_settle_order_core[\s\S]*?is not Delivered/.test(mig));
check("core is idempotent (existing settlements short-circuit)", /_settle_order_core[\s\S]*?already_exists[\s\S]*?vendor_settlements[\s\S]*?v_count/.test(mig));
check("core uses authoritative stored split columns", /_settle_order_core[\s\S]*?v_order\.rider_delivery_share[\s\S]*?v_order\.company_delivery_share/.test(mig));
check("core keeps best-effort vendor transfers", /_settle_order_core[\s\S]*?create_pending_transfer[\s\S]*?EXCEPTION WHEN OTHERS/.test(mig));
check("core keeps best-effort rider transfers (via riders.user_id)", /_settle_order_core[\s\S]*?profile_id = \(SELECT user_id FROM public\.riders WHERE id = v_order\.rider_id\)/.test(mig));

console.log("\n== CORE EXECUTE LOCKDOWN ==");
check("core EXECUTE revoked from PUBLIC/anon/authenticated", /REVOKE ALL ON FUNCTION public\._settle_order_core\(uuid\) FROM PUBLIC, anon, authenticated/.test(mig));
check("core EXECUTE granted to service_role only", /GRANT EXECUTE ON FUNCTION public\._settle_order_core\(uuid\) TO service_role/.test(mig));

console.log("\n== generate_settlement ADMIN WRAPPER PRESERVED ==");
check("wrapper keeps the same signature", /CREATE OR REPLACE FUNCTION public\.generate_settlement\(p_order_id uuid\)/.test(mig));
check("wrapper keeps the is_admin() gate", /generate_settlement[\s\S]*?IF NOT public\.is_admin\(\)[\s\S]*?admin privileges required/.test(mig));
check("wrapper delegates to the shared core", /RETURN public\._settle_order_core\(p_order_id\)/.test(mig));
check("authenticated EXECUTE grant preserved", /GRANT EXECUTE ON FUNCTION public\.generate_settlement\(uuid\) TO authenticated/.test(mig));
check("anon/PUBLIC EXECUTE revoked", /REVOKE EXECUTE ON FUNCTION public\.generate_settlement\(uuid\) FROM anon/.test(mig) && /REVOKE EXECUTE ON FUNCTION public\.generate_settlement\(uuid\) FROM PUBLIC/.test(mig));
check("20260930 original admin gate still present (no regression)", /generate_settlement[\s\S]{0,1500}IF NOT public\.is_admin\(\)[\s\S]{0,200}admin privileges required/.test(mig30));

console.log("\n== AUTOMATIC TRIGGER (HISTORICAL 20261004 TEXT) ==");
check("trigger function defined", /CREATE OR REPLACE FUNCTION public\.auto_settle_delivered_order\(\)/.test(mig));
check("trigger function is SECURITY DEFINER + search_path", /auto_settle_delivered_order\(\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/.test(mig));
check("trigger only settles Delivered + paid orders", /NEW\.status = 'Delivered' AND NEW\.payment_status = 'success'/.test(mig));
check("trigger only fires on an actual change", /OLD\.status IS DISTINCT FROM 'Delivered' OR OLD\.payment_status IS DISTINCT FROM 'success'/.test(mig));
check("trigger failures cannot corrupt the order update (WARNING)", /EXCEPTION WHEN OTHERS THEN[\s\S]{0,300}RAISE WARNING 'auto settlement skipped/.test(mig));

console.log("\n== AUTOMATIC TRIGGER — EFFECTIVE DEFINITION (" + (effectiveName || "<unresolved>") + ") ==");
check("latest defining migration resolved deterministically", definingMigrations.length > 0 && effBody.length > 0, "no migration re-declares auto_settle_delivered_order()");
check("exactly one definition in the effective migration (no duplicates/conflicts)", effDefinitionCount === 1, "found " + effDefinitionCount);
check("effective trigger is SECURITY DEFINER + search_path", /RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/.test(effBodyNoComments));
check("entry is gated on status = Delivered", /NEW\.status\s*=\s*'Delivered'\s+AND\s+\(/.test(effBodyNoComments));
check("restaurant settlement path (product payment success)", /NEW\.request_type\s*=\s*'restaurant'\s+AND\s+NEW\.payment_status\s*=\s*'success'/.test(effBodyNoComments));
check("vendor-rider settlement path (vendor request + Dropzyy rider + delivery_payment_status success)", /NEW\.request_type\s*=\s*'vendor_request'\s+AND\s+NEW\.delivery_method\s*=\s*'rider'\s+AND\s+NEW\.vendor_delivery_requested\s+IS\s+TRUE\s+AND\s+NEW\.delivery_payment_status\s*=\s*'success'/.test(effBodyNoComments));
check("vendor-self excluded from automatic settlement", !/vendor_self/.test(effBodyNoComments));
check("re-fire guard also watches delivery_payment_status changes", /OLD\.delivery_payment_status\s+IS DISTINCT FROM\s*'success'/.test(effBodyNoComments));
check("delegates to the existing settlement core (_settle_order_core still defined)", coreFunctionDefined && /PERFORM\s+public\._settle_order_core\(NEW\.id\)/.test(effBodyNoComments));
check("Phase 8A daily bonus stays on the settlement path (_award_rider_daily_bonus still defined)", bonusFunctionDefined && /PERFORM\s+public\._award_rider_daily_bonus/.test(effBodyNoComments));
check("no alien objects in the effective migration (trigger function only)", !/DROP TABLE|DROP POLICY|DROP TRIGGER|CREATE TABLE|ALTER TABLE|DISABLE ROW LEVEL SECURITY|TRUNCATE/.test(effective));

console.log("\n== TRIGGERS ON public.orders ==");
check("AFTER UPDATE OF status trigger created", /AFTER UPDATE OF status ON public\.orders/.test(mig));
check("AFTER UPDATE OF payment_status trigger created", /AFTER UPDATE OF payment_status ON public\.orders/.test(mig));
check("triggers bound to auto_settle_delivered_order", /EXECUTE FUNCTION public\.auto_settle_delivered_order\(\)/.test(mig));

console.log("\n== NO ALIEN CHANGES ==");
check("no table drops / no RLS disable in migration", !/DROP TABLE|DISABLE ROW LEVEL SECURITY|DROP POLICY/.test(mig));
check("no payment_status / fee / split constants changed", !/payment_status = 'success'/.test(mig.replace("NEW.payment_status = 'success'", "")) && !/1500|1000|500/.test(mig));

console.log("\n===============================");
console.log(fail ? "SETTLEMENT AUTOMATION VALIDATION FAILED" : "SETTLEMENT AUTOMATION ALL CHECKS PASSED");
console.log("===============================");
process.exit(fail ? 1 : 0);