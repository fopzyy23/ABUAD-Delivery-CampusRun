// ============================================================
// validate_rider_pool_payment_gate.js
// ============================================================
// Regression validator for the rider-pool payment-eligibility fix
// (migration 20261001_rider_pool_payment_visibility.sql).
// Read-only structural checks over the migrations + app.js, plus an
// offline truth table that re-plays the shipped policy/trigger
// predicates against the required cases:
//   1. pending order  → NOT visible / NOT claimable / NOT notified
//   2. failed order   → NOT visible / NOT claimable / NOT notified
//   3. success + 'Ready for pickup' + unassigned
//                     → visible / claimable / notified
// No database access.   node scripts/validate_rider_pool_payment_gate.js
// ============================================================
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

const fixMig = stripComments(read('supabase/migrations/20261001_rider_pool_payment_visibility.sql'));
const fixMigRaw = read('supabase/migrations/20261001_rider_pool_payment_visibility.sql');
const mig16 = stripComments(read('supabase/migrations/20260916_require_paid_orders_for_rider_claim.sql'));
const mig17 = stripComments(read('supabase/migrations/20260917_notify_riders_new_pool_order.sql'));
const mig30 = stripComments(read('supabase/migrations/20260930_critical_hardening.sql'));
const mig29 = stripComments(read('supabase/migrations/20260929_combined_vendor_fee_settlement.sql'));
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');

let fail = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond ? '' : '  ' + extra));
  if (!cond) fail++;
}

// Extract the full text of a CREATE POLICY ... block (up to the next DDL/`;`).
function policyBlock(sql, name) {
  const i = sql.indexOf('CREATE POLICY "' + name + '"');
  if (i === -1) return '';
  const rest = sql.slice(i);
  const m = rest.match(/;[\s\S]*?(CREATE|DROP)/);
  return m ? rest.slice(0, rest.indexOf(m[0]) + 1) : rest;
}

// Extract a parenthesized USING ( ... ) / WITH CHECK ( ... ) body.
function parenBody(block, keyword) {
  const i = block.indexOf(keyword);
  if (i === -1) return '';
  const open = block.indexOf('(', i);
  if (open === -1) return '';
  let depth = 0;
  for (let j = open; j < block.length; j++) {
    if (block[j] === '(') depth++;
    else if (block[j] === ')') {
      depth--;
      if (depth === 0) return block.slice(open + 1, j);
    }
  }
  return '';
}

// Parse the pool-policy predicates out of real SQL text (data-driven —
// the truth table below is evaluated from THESE parsed values, not
// from hardcoded copies).
function parsePoolUsing(usingSql, expectRiderHelper) {
  const statusIn = (usingSql.match(/status\s+IN\s*\(([^)]*)\)/) || [])[1] || '';
  return {
    statusList: statusIn.split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean),
    riderIdIsNull: /rider_id\s+IS\s+NULL/.test(usingSql),
    deliveryMethodRider: /delivery_method\s*=\s*'rider'/.test(usingSql),
    paymentStatusSuccess: /payment_status\s*=\s*'success'/.test(usingSql),
    riderHelper: new RegExp(expectRiderHelper).test(usingSql)
  };
}

// Truth-table evaluators mirroring the RLS/trigger semantics.
// riderApproved/available context = true (approved online rider).
function evalSelect(p, row) {
  return p.statusList.includes(row.status)
    && (!p.riderIdIsNull || row.rider_id === null)
    && (!p.deliveryMethodRider || row.delivery_method === 'rider')
    && (!p.paymentStatusSuccess || row.payment_status === 'success')
    && p.riderHelper;
}
function evalNotify(p, row) {
  return (!p.deliveryMethodRider || row.delivery_method === 'rider')
    && (!p.paymentStatusSuccess || row.payment_status === 'success')
    && (!p.riderIdIsNull || row.rider_id === null)
    && (!p.statusEqReady || row.status === 'Ready for pickup');
}
function evalClaim(p, row) {
  // USING on the OLD row + WITH CHECK (caller sets OWN rider_id and
  // status = 'Rider assigned' → caller_owns_rider true).
  return evalSelect(p, row) && row.status !== 'Rider assigned';
}

console.log('== MIGRATION 20261001 (this fix) ==');
check('migration recreates orders_select_unassigned',
  /DROP POLICY IF EXISTS "orders_select_unassigned" ON public\.orders;\s*CREATE POLICY "orders_select_unassigned" ON public\.orders/.test(fixMig));
const selBlock = policyBlock(fixMig, 'orders_select_unassigned');
const selUsing = parenBody(selBlock, 'USING');
check('SELECT policy keeps status whitelist (Order confirmed + Ready for pickup)',
  /status\s+IN\s*\(\s*'Order confirmed'\s*,\s*'Ready for pickup'\s*\)/.test(selUsing));
check('SELECT policy keeps rider_id IS NULL', /rider_id\s+IS\s+NULL/.test(selUsing));
check('SELECT policy keeps delivery_method = rider', /delivery_method\s*=\s*'rider'/.test(selUsing));
check('SELECT policy NOW REQUIRES payment_status = success', /payment_status\s*=\s*'success'/.test(selUsing));
check('SELECT policy keeps is_approved_rider() gate', /public\.is_approved_rider\(\)/.test(selUsing));
check('migration rebuilds enforce_order_status_transitions()',
  /CREATE OR REPLACE FUNCTION public\.enforce_order_status_transitions\(\)/.test(fixMig));
const claimBranch = fixMig.match(/IF\s+OLD\.rider_id\s+IS\s+NULL[\s\S]{0,400}?NEW\.status\s*=\s*'Rider assigned'/) || [''];
check('transition-trigger claim branch requires OLD.payment_status = success',
  /OLD\.payment_status\s*=\s*'success'/.test(claimBranch[0]));
check('transition trigger keeps linear rider progression',
  /OLD\.status = 'Rider assigned' AND NEW\.status = 'Picked up'/.test(fixMig)
  && /OLD\.status = 'On the Way' AND NEW\.status = 'Delivered'/.test(fixMig));
check('transition trigger keeps admin bypass', /IF public\.is_admin\(\) THEN\s*RETURN NEW;/.test(fixMig));
check('transition trigger keeps customer rules',
  /OLD\.status = 'Delivered' AND NEW\.status = 'Rated'/.test(fixMig)
  && /OLD\.status IN \('Order confirmed', 'Preparing'\) AND NEW\.status = 'Cancelled'/.test(fixMig));
check('transition trigger keeps vendor rules',
  /OLD\.status = 'Preparing' AND NEW\.status = 'Ready for pickup'/.test(fixMig)
  && /public\.order_has_vendor_item\(OLD\.id\)/.test(fixMig));
check('illegal transitions still raise', /Illegal order status transition/.test(fixMig));
check('migration is idempotent (DROP POLICY IF EXISTS, no destructive DDL)',
  /DROP POLICY IF EXISTS/.test(fixMig) && !/DROP TABLE|DROP COLUMN|TRUNCATE/i.test(fixMigRaw));

console.log('\n== FORBIDDEN SURFACES (unchanged) ==');
check('migration does NOT touch Paystack RPCs',
  !/handle_paystack_payment_(success|failed)|create_pending_payment/.test(fixMig));
check('migration does NOT touch the payments ledger / webhook / refunds',
  !/public\.payments\b|paystack|refund/i.test(fixMig));
check('migration does NOT touch place_order', !/place_order/.test(fixMig));
check('no secret/key material in migration',
  !/(secret|api[_-]?key|password)\s*[:=]\s*['"][^'"]{8,}/i.test(fixMigRaw));

console.log('\n== PRE-EXISTING GUARDS (still in place) ==');
const claimBlock = policyBlock(mig16, 'orders_update_claim');
const claimUsing = parenBody(claimBlock, 'USING');
const claimWithCheck = parenBody(claimBlock, 'WITH CHECK');
check('20260916 claim policy still requires payment_status = success',
  /payment_status\s*=\s*'success'/.test(claimUsing));
check('20260916 claim policy keeps pool conditions',
  /status\s+IN\s*\(\s*'Order confirmed'\s*,\s*'Ready for pickup'\s*\)/.test(claimUsing)
  && /rider_id\s+IS\s+NULL/.test(claimUsing)
  && /delivery_method\s*=\s*'rider'/.test(claimUsing)
  && /public\.is_available_rider\(\)/.test(claimUsing));
check('20260916 claim policy WITH CHECK unchanged (own rider + Rider assigned)',
  /public\.caller_owns_rider\(rider_id\)/.test(claimWithCheck)
  && /status\s*=\s*'Rider assigned'/.test(claimWithCheck));
check('20260917 notify trigger requires payment_status = success',
  /NEW\.payment_status\s*=\s*'success'/.test(mig17));
check('20260917 notify trigger requires Ready for pickup + unassigned + rider-delivery',
  /NEW\.status\s*=\s*'Ready for pickup'/.test(mig17)
  && /NEW\.rider_id\s+IS\s+NULL/.test(mig17)
  && /NEW\.delivery_method\s*=\s*'rider'/.test(mig17));
check('20260930 does NOT redefine orders_select_unassigned (20261001 stays canonical)',
  !/orders_select_unassigned/.test(mig30));

console.log('\n== ORDER CREATION FLOW (unchanged) ==');
check('place_order still creates status=Order confirmed, payment_status=pending, delivery_method=rider',
  /'Order confirmed', 'pending', p_spot, 'rider'/.test(mig29));

console.log('\n== CLIENT (app.js, defense-in-depth only) ==');
check('pool query filters payment_status = success',
  /\.in\('status',\s*\['Order confirmed','Ready for pickup'\]\)[\s\S]{0,200}\.eq\('payment_status', 'success'\)/.test(app));
check('rider() pending filter requires payment_status === success',
  /const pending = state\.riderPool\.filter\(o =>[\s\S]{0,300}o\.payment_status === 'success'/.test(app));

console.log('\n== REGRESSION TRUTH TABLE (predicates parsed from the shipped SQL) ==');
const parsedSelect = parsePoolUsing(selUsing, 'is_approved_rider');
const parsedClaim = parsePoolUsing(claimUsing, 'is_available_rider');
const notifyBody = (mig17.match(/IF\s+NEW\.delivery_method[\s\S]*?END IF;/) || [''])[0];
const parsedNotify = parsePoolUsing(notifyBody, 'riders');
parsedNotify.statusEqReady = /NEW\.status\s*=\s*'Ready for pickup'/.test(notifyBody);

const rows = [
  { label: 'pending + Ready for pickup + unassigned',
    row: { status: 'Ready for pickup', rider_id: null, delivery_method: 'rider', payment_status: 'pending' },
    expect: { select: false, claim: false, notify: false } },
  { label: 'failed + Ready for pickup + unassigned',
    row: { status: 'Ready for pickup', rider_id: null, delivery_method: 'rider', payment_status: 'failed' },
    expect: { select: false, claim: false, notify: false } },
  { label: 'success + Ready for pickup + unassigned',
    row: { status: 'Ready for pickup', rider_id: null, delivery_method: 'rider', payment_status: 'success' },
    expect: { select: true, claim: true, notify: true } },
  { label: 'success + Order confirmed + unassigned',
    row: { status: 'Order confirmed', rider_id: null, delivery_method: 'rider', payment_status: 'success' },
    expect: { select: true, claim: true, notify: false } },
  { label: 'success + Ready for pickup + vendor_self',
    row: { status: 'Ready for pickup', rider_id: null, delivery_method: 'vendor_self', payment_status: 'success' },
    expect: { select: false, claim: false, notify: false } }
];

for (const { label, row, expect } of rows) {
  const visible = evalSelect(parsedSelect, row);
  const claimable = evalClaim(parsedClaim, row);
  const notified = evalNotify(parsedNotify, row);
  const ok = visible === expect.select && claimable === expect.claim && notified === expect.notify;
  console.log((ok ? 'PASS' : 'FAIL') + ' — [' + label + ']  visible=' + visible
    + ' claimable=' + claimable + ' notified=' + notified
    + (ok ? '' : '  expected ' + JSON.stringify(expect)));
  if (!ok) fail++;
}

console.log('\n' + (fail === 0
  ? 'ALL RIDER-POOL PAYMENT GATE CHECKS PASSED'
  : fail + ' CHECK(S) FAILED'));
process.exit(fail === 0 ? 0 : 1);


