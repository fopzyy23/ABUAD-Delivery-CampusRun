// ============================================================
// validate_vendor_product_crud.js — structural regression checks
// for the Vendor Product CRUD security/behavior boundaries.
// Static source inspection only — no network, no Supabase calls.
// ============================================================
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
let failed = false;

function check(label, ok) {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
  if (!ok) failed = true;
}

// 1. Vendor product INSERT must carry the authenticated vendor's id.
check('product INSERT includes vendor_id: state.user.vendor_id',
  /vendor_id:\s*state\.user\.vendor_id/.test(app));

// 2. Product UPDATEs must remain ownership-scoped. Find each
//    .from('products') statement that contains .update( and require the
//    vendor_id guard within the same statement (before the next .from().
const statements = app.split(/\.from\('products'\)/).slice(1);
const updates = statements.filter(s => /\.update\(/.test(s.split('.from(')[0]));
check(`product UPDATE path exists (got ${updates.length})`, updates.length >= 1);
check('every products UPDATE is scoped with .eq(\'vendor_id\', state.user.vendor_id)',
  updates.every(s => /\.eq\('vendor_id',\s*state\.user\.vendor_id\)/.test(s.split('.from(')[0])));

// 3. Availability remains a reversible product UPDATE, separate from delete.
check('availability handler updates active state',
  /function\s+toggleVendorProductActive\s*\([\s\S]*?\.update\(\{\s*active:\s*newActive\s*\}\)/.test(app));

// 4. Deletion is a secure ownership-checked RPC, not a soft active=false update.
check('vendor product delete invokes delete_vendor_product RPC',
  /function\s+deleteVendorProduct\s*\([\s\S]*?\.rpc\(\s*['"]delete_vendor_product['"]/.test(app));
check('delete handler does not use active=false as its delete operation',
  !/function\s+deleteVendorProduct\s*\([\s\S]*?\.update\(\{\s*active:\s*false\s*\}\)/.test(app));

// 5. Vendors must not issue an unscoped client-side table DELETE.
check('no .from(\'products\')...delete( in app.js',
  !statements.some(s => /\.delete\(/.test(s.split('.from(')[0])));

// 6. Product category rendering must be escaped.
check('product table renders esc(p.category)', /esc\(p\.category\)/.test(app));

// 7. Vendor product INSERT must not use upsert.
check('no .upsert( on products in app.js',
  !statements.some(s => /\.upsert\(/.test(s.split('.from(')[0])));

// 8. The existing vendor product functions must still exist.
for (const fn of [
  'submitVendorProductForm',
  'editVendorProduct',
  'toggleVendorProductActive',
  'deleteVendorProduct',
  'refreshVendorProducts'
]) {
  check(`vendor product function still exists: ${fn}()`,
    new RegExp(`function\\s+${fn}\\s*\\(`).test(app));
}

console.log(failed
  ? '\nVENDOR PRODUCT CRUD VALIDATION FAILED'
  : '\nVENDOR PRODUCT CRUD ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
