// ============================================================
// validate_b1_b2.js — structural validator for the pre-Paystack
// blockers B1 (payment-column lock) + B2 (identifier uniqueness).
// Offline: reads the migration SQL only. No DB access needed.
// No dependencies. Exits non-zero if anything fails.
// ============================================================
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const nc = s => s.replace(/--[^\n]*/g, ''); // strip comments

const b1 = read('supabase/migrations/20260907_lock_order_payment_columns.sql');
const b2 = read('supabase/migrations/20260908_order_identifier_uniqueness.sql');
const b1nc = nc(b1);
const b2nc = nc(b2);
const app = read('assets/js/app.js');

let fail = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (cond ? '' : '  ' + extra));
  if (!cond) fail++;
}

console.log('== B1: trigger function hardening ==');
check('B1 replaces prevent_order_unauthorized_changes()',
  /CREATE OR REPLACE FUNCTION public\.prevent_order_unauthorized_changes\(\)/.test(b1nc));
check('guard: payment_status blocked', /NEW\.payment_status IS DISTINCT FROM OLD\.payment_status/.test(b1nc));
check('guard: payment_reference blocked', /NEW\.payment_reference IS DISTINCT FROM OLD\.payment_reference/.test(b1nc));
check('guard: transaction_id blocked', /NEW\.transaction_id IS DISTINCT FROM OLD\.transaction_id/.test(b1nc));
check('guard: subtotal blocked', /NEW\.subtotal IS DISTINCT FROM OLD\.subtotal/.test(b1nc));
check('guards run for ALL roles (gated only on the server GUC)', /IF NOT v_server_update THEN\s+IF NEW\.payment_status/.test(b1nc));
check('server-side escape hatch is the app.order_server_update GUC', /app\.order_server_update/.test(b1nc));
check('legacy guard user_id preserved', /NEW\.user_id IS DISTINCT FROM OLD\.user_id/.test(b1nc));
check('legacy guard order_number preserved', /NEW\.order_number IS DISTINCT FROM OLD\.order_number/.test(b1nc));
check('legacy guard total/fee/spot (non-admin) preserved',
  /NEW\.total IS DISTINCT FROM OLD\.total/.test(b1nc) &&
  /NEW\.fee IS DISTINCT FROM OLD\.fee/.test(b1nc) &&
  /NEW\.spot IS DISTINCT FROM OLD\.spot/.test(b1nc) &&
  /NOT public\.is_admin\(\) THEN/.test(b1nc));
check('trigger re-bound to orders', /CREATE TRIGGER trg_prevent_order_unauthorized_changes\s+BEFORE UPDATE ON public\.orders/.test(b1nc));
console.log('\n== B1: no security regressions ==');
check('no RLS weakened / disabled in B1', !/DISABLE\s+(ROW LEVEL\s+)?SECURITY|FORCE ROW LEVEL|DROP POLICY|REVOKE .* ON public\.orders|REVOKE .* ON public\.order_items/.test(b1nc));
check('no Paystack code in B1 (comments excluded)', !/paystack/i.test(b1nc));

console.log('\n== B2: audit + safe legacy resolution ==');
check('audit counts NULL/blank order_number', /WHERE order_number IS NULL OR btrim\(order_number\) = ''/.test(b2nc));
check('audit groups duplicate order_number', /GROUP BY order_number\s+HAVING count\(\*\) > 1/.test(b2nc));
check('audit groups duplicate transaction_id', /GROUP BY transaction_id\s+HAVING count\(\*\) > 1/.test(b2nc));
check('resolution opts in via the B1 server GUC (transaction-local)',
  /set_config\('app\.order_server_update', 'on', true\)/.test(b2nc));
check('NULL/blank order_number resolved deterministically', /md5\('legacy:' \|\| r\.id::text \|\| ':' \|\| v_attempt::text\)/.test(b2nc));
check('duplicate order_number resolution is collision-checked', /EXIT WHEN NOT EXISTS \(SELECT 1 FROM public\.orders( \w+)? WHERE (\w+\.)?order_number = v_new\)/.test(b2nc));
check('resolution keeps rows (no DELETE / TRUNCATE / DROP COLUMN)',
  !/DELETE FROM public\.orders|TRUNCATE|DROP COLUMN/i.test(b2nc));
check('blank transaction_id normalized to NULL', /SET transaction_id = NULL\s+WHERE transaction_id IS NOT NULL AND btrim\(transaction_id\) = ''/.test(b2nc));

console.log('\n== B2: constraints / indexes ==');
check('order_number NOT NULL enforced', /ALTER COLUMN order_number SET NOT NULL/.test(b2nc));
check('UNIQUE constraint orders_order_number_key added (guarded)',
  /ADD CONSTRAINT orders_order_number_key UNIQUE \(order_number\)/.test(b2nc) &&
  /conname = 'orders_order_number_key'/.test(b2nc));
check('partial UNIQUE index on non-null transaction_id',
  /CREATE UNIQUE INDEX IF NOT EXISTS orders_transaction_id_uniq\s+ON public\.orders \(transaction_id\)\s+WHERE transaction_id IS NOT NULL/.test(b2nc));
check('payment_reference UNIQUE constraint re-asserted (idempotent)',
  /ADD CONSTRAINT orders_payment_reference_key UNIQUE \(payment_reference\)/.test(b2nc) &&
  /conname = 'orders_payment_reference_key'/.test(b2nc));

console.log('\n== B2: place_order collision-safe order numbers ==');
check('place_order re-declared with identical signature', /CREATE OR REPLACE FUNCTION public\.place_order\(\s*p_items jsonb,\s*p_spot\s*text\s*\)/.test(b2nc));
check('still SECURITY DEFINER with fixed search_path', /SECURITY DEFINER\s+SET search_path = public/.test(b2nc));
check('order number is re-checked against existing rows', /EXIT WHEN NOT EXISTS \(\s*SELECT 1 FROM public\.orders WHERE order_number = v_order_number\s*\)/.test(b2nc));
check('generation loop is bounded (no infinite retry)', /v_attempt > 10 THEN\s+RAISE EXCEPTION/.test(b2nc));
check('server-side money values unchanged (fee 1000, status fixed server-side)',
  /v_fee\s+numeric\(12,2\)\s*:=\s*1000/.test(b2nc) &&
  /'Order confirmed', 'pending', p_spot, 'rider'/.test(b2nc));
check('grant model preserved (authenticated only)', /GRANT EXECUTE ON FUNCTION public\.place_order\(jsonb, text\) TO authenticated/.test(b2nc));

console.log('\n== No unrelated changes ==');
check('no Paystack code in B2 (comments excluded)', !/paystack/i.test(b2nc));
check('no settlement tables created', !/CREATE TABLE/i.test(b2nc));
check('no rider 80/20 / commission logic added (comments excluded)',
  !/0\.8|80\/20|commission/i.test(b2nc) && !/0\.8|80\/20|commission/i.test(b1nc));
check('frontend never writes payment fields', !/payment_status:\s*'success'/.test(app) && !/payment_reference:'/.test(app));

console.log('\n' + (fail === 0 ? 'ALL CHECKS PASSED' : fail + ' CHECK(S) FAILED'));
process.exit(fail === 0 ? 0 : 1);
