// Read-only structural validator for supabase/migrations/20261006_vendor_foundation.sql
const fs = require('fs');

const sql = fs.readFileSync('supabase/migrations/20261006_vendor_foundation.sql', 'utf8');
const sqlNoComments = sql.replace(/--[^\n]*/g, '');

// Confirmed live schema (verified via PostgREST probing) - extended with new columns
const liveSchema = {
  orders: ['id', 'order_number', 'user_id', 'status', 'total', 'fee', 'spot', 'created_at', 'rider_id', 'delivery_method', 'payment_status', 'subtotal', 'rider_delivery_share', 'company_delivery_share'],
  order_items: ['id', 'order_id', 'product_id', 'qty', 'price', 'name', 'icon', 'vendor_id', 'created_at'],
  profiles: ['id', 'created_at', 'full_name', 'phone', 'hostel', 'email', 'role', 'vendor_id'],
  vendors: ['id', 'name', 'icon', 'type', 'rating', 'time', 'cover', 'open', 'delivery_method', 'image', 'description', 'opening_hours'],
  products: ['id', 'vendor_id', 'name', 'desc', 'price', 'icon', 'category', 'active', 'created_at', 'image'],
  riders: ['id', 'user_id', 'matric_number', 'phone', 'status', 'available', 'rating_avg', 'rating_count', 'created_at', 'updated_at'],
  payments: ['id', 'order_id', 'reference', 'transaction_id', 'amount', 'currency', 'status', 'gateway', 'raw_payload', 'created_at', 'updated_at'],
  vendor_settlements: ['id', 'order_id', 'vendor_id', 'amount', 'status', 'created_at', 'updated_at'],
  delivery_settlements: ['id', 'order_id', 'rider_id', 'delivery_fee', 'rider_amount', 'platform_amount', 'status', 'created_at', 'updated_at'],
  refunds: ['id', 'payment_id', 'order_id', 'amount', 'status', 'reason', 'gateway_refund_id', 'created_at', 'updated_at'],
  vendor_applications: ['id', 'user_id', 'full_name', 'matric_number', 'college', 'department', 'email', 'phone', 'what_they_want_to_sell', 'expected_price_range', 'additional_info', 'status', 'vendor_id', 'admin_response', 'admin_reviewed_at', 'admin_reviewed_by', 'created_at', 'updated_at'],
  issue_reports: ['id', 'user_id', 'subject', 'description', 'order_id', 'status', 'admin_response', 'admin_reviewed_at', 'admin_reviewed_by', 'created_at', 'updated_at'],
  notifications: ['id', 'user_id', 'title', 'message', 'type', 'related_order_id', 'is_read', 'created_at'],
  withdrawal_requests: ['id', 'rider_id', 'amount', 'status', 'requested_at', 'reviewed_at', 'reviewed_by', 'admin_note'],
  transfer_recipients: ['id', 'payee_type', 'vendor_id', 'profile_id', 'recipient_code', 'created_at'],
  transfers: ['id', 'vendor_settlement_id', 'delivery_settlement_id', 'payee_type', 'paystack_reference', 'recipient_code', 'amount', 'currency', 'status', 'transfer_code', 'raw_payload', 'created_at', 'updated_at']
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

// 2. Required new policies present
const requiredPolicies = [
  'orders_select_vendor@orders',
  'orders_update_vendor@orders',
  'orders_select_unassigned@orders',
  'orders_update_claim@orders',
  'order_items_select_rider@order_items',
  'products_select_public@products',
  'products_select_admin@products'
];
requiredPolicies.forEach(r => {
  if (!seen.has(r)) errors.push('MISSING POLICY: ' + r);
});

// 3. Columns created by this migration
function createdCols(text) {
  const set = new Set();
  // Match ALTER TABLE ... ADD COLUMN IF NOT EXISTS col_name
  const re = /ALTER TABLE\s+public\.(\w+)[\s\S]*?ADD COLUMN IF NOT EXISTS\s+(\w+)/g;
  let m;
  while ((m = re.exec(text)) !== null) set.add(m[1] + '.' + m[2]);
  return set;
}
const created = createdCols(sqlNoComments);
console.log('Columns created by migration:', [...created].join(', '));

// Required new columns
const requiredColumns = [
  'vendors.pickup_location',
  'vendors.is_restaurant',
  'orders.request_type',
  'orders.vendor_delivery_requested'
];
requiredColumns.forEach(col => {
  if (!created.has(col)) errors.push('MISSING COLUMN CREATION: ' + col);
});

// 4. Validate column references
const aliasMap = { oi: 'order_items', o: 'orders', p: 'products', r: 'riders', v: 'vendors', orders: 'orders', order_items: 'order_items', profiles: 'profiles', products: 'products', vendors: 'vendors', riders: 'riders' };

// Collect PL/pgSQL loop aliases to skip
const loopAliases = new Set();
const forAliasRe = /\bFOR\s+(\w+)\s+IN\b/g;
let fam;
while ((fam = forAliasRe.exec(sqlNoComments)) !== null) loopAliases.add(fam[1]);

const colRefRe = /(?:public\.)?(\w+)\.(\w+)/g;
let cm;
while ((cm = colRefRe.exec(sqlNoComments)) !== null) {
  if (loopAliases.has(cm[1]) && !cm[0].startsWith('public.')) continue;
  const table = aliasMap[cm[1]];
  if (!table) continue;
  const col = cm[2];
  if (created.has(table + '.' + col)) continue;
  const before = sqlNoComments.slice(0, cm.index);
  if (/CHECK\s*\(/.test(sqlNoComments.slice(cm.index - 40, cm.index))) continue;
  const schemaCols = liveSchema[table];
  if (!schemaCols) {
    errors.push('UNKNOWN TABLE: ' + cm[1]);
    continue;
  }
  if (!schemaCols.includes(col)) {
    // Allow new columns we're creating
    if (!created.has(table + '.' + col)) {
      errors.push('MISSING COLUMN: ' + table + '.' + col);
    }
  }
}

// 5. CHECK constraints for new columns
if (!/CHECK\s*\(request_type\s+IN\s*\(\s*'restaurant'\s*,\s*'vendor_request'\s*\)/.test(sqlNoComments)) {
  errors.push('request_type CHECK constraint missing or incorrect');
}
if (!/CHECK\s*\(payment_status\s+IN\s*\([^)]*'pending_vendor'[^)]*\)/.test(sqlNoComments)) {
  errors.push('payment_status CHECK missing pending_vendor');
}

// 6. Indexes
const requiredIndexes = [
  'idx_orders_request_type',
  'idx_orders_vendor_delivery_requested',
  'idx_order_items_vendor_order'
];
requiredIndexes.forEach(idx => {
  if (!sqlNoComments.includes(idx)) errors.push('MISSING INDEX: ' + idx);
});

// 7. orders.vendor_id forbidden
if (/orders\.vendor_id/.test(sqlNoComments)) errors.push('orders.vendor_id referenced in SQL — FORBIDDEN');

// 8. Vendor delivery request RLS logic
if (!/vendor_delivery_requested\s*=\s*true/.test(sqlNoComments)) {
  warnings.push('vendor_delivery_requested = true check not found in RLS');
}
if (!/request_type\s*=\s*'vendor_request'/.test(sqlNoComments)) {
  warnings.push('request_type = vendor_request check not found in RLS');
}

// 9. products_select_public filters is_restaurant
if (!/is_restaurant\s*=\s*true/.test(sqlNoComments)) {
  warnings.push('products_select_public should filter is_restaurant = true');
}

// 10. Existing functions that may need updates (warning only)
if (!/enforce_order_status_transitions/.test(sqlNoComments)) {
  warnings.push('enforce_order_status_transitions() not updated - will need follow-up for vendor delivery claims');
}
if (!/notify_riders_new_pool_order/.test(sqlNoComments)) {
  warnings.push('notify_riders_new_pool_order trigger not updated - will need follow-up for vendor delivery notifications');
}
if (!/generate_settlement/.test(sqlNoComments)) {
  warnings.push('generate_settlement() not updated - will need follow-up for vendor self-delivery (no delivery settlement)');
}

// 11. Backfill statements
if (!/UPDATE public\.orders\s+SET request_type\s*=\s*'restaurant'/.test(sqlNoComments)) {
  warnings.push('Missing backfill for orders.request_type');
}
if (!/UPDATE public\.vendors\s+SET is_restaurant\s*=\s*true/.test(sqlNoComments)) {
  warnings.push('Missing backfill for vendors.is_restaurant');
}

console.log('=== MIGRATION VALIDATION: 20261006_vendor_foundation ===');
console.log('Policies created: ' + policies.length);
policies.forEach(p => console.log('  - ' + p.name + '@' + p.table));
console.log('Policies dropped: ' + drops.length);
console.log('Columns created:', [...created].join(', '));
console.log('Errors: ' + (errors.length ? errors.length : 'NONE'));
errors.forEach(e => console.log('  ERR: ' + e));
console.log('Warnings: ' + (warnings.length ? warnings.length : 'NONE'));
warnings.forEach(w => console.log('  WARN: ' + w));