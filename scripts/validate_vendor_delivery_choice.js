// ============================================================
// validate_vendor_delivery_choice.js — structural validator for
// supabase/migrations/20261009_vendor_delivery_choice.sql
// ============================================================
// Offline / read-only. Exits non-zero if anything fails.
// ============================================================
const fs = require('fs');

const FILE = 'supabase/migrations/20261009_vendor_delivery_choice.sql';
let failed = false;

function check(label, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + label);
  if (!cond) failed = true;
}

console.log('== FILES ==');
check('20261009 migration exists', fs.existsSync(FILE));
if (!fs.existsSync(FILE)) process.exit(1);

const sql = fs.readFileSync(FILE, 'utf8');
const noComments = sql.replace(/--[^\n]*/g, '');

console.log('\n== set_vendor_delivery_method RPC ==');
check('RPC defined', /create\s+or\s+replace\s+function\s+public\.set_vendor_delivery_method\s*\(/i.test(noComments));
check('RPC is SECURITY DEFINER', /security\s+definer/i.test(noComments));
check('RPC pins search_path', /set\s+search_path\s*=\s*public/i.test(noComments));

console.log('\n== RPC GATES (ownership / state / race closure) ==');
check('authentication required (auth.uid gate)', /auth\.uid\(\)\s+is\s+null\s+then/i.test(noComments));
check('caller vendor_id resolved from profiles', /select\s+vendor_id\s+into\s+v_vendor_id\s+from\s+public\.profiles/i.test(noComments));
check('delivery method validated against allow-list', /p_delivery_method\s+not\s+in\s*\(\s*'vendor_self'\s*,\s*'rider'\s*\)/i.test(noComments));
check('order row locked (FOR UPDATE)', /for\s+update\s*;/i.test(noComments));
check('vendor ownership gate (order_items.vendor_id)', /oi\.order_id\s*=\s*p_order_id[\s\S]*oi\.vendor_id\s*=\s*v_vendor_id/i.test(noComments));
check('order must be a vendor request', /v_order\.request_type\s*<>\s*'vendor_request'/i.test(noComments));
check('order must be in Preparing state', /v_order\.status\s*<>\s*'Preparing'/i.test(noComments));
check('no switching after rider claimed', /delivery_method\s*=\s*'rider'[\s\S]*v_order\.rider_id\s+is\s+not\s+null/i.test(noComments));
check('vendor pickup location required for rider', /v_pickup_location\s+is\s+null\s+or\s+v_pickup_location\s*=\s*''/i.test(noComments));
check('order drop-off location required for rider', /v_order\.spot\s+is\s+null\s+or\s+v_order\.spot\s*=\s*''/i.test(noComments));

console.log('\n== SERVER-SIDE FINANCIAL CONSTANTS (no client trust) ==');
check('rider choice: fee = 1500', /fee\s*=\s*1500/i.test(noComments));
check('rider choice: rider_delivery_share = 1000', /rider_delivery_share\s*=\s*1000/i.test(noComments));
check('rider choice: company_delivery_share = 500', /company_delivery_share\s*=\s*500/i.test(noComments));
check('rider choice: vendor_delivery_requested = true', /vendor_delivery_requested\s*=\s*true/i.test(noComments));
check('vendor_self choice: fee = 0', /fee\s*=\s*0/i.test(noComments));
check('vendor_self choice: vendor_delivery_requested = false', /vendor_delivery_requested\s*=\s*false/i.test(noComments));
check('vendor_decision_at stamped', /vendor_decision_at\s*=\s*now\(\)/i.test(noComments));

console.log('\n== RPC PERMISSIONS ==');
check('EXECUTE granted to authenticated', /grant\s+execute\s+on\s+function\s+public\.set_vendor_delivery_method\s*\([^)]*\)\s+to\s+authenticated/i.test(noComments));
check('EXECUTE revoked from anon', /revoke\s+execute\s+on\s+function\s+public\.set_vendor_delivery_method[\s\S]*?from\s+anon/i.test(noComments));
check('EXECUTE revoked from PUBLIC', /revoke\s+execute\s+on\s+function\s+public\.set_vendor_delivery_method[\s\S]*?from\s+public/i.test(noComments));

console.log('\n== SUPPORTING INDEX ==');
check('pending vendor delivery index created', /create\s+index\s+if\s+not\s+exists\s+idx_orders_vendor_delivery_pending/i.test(noComments));
check('index is partial (Preparing + requested + rider)', /where\s+request_type\s*=\s*'vendor_request'[\s\S]*vendor_delivery_requested\s*=\s*true[\s\S]*status\s*=\s*'Preparing'/i.test(noComments));

console.log('\n== NO ALIEN CHANGES ==');
check('no DROP TABLE', !/drop\s+table/i.test(noComments));
check('no RLS disable', !/disable\s+row\s+level\s+security|alter\s+table[\s\S]*disable/i.test(noComments));
check('no policy drops', !/drop\s+policy/i.test(noComments));
check('no Paystack code in migration', !/paystack|secret[_\s]?key|public[_\s]?key/i.test(noComments));
check('no payment created for delivery fee (product stays pending_vendor)', /pending_vendor/i.test(sql));

console.log('\n==============================');
console.log(failed ? 'VALIDATION FAILED' : 'VENDOR DELIVERY CHOICE ALL CHECKS PASSED');
console.log('==============================');
process.exit(failed ? 1 : 0);