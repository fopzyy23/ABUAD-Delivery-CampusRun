// Read-only structural validator for supabase/migrations/20260820_add_vendor_dashboard_workflow.sql
// Validates against the confirmed live schema (from direct PostgREST probes).
const fs = require('fs');

const sql = fs.readFileSync('supabase/migrations/20260820_add_vendor_dashboard_workflow.sql', 'utf8');
const sqlNoComments = sql.replace(/--[^\n]*/g, '');

// Confirmed live schema (verified via PostgREST probing).
const liveSchema = {
  orders: ['id', 'order_number', 'user_id', 'status', 'total', 'fee', 'spot', 'created_at', 'rider_id'],
  order_items: ['id', 'order_id', 'product_id', 'qty', 'price', 'name', 'icon', 'vendor_id', 'created_at'],
  profiles: ['id', 'created_at', 'full_name', 'phone', 'hostel', 'email', 'role'],
  vendors: ['id', 'name', 'icon', 'type', 'rating', 'time', 'cover', 'open', 'delivery_method'],
  products: ['id', 'vendor_id', 'name', 'desc', 'price', 'icon', 'category', 'active', 'created_at'],
  riders: ['id', 'user_id', 'matric_number', 'phone', 'status', 'available', 'rating_avg', 'rating_count', 'created_at', 'updated_at']
};

const errors = [];
const warnings = [];

// 1. Policy extraction
function extractPolicies(text) {
  const out = [];
  const re = /CREATE POLICY\s+"([^"]+)"\s+ON\s+public\.(\w+)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ name: m[1], table: m[2] });
  return out;
}
function extractDrops(text) {
  const out = [];
  const re = /DROP POLICY IF EXISTS\s+"([^"]+)"\s+ON\s+public\.(\w+)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push({ name: m[1], table: m[2] });
  return out;
}

const policies = extractPolicies(sql);
const drops = extractDrops(sql);
const seen = new Map();
policies.forEach(p => {
  const key = p.name + '@' + p.table;
  if (seen.has(key)) errors.push('DUPLICATE POLICY: ' + key);
  seen.set(key, true);
});

// 3. Required policies present
const required = [
  'orders_select_vendor@orders',
  'orders_update_vendor@orders',
  'order_items_select_vendor@order_items',
  'orders_select_unassigned@orders',
  'orders_update_claim@orders',
  'order_items_select_rider@order_items',
  'products_select_vendor@products',
  'products_insert_vendor@products',
  'products_update_vendor@products'
];
required.forEach(r => {
  if (!seen.has(r)) errors.push('MISSING POLICY: ' + r);
});

// 4. Each CREATE POLICY's dependencies must exist in live schema.
const aliasMap = { oi: 'order_items', o: 'orders', p: 'products', r: 'riders', v: 'vendors', orders: 'orders', order_items: 'order_items', profiles: 'profiles', products: 'products', vendors: 'vendors', riders: 'riders' };

// Columns created by this migration
function createdCols(text) {
  const set = new Set();
  const re = /ADD COLUMN IF NOT EXISTS\s+(\w+)\s+(\w+)/g;
  let m;
  // We only track by table via separate regex below; use table hint
  const re2 = /ALTER TABLE\s+public\.(\w+)[\s\S]*?ADD COLUMN IF NOT EXISTS\s+(\w+)/g;
  while ((m = re2.exec(text)) !== null) set.add(m[1] + '.' + m[2]);
  return set;
}
const created = createdCols(sqlNoComments);

// 5. Validate every `table.column` reference in non-comment SQL
const colRefRe = /(?:public\.)?(\w+)\.(\w+)/g;
let cm;
while ((cm = colRefRe.exec(sqlNoComments)) !== null) {
  const table = aliasMap[cm[1]];
  if (!table) continue;
  const col = cm[2];
  // Skip constraint/def clauses that reference the same column being created
  if (created.has(table + '.' + col)) continue;
  // Skip CHECK constraint inline definitions (they reference the column they define)
  const before = sqlNoComments.slice(0, cm.index);
  const lineBase = before.split('\n').length;
  if (created.has(table + '.' + col) || /CHECK\s*\(/.test(sqlNoComments.slice(cm.index - 40, cm.index))) continue;
  const schemaCols = liveSchema[table];
  if (!schemaCols) {
    errors.push('UNKNOWN TABLE: ' + cm[1]);
    continue;
  }
  if (!schemaCols.includes(col)) errors.push('MISSING COLUMN: ' + table + '.' + col);
}

// 5. orders.vendor_id forbidden in SQL
if (/orders\.vendor_id/.test(sqlNoComments)) errors.push('orders.vendor_id referenced in SQL — FORBIDDEN');

// 6. orders.delivery_method added before first CREATE POLICY
const addIdx = sqlNoComments.indexOf('ADD COLUMN IF NOT EXISTS delivery_method');
const firstPolicyIdx = sqlNoComments.indexOf('CREATE POLICY');
if (addIdx === -1) errors.push('orders.delivery_method ADD COLUMN missing');
else if (addIdx > firstPolicyIdx) errors.push('orders.delivery_method added AFTER first CREATE POLICY');

// 7. profiles.vendor_id added
if (sqlNoComments.indexOf('ADD COLUMN IF NOT EXISTS vendor_id') === -1) errors.push('profiles.vendor_id ADD COLUMN missing');

// 8. status CHECK values
if (!sqlNoComments.includes("'Order confirmed','Preparing','Ready for pickup','Rider assigned','Picked up','Delivered','Rated','Cancelled'"))
  errors.push('status CHECK missing full vendor status set');

// 9. WITH CHECK logic sanity
const statusWhitelistRe = /status IN \('Order confirmed','Preparing','Ready for pickup','Delivered','Cancelled'\)/;
if (!statusWhitelistRe.test(sqlNoComments)) errors.push('orders_update_vendor WITH CHECK missing status whitelist');
const methodWhitelistRe = /delivery_method IN \('rider','vendor_self','both'\)/;
if (!methodWhitelistRe.test(sqlNoComments)) errors.push('orders_update_vendor WITH CHECK missing delivery_method whitelist');

// 10. Rider claim WITH CHECK
if (!/status = 'Rider assigned'/.test(sqlNoComments)) errors.push('orders_update_claim WITH CHECK missing status');

// 11. Ready-for-pickup rider access present
if (!sqlNoComments.includes("'Order confirmed','Ready for pickup'")) errors.push('Ready for pickup missing from rider pools');

// 12. Policy dependencies: each policy's referenced tables/cols must exist (already covered above);
//     also verify no policy references a table/col that doesn't exist.

// 13. No DROP of policies that are NOT created (harmless but note)
drops.forEach(d => {
  const key = d.name + '@' + d.table;
  if (!seen.has(key)) warnings.push('DROP POLICY for policy not created here: ' + key);
});

// 14. Confirm vendor/product policies reference profiles properly
if (!/orders_select_vendor/.test(sqlNoComments)) errors.push('orders_select_vendor missing');
if (!/order_items_select_vendor/.test(sqlNoComments)) errors.push('order_items_select_vendor missing');

console.log('=== MIGRATION VALIDATION ===');
console.log('Policies created: ' + policies.length);
console.log('Policies dropped: ' + drops.length);
console.log('Errors: ' + (errors.length ? errors.length : 'NONE'));
errors.forEach(e => console.log('  ERR: ' + e));
console.log('Warnings: ' + (warnings.length ? warnings.length : 'NONE'));
warnings.forEach(w => console.log('  WARN: ' + w));
console.log('orders.delivery_method added before policies: ' + (addIdx !== -1 && addIdx < firstPolicyIdx));
console.log('orders.vendor_id in noncomment SQL: ' + /orders\.vendor_id/.test(sqlNoComments));