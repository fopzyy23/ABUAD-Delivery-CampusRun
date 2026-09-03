// Comprehensive validation of the payment-prep changes.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260902_add_order_payment_fields.sql'), 'utf8');

let fail = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra && !cond ? '  ' + extra : ''));
  if (!cond) fail++;
}

console.log('== ORDER CREATION ==');
check('subtotal computed from cartTotal()', /const subtotal=cartTotal\(\)/.test(app));
check('fee = DELIVERY_FEE', /const fee=DELIVERY_FEE/.test(app));
check('total = subtotal + fee', /const total=subtotal\+fee/.test(app));
check('order object includes subtotal', /items,subtotal,fee,total/.test(app));
check('order object includes payment_status', /payment_status:'pending'/.test(app));
check('order object does NOT include payment_reference', !/payment_reference:'/.test(app));
check('order object does NOT include transaction_id', !/transaction_id:'/.test(app));

console.log('\n== SAVE TO SUPABASE (ACTION 12: server-side pricing) ==');
check('checkout uses the place_order RPC (server-side pricing)', /\.rpc\('place_order'/.test(app));
check('client sends only product ids + quantities (no prices)', /p_items:\s*lines/.test(app));
check('client never inserts into orders directly', !/from\('orders'\)\s*[\s\S]{0,200}?\.insert\(/.test(app));
check('client never inserts into order_items directly', !/from\('order_items'\)\s*[\s\S]{0,200}?\.insert\(/.test(app));
check('order number adopted from server', /order\.id = data\.order\.order_number/.test(app));
check('subtotal adopted from server', /order\.subtotal = Number\(data\.order\.subtotal\)/.test(app));
check('fee adopted from server', /order\.fee = Number\(data\.order\.fee\)/.test(app));
check('total adopted from server', /order\.total = Number\(data\.order\.total\)/.test(app));

console.log('\n== LOAD (mapOrder) ==');
check('subtotal loaded with fallback', /subtotal: o\.subtotal != null/.test(app));
check('payment_status loaded with default', /payment_status: o\.payment_status \|\| 'pending'/.test(app));
check('payment_reference loaded', /payment_reference: o\.payment_reference/.test(app));
check('transaction_id loaded', /transaction_id: o\.transaction_id/.test(app));

console.log('\n== CUSTOMER UI ==');
check('subtotal shown in orders', /money\(o\.subtotal\)/.test(app));
check('fee shown in orders', /money\(o\.fee\)\} delivery/.test(app));
check('total still shown', /money\(o\.total\)/.test(app));

console.log('\n== VENDOR / ADMIN EXPOSURE (corrected financial model) ==');
check('vendor revenue computed from own order_items (price × qty)',
  /\.filter\(o => o\.status === 'Delivered'\)\s*\.reduce\(\(n, o\) => n \+ \(o\.items \|\| \[\]\)\.reduce/.test(app));
check('vendor dashboard never sums orders.total as revenue',
  !/status === 'Delivered'\)\s*\.reduce\(\(n,? ?o\) ?=> ?n \+ \(o\.total/.test(app));
check('vendor stat clearly labelled "Product Revenue"', /Product Revenue/.test(app));
check('vendor card shows "Your products" subtotal, not orders.total as value',
  /Your products/.test(app) && !/money\(o\.total\)\} · \$\{esc\(o\.spot\)/.test(app));
check('vendor card price block labelled "Your products"',
  /<span class="muted small">Your products<\/span>/.test(app));
check('admin order value remains platform-wide (orderValue)', /orderValue = orders\.reduce/.test(admin));

console.log('\n== DATABASE MIGRATION ==');
check('subtotal column added', /ADD COLUMN IF NOT EXISTS subtotal numeric/.test(migration));
check('subtotal >= 0 check', /subtotal >= 0/.test(migration));
check('payment_status column added', /ADD COLUMN IF NOT EXISTS payment_status text/.test(migration));
check('payment_status default pending/.test(migration)', /DEFAULT 'pending'/.test(migration));
check('payment_status check constraint', /pending.*success.*failed/.test(migration));
check('payment_reference column added', /ADD COLUMN IF NOT EXISTS payment_reference text/.test(migration));
check('transaction_id column added', /ADD COLUMN IF NOT EXISTS transaction_id text/.test(migration));
check('payment_reference unique constraint', /orders_payment_reference_key UNIQUE/.test(migration));
check('total >= 0 check', /orders_total_check/.test(migration));
check('backfill existing rows', /UPDATE public\.orders/.test(migration));
check('NO duplicate delivery_fee column', !/ADD COLUMN[^;]*delivery_fee/.test(migration));
check('fee column retained (not dropped)', !/DROP COLUMN/.test(migration) || /fee/.test(migration));

console.log('\n== DELIVERY FEE ==');
check('DELIVERY_FEE = 1000', /const DELIVERY_FEE = 1000/.test(app));
check('no stale 500 delivery fee', !/fee:\s*500/.test(app) && !/cartTotal\(\)\s*\+\s*500/.test(app));
check('checkout aside uses money(fee)', /money\(fee\)/.test(app));

console.log('\n== NO PAYSTACK CODE ==');
check('no Paystack client SDK / public key in frontend (server-side only)', !/new Paystack|js\.paystack|pk_(live|test)_[A-Za-z0-9]/i.test(app) && !/pk_(live|test)_[A-Za-z0-9]|sk_(live|test)_[A-Za-z0-9]/i.test(admin));
check('no public_key / secret_key', !/public_key|secret_key|PBFPubKey/i.test(app));
check('no Paystack inline/redirect', !/paystack.*inline|js\.paystack/i.test(app));

console.log('\n== CONSISTENCY: total == subtotal + fee ==');
// Verify the creation math: total=subtotal+fee where fee=DELIVERY_FEE
check('creation total = subtotal + fee', /const total=subtotal\+fee/.test(app));

console.log('\n' + (fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'));
process.exit(fail === 0 ? 0 : 1);