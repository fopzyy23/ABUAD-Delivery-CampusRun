// ============================================================
// ACTION 12 validator — Security & Database Hardening
// ============================================================
// Read-only structural checks over:
//   supabase/migrations/20260906_secure_order_pricing.sql
//   assets/js/app.js
// No database access.   node scripts/validate_action12.js
// ============================================================
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20260906_secure_order_pricing.sql'), 'utf8');
const migNC = mig.replace(/--[^\n]*/g, '');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');

let fail = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra && !cond ? '  ' + extra : ''));
  if (!cond) fail++;
}
// Extract a named policy definition block (from its CREATE POLICY to the next DDL boundary).
function policyBlock(name) {
  const i = migNC.indexOf('CREATE POLICY "' + name + '"');
  if (i === -1) return '';
  const rest = migNC.slice(i + 1);
  const next = rest.search(/CREATE (OR REPLACE )?(POLICY|FUNCTION|TRIGGER)|DROP (POLICY|TRIGGER)|REVOKE |GRANT /);
  return rest.slice(0, next === -1 ? undefined : next);
}

console.log('== PRICING RPC (place_order) ==');
check('place_order RPC exists', /CREATE OR REPLACE FUNCTION public\.place_order\(\s*p_items jsonb,\s*p_spot\s*text\s*\)/.test(migNC));
check('RPC is SECURITY DEFINER with fixed search_path', /SECURITY DEFINER\s+SET search_path = public/.test(migNC));
check('RPC requires an authenticated caller', /v_user IS NULL THEN\s+RAISE EXCEPTION 'authentication required'/.test(migNC));
check('delivery fee fixed at 1000 in RPC', /v_fee\s+numeric\(12,2\) := 1000/.test(migNC));
check('prices come from products.price', /SUM\(p\.price \* \(li->>'qty'\)::integer\)/.test(migNC));
check('products joined on id AND active = true', /p\.id::text = li->>'id'\s+AND p\.active = true/.test(migNC));
check('missing/inactive products abort the order', /are unavailable or no longer exist/.test(migNC));
check('RPC never reads a client-supplied price', !/->>'price'/.test(migNC));
check('RPC never reads a client-supplied total/subtotal/fee field', !/->>'(total|subtotal|fee)'/.test(migNC));
check('qty validated 1..99 server-side', /v_qty < 1 OR v_qty > 99/.test(migNC));
check('order number generated server-side', /v_order_number := 'CR-' \|\|/.test(migNC));
check('status + payment_status fixed server-side', /'Order confirmed', 'pending', p_spot, 'rider'/.test(migNC));
check('user_id taken from auth.uid(), not the client', /v_user\s+uuid := auth\.uid\(\)/.test(migNC));
check('EXECUTE granted to authenticated only', /GRANT EXECUTE ON FUNCTION public\.place_order\(jsonb, text\) TO authenticated/.test(migNC));
check('EXECUTE revoked from anon + PUBLIC', /REVOKE EXECUTE ON FUNCTION public\.place_order\(jsonb, text\) FROM anon;\s+REVOKE EXECUTE ON FUNCTION public\.place_order\(jsonb, text\) FROM PUBLIC;/.test(migNC));

console.log('\n== DIRECT-WRITE LOCKDOWN ==');
check('orders INSERT revoked from authenticated', /REVOKE INSERT ON public\.orders FROM authenticated;/.test(migNC));
check('orders INSERT revoked from anon', /REVOKE INSERT ON public\.orders FROM anon;/.test(migNC));
check('order_items INSERT revoked from authenticated', /REVOKE INSERT ON public\.order_items FROM authenticated;/.test(migNC));
check('order_items UPDATE revoked from authenticated', /REVOKE UPDATE ON public\.order_items FROM authenticated;/.test(migNC));
check('order_items DELETE revoked from authenticated', /REVOKE DELETE ON public\.order_items FROM authenticated;/.test(migNC));
check('orders UPDATE grant NOT revoked (workflows intact)', !/REVOKE UPDATE ON public\.orders/.test(migNC));
check('no RLS disabled anywhere', !/DISABLE (ROW LEVEL )?SECURITY|FORCE ROW LEVEL/.test(migNC));
check('no policy deleted without recreation (vendor/assigned recreated)', /DROP POLICY IF EXISTS "orders_update_vendor"/.test(migNC) && policyBlock('orders_update_vendor') !== '' && /DROP POLICY IF EXISTS "orders_update_assigned"/.test(migNC) && policyBlock('orders_update_assigned') !== '');

console.log('\n== ITEM PRICING TRIGGER (defense in depth) ==');
check('enforce_order_item_pricing() exists', /CREATE OR REPLACE FUNCTION public\.enforce_order_item_pricing\(\)/.test(migNC));
check('trigger is SECURITY DEFINER with fixed search_path', /SECURITY DEFINER\s+SET search_path = public/.test(migNC));
check('BEFORE INSERT trigger on order_items', /CREATE TRIGGER trg_enforce_order_item_pricing\s+BEFORE INSERT ON public\.order_items/.test(migNC));
check('trigger overrides NEW.price from products', /NEW\.price\s*:= v_product\.price/.test(migNC));
check('trigger overrides NEW.vendor_id from products', /NEW\.vendor_id\s*:= v_product\.vendor_id/.test(migNC));
check('trigger overrides NEW.name from products', /NEW\.name\s*:= v_product\.name/.test(migNC));
check('trigger rejects nonexistent products', /product % does not exist/.test(migNC));
check('trigger rejects inactive products', /v_product\.active IS NOT TRUE/.test(migNC));
check('trigger rejects qty < 1', /NEW\.qty IS NULL OR NEW\.qty < 1/.test(migNC));
// ============================================================
// VENDOR / RIDER POLICY FIXES
// ============================================================
const vendorBlock = policyBlock('orders_update_vendor');
const riderBlock = policyBlock('orders_update_assigned');
const vendorWithCheck = (vendorBlock.match(/WITH CHECK \([\s\S]*$/) || [''])[0];

check('vendor policy USING restricted to pre-transit statuses', /status IN \('Order confirmed', 'Preparing', 'Ready for pickup'\)/.test(vendorBlock));
check('vendor Delivered allowed only in vendor_self branch', /\(delivery_method = 'vendor_self'\s+AND status IN \('Order confirmed', 'Preparing', 'Delivered', 'Cancelled'\)\)/.test(vendorWithCheck));
const riderBothBranch = vendorWithCheck.match(/delivery_method IN \('rider', 'both'\)\s+AND status IN \([^)]*\)/);
check('rider/both vendor branch excludes Delivered', !!riderBothBranch && !riderBothBranch[0].includes("'Delivered'"));
check('rider/both vendor branch keeps Ready for pickup + Cancelled', !!riderBothBranch && riderBothBranch[0].includes("'Ready for pickup'") && riderBothBranch[0].includes("'Cancelled'"));
check('rider policy USING restricted to active delivery states', /USING \(\s*public\.caller_owns_rider\(rider_id\)\s+AND status IN \('Rider assigned', 'Picked up', 'On the Way'\)\s*\)/.test(riderBlock));
check('rider policy WITH CHECK unchanged (Picked up/On the Way/Delivered)', /WITH CHECK \(\s*public\.caller_owns_rider\(rider_id\)\s+AND status IN \('Picked up', 'On the Way', 'Delivered'\)\s*\)/.test(riderBlock));

console.log('\n== TRANSITION TRIGGER UPDATE ==');
check('enforce_order_status_transitions() redefined', /CREATE OR REPLACE FUNCTION public\.enforce_order_status_transitions\(\)/.test(migNC));
check('vendor Delivered requires delivery_method = vendor_self', /OLD\.status = 'Preparing' AND NEW\.status = 'Delivered'\s+AND NEW\.delivery_method = 'vendor_self'/.test(migNC));
check('admin bypass preserved', /IF public\.is_admin\(\) THEN\s+RETURN NEW;/.test(migNC));
check('customer Delivered→Rated rule preserved', /OLD\.status = 'Delivered' AND NEW\.status = 'Rated'/.test(migNC));
check('customer cancel rule preserved', /OLD\.status IN \('Order confirmed', 'Preparing'\) AND NEW\.status = 'Cancelled'/.test(migNC));
check('rider linear progression preserved', /OLD\.status = 'Rider assigned' AND NEW\.status = 'Picked up'/.test(migNC) && /OLD\.status = 'On the Way' AND NEW\.status = 'Delivered'/.test(migNC));
check('illegal transitions still raise', /Illegal order status transition/.test(migNC));

console.log('\n== CLIENT (app.js) ==');
check('checkout calls the place_order RPC', /\.rpc\('place_order'/.test(app));
check('client sends only ids + quantities', /p_items: lines/.test(app));
check('client no longer inserts into orders', !/from\('orders'\)\s*[\s\S]{0,200}?\.insert\(/.test(app));
check('client no longer inserts into order_items', !/from\('order_items'\)\s*[\s\S]{0,200}?\.insert\(/.test(app));
check('client adopts server subtotal/fee/total', /order\.subtotal = Number\(data\.order\.subtotal\)/.test(app) && /order\.fee = Number\(data\.order\.fee\)/.test(app) && /order\.total = Number\(data\.order\.total\)/.test(app));
check('vendor UI: Mark delivered only for vendor_self', /o\.delivery_method === 'vendor_self'/.test(app) && !/o\.delivery_method === 'rider'\s*\?\s*`<button class="btn btn--sm" data-vendor-status[\s\S]{0,120}Ready for pickup[\s\S]{0,160}Delivered/.test(app));
check('DELIVERY_FEE still 1000 client-side (display only)', /const DELIVERY_FEE = 1000/.test(app));

console.log('\n== SECURITY INVARIANTS ==');
check('no service_role anywhere in the migration', !/service_role/i.test(mig));
check('no payment-gateway code in app.js/admin.js/migration', !/paystack|flutterwave|stripe/i.test(app + admin + mig));
check('no destructive DDL (DROP TABLE/DROP COLUMN/TRUNCATE)', !/DROP TABLE|DROP COLUMN|TRUNCATE/i.test(migNC));
check('no new secret or key material', !/(secret|api[_-]?key|password)\s*[:=]\s*['"][^'"]{8,}/i.test(mig));
check('admin.js unchanged paths (still RPC-based, no profiles.update)', !/from\('profiles'\)\s*[\s\S]{0,120}\.update\(/.test(admin));

console.log('\n' + (fail === 0 ? 'ALL ACTION 12 CHECKS PASSED' : fail + ' CHECK(S) FAILED'));
process.exit(fail === 0 ? 0 : 1);
