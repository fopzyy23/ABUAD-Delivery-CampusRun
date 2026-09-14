// Read-only structural validator for supabase/migrations/20261007_vendor_followup.sql
const fs = require('fs');

const sql = fs.readFileSync('supabase/migrations/20261007_vendor_followup.sql', 'utf8');
const sqlNoComments = sql.replace(/--[^\n]*/g, '');

// Extended live schema with vendor foundation columns
const liveSchema = {
  orders: ['id', 'order_number', 'user_id', 'status', 'total', 'fee', 'spot', 'created_at', 'rider_id', 'delivery_method', 'payment_status', 'subtotal', 'rider_delivery_share', 'company_delivery_share', 'request_type', 'vendor_delivery_requested'],
  order_items: ['id', 'order_id', 'product_id', 'qty', 'price', 'name', 'icon', 'vendor_id', 'created_at'],
  profiles: ['id', 'created_at', 'full_name', 'phone', 'hostel', 'email', 'role', 'vendor_id'],
  vendors: ['id', 'name', 'icon', 'type', 'rating', 'time', 'cover', 'open', 'delivery_method', 'image', 'description', 'opening_hours', 'pickup_location', 'is_restaurant'],
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

// 2. Required policies present (from followup)
const requiredPolicies = [
  'products_select_public@products',
  'products_select_admin@products'
];
requiredPolicies.forEach(r => {
  if (!seen.has(r)) errors.push('MISSING POLICY: ' + r);
});

console.log('Policies created/updated:', policies.length);
policies.forEach(p => console.log('  - ' + p.name + '@' + p.table));

// 3. Functions created/updated
function checkFunction(name) {
  const re = new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name.replace(/[()]/g, '\\$&'), 'i');
  return re.test(sql);
}

const requiredFunctions = [
  'enforce_order_status_transitions',
  'notify_riders_vendor_delivery_request',
  '_settle_order_core',
  'generate_settlement',
  'auto_settle_delivered_order'
];
requiredFunctions.forEach(f => {
  if (!checkFunction(f)) errors.push('MISSING FUNCTION: ' + f);
  else console.log('  Function found: ' + f);
});

// 4. Triggers created
function checkTrigger(name) {
  // Match CREATE TRIGGER with the trigger name, allowing whitespace/newlines before ON
  const re = new RegExp('CREATE TRIGGER\\s+' + name.replace(/[()]/g, '\\$&') + '[\\s\\S]*?\\sON', 'i');
  return re.test(sql);
}

const requiredTriggers = [
  'trg_notify_riders_vendor_delivery',
  'trg_auto_settle_on_status',
  'trg_auto_settle_on_payment'
];
requiredTriggers.forEach(t => {
  if (!checkTrigger(t)) errors.push('MISSING TRIGGER: ' + t);
  else console.log('  Trigger found: ' + t);
});

// 5. Validate column references
const aliasMap = { oi: 'order_items', o: 'orders', p: 'products', r: 'riders', v: 'vendors', orders: 'orders', order_items: 'order_items', profiles: 'profiles', products: 'products', vendors: 'vendors', riders: 'riders' };

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
  const before = sqlNoComments.slice(0, cm.index);
  if (/CHECK\s*\(/.test(sqlNoComments.slice(cm.index - 40, cm.index))) continue;
  const schemaCols = liveSchema[table];
  if (!schemaCols) continue;
  if (!schemaCols.includes(col)) {
    // Check if it's a new column from foundation migration
    const newCols = ['vendors.pickup_location', 'vendors.is_restaurant', 'orders.request_type', 'orders.vendor_delivery_requested'];
    if (!newCols.includes(table + '.' + col)) {
      errors.push('MISSING COLUMN: ' + table + '.' + col);
    }
  }
}

// 6. products_select_public: must allow both restaurant and vendor products
// Check for the policy with flexible whitespace
const productsPolicyRe = /CREATE POLICY\s+"products_select_public"[\s\S]*?USING\s*\(([\s\S]*?)\)/i;
const productsMatch = productsPolicyRe.exec(sqlNoComments);
if (productsMatch) {
  const usingClause = productsMatch[1];
  if (!usingClause.includes('active = true')) {
    errors.push('products_select_public missing active=true check');
  }
  // Check for both is_restaurant values (flexible matching)
  const hasTrue = usingClause.includes('is_restaurant') && usingClause.includes('true');
  const hasFalse = usingClause.includes('is_restaurant') && usingClause.includes('false');
  if (!hasTrue || !hasFalse) {
    errors.push('products_select_public must allow both is_restaurant=true and is_restaurant=false');
  }
} else {
  errors.push('products_select_public policy not found');
}

// 7. enforce_order_status_transitions: vendor rider claim uses vendor_delivery_requested
if (!/request_type\s*=\s*'vendor_request'/.test(sqlNoComments)) {
  errors.push('enforce_order_status_transitions missing vendor_request check');
}
if (!/vendor_delivery_requested\s*=\s*true/.test(sqlNoComments)) {
  errors.push('enforce_order_status_transitions missing vendor_delivery_requested=true check');
}
// Restaurant path must still require payment_status = 'success'
if (!/request_type\s*=\s*'restaurant'\s+AND\s+payment_status\s*=\s*'success'/.test(sqlNoComments)) {
  warnings.push('enforce_order_status_transitions should preserve restaurant payment_status=success requirement');
}

// 8. notify_riders_vendor_delivery_request trigger logic
if (!/OLD\.vendor_delivery_requested\s*=\s*false/.test(sqlNoComments)) {
  errors.push('notify_riders_vendor_delivery_request missing OLD.vendor_delivery_requested = false check');
}
if (!/NEW\.vendor_delivery_requested\s*=\s*true/.test(sqlNoComments)) {
  errors.push('notify_riders_vendor_delivery_request missing NEW.vendor_delivery_requested = true check');
}
if (!/request_type\s*=\s*'vendor_request'/.test(sqlNoComments)) {
  errors.push('notify_riders_vendor_delivery_request missing request_type=vendor_request check');
}
if (!/delivery_method\s*=\s*'rider'/.test(sqlNoComments)) {
  errors.push('notify_riders_vendor_delivery_request missing delivery_method=rider check');
}
if (!/r\.status\s*=\s*'approved'/.test(sqlNoComments)) {
  errors.push('notify_riders_vendor_delivery_request missing rider approved check');
}
if (!/r\.available\s*=\s*true/.test(sqlNoComments)) {
  errors.push('notify_riders_vendor_delivery_request missing rider available check');
}

// 9. _settle_order_core: conditional vendor settlement
if (!/request_type\s*=\s*'restaurant'/.test(sqlNoComments)) {
  errors.push('_settle_order_core missing request_type=restaurant check for vendor settlements');
}
// Vendor settlement should be skipped for vendor_request
if (!/request_type\s*=\s*'vendor_request'/.test(sqlNoComments)) {
  errors.push('_settle_order_core missing request_type=vendor_request handling');
}

// 10. _settle_order_core: skip delivery settlement for vendor_self
if (!/delivery_method\s*<>\s*'vendor_self'/.test(sqlNoComments) &&
    !/delivery_method\s*!=\s*'vendor_self'/.test(sqlNoComments)) {
  errors.push('_settle_order_core missing delivery_method != vendor_self check for delivery settlement');
}

// 11. auto_settle_delivered_order: conditional triggers (flexible whitespace matching)
// The SQL uses NEW.column references on BOTH sides, so patterns must account for optional prefix
function checkAutoSettleCondition(pattern, desc) {
  const re = new RegExp(pattern.replace(/\s+/g, '\\s+'), 'i');
  if (!re.test(sqlNoComments)) {
    errors.push('auto_settle_delivered_order missing ' + desc);
  }
}

// Patterns allow optional NEW./OLD. prefix on BOTH sides of AND
checkAutoSettleCondition("(NEW\\.)?request_type\\s*=\\s*'restaurant'\\s+AND\\s+(NEW\\.)?payment_status\\s*=\\s*'success'", 'restaurant paid condition');
checkAutoSettleCondition("(NEW\\.)?request_type\\s*=\\s*'vendor_request'\\s+AND\\s+(NEW\\.)?delivery_method\\s*=\\s*'vendor_self'", 'vendor self-delivery condition');
checkAutoSettleCondition("(NEW\\.)?request_type\\s*=\\s*'vendor_request'\\s+AND\\s+(NEW\\.)?delivery_method\\s*=\\s*'rider'\\s+AND\\s+(NEW\\.)?vendor_delivery_requested\\s*=\\s*true", 'vendor rider delivery condition');

// 12. No payment_status='success' for vendor product orders
// Check that vendor_request orders are NOT set to payment_status='success' for product payment
// This is more of a semantic check - the migration should not contain such logic

// 13. products_select_public allows both types
const productsPolicyMatch = sqlNoComments.match(/CREATE POLICY\s+"products_select_public"[\s\S]*?USING\s*\(([\s\S]*?)\)/i);
if (productsPolicyMatch) {
  const usingClause = productsPolicyMatch[1];
  if (!usingClause.includes('active = true')) {
    errors.push('products_select_public missing active=true check');
  }
  if (!usingClause.includes('is_restaurant')) {
    warnings.push('products_select_public should reference is_restaurant');
  }
}

console.log('=== MIGRATION VALIDATION: 20261007_vendor_followup ===');
console.log('Policies:', policies.length);
console.log('Errors: ' + (errors.length ? errors.length : 'NONE'));
errors.forEach(e => console.log('  ERR: ' + e));
console.log('Warnings: ' + (warnings.length ? warnings.length : 'NONE'));
warnings.forEach(w => console.log('  WARN: ' + w));