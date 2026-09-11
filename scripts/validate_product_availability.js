// ============================================================
// validate_product_availability.js — structural regression checks
// for the per-product Available / Not available feature.
// Static source inspection only — no network, no Supabase calls.
// ============================================================
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const readMig = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
let failed = false;

function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}

// ---- 1. Migration 20261003 ----
let mig = '';
try {
  mig = readMig('20261003_product_availability_ui.sql');
  check('migration 20261003_product_availability_ui.sql exists', mig.length > 0);
} catch (e) {
  check('migration 20261003_product_availability_ui.sql exists', false);
}

// 1a. Public read policy relaxed so unavailable items stay visible.
check('migration drops products_select_public',
  /DROP POLICY IF EXISTS "products_select_public" ON public\.products;/.test(mig));
check('migration recreates products_select_public with USING (true)',
  /CREATE POLICY "products_select_public"[\s\S]*USING \(true\);/.test(mig));

// 1b. products added to the realtime publication (pattern from 20260903).
check('migration adds products to supabase_realtime publication',
  /ALTER PUBLICATION supabase_realtime ADD TABLE public\.products;/.test(mig));

// ---- 2. Customer catalog keeps inactive products visible ----
check('customer catalog query no longer filters .eq(\'active\', true)',
  !app.includes(".eq('active', true)"));
check('customer catalog maps the active flag',
  /active:\s*p\.active\s*!==\s*false/.test(app));

// ---- 3. No alternate customer add path for inactive products ----
check('addCart guards inactive products',
  /function addCart\(id\)\s*\{[^}]*p\.active\s*===\s*false/.test(app));

// ---- 4. Customer product card renders the unavailable state ----
check('productCard shows a disabled button for unavailable items',
  /pcard--unavailable/.test(app));
check('productCard marks inactive products Currently unavailable',
  /🔴 Currently unavailable/.test(app));

// ---- 5. Cart recognises no-longer-available items ----
check('cart marks inactive lines No longer available',
  /No longer available/.test(app));
check('cart disables checkout while an unavailable item is present',
  /unavailable\.length\s*[\?].*disabled[\s\S]{0,120}remove the unavailable item/i.test(app) ||
  /unavailable\.length\s*\?\s*`<button class="btn btn--block mt-2" disabled/.test(app));

// ---- 6. Checkout blocks inactive products before placing the order ----
check('checkout submit pre-checks availability before place_order',
  /items\.find\(x\s*=>\s*x\.active\s*===\s*false\)/.test(app));

// ---- 7. Vendor toggle still flips products.active ----
check('toggleVendorProductActive still exists', /function\s+toggleVendorProductActive\s*\(/.test(app));
check('vendor toggle updates products.active', /update\(\{\s*active:\s*newActive\s*\}/.test(app));
check('vendor dashboard shows Available / Not available states',
  /🟢 Available/.test(app) && /🔴 Not available/.test(app));

// ---- 8. Realtime: subscribed exactly once, with a duplicate guard ----
check('products realtime channel has a once-only guard',
  /if\s*\(\s*productsChannel\s*\)\s*return;/.test(app));
check('products realtime subscription called at boot',
  /subscribeProductsRealtime\(\);/.test(app));

// ---- 9. Server-side protection still intact (no regression) ----
// Latest place_order re-declaration (20260929) must still join active=true.
const porder = readMig('20260929_combined_vendor_fee_settlement.sql');
check('place_order still joins products p.active = true', /p\.active\s*=\s*true/.test(porder));
// Hardening trigger (20260930) still rejects inactive products at item insert.
const hard = readMig('20260930_critical_hardening.sql');
check('hardening trigger still rejects inactive products', /active\s*IS\s*NOT\s*TRUE/.test(hard));

console.log(failed
  ? '\nPRODUCT AVAILABILITY VALIDATION FAILED'
  : '\nPRODUCT AVAILABILITY ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);