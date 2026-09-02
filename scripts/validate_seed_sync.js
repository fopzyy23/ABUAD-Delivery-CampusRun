// ============================================================
// Seed-data sync validator — compares the three seed copies:
//   1. assets/js/app.js            SEED_DATA (customer app fallback)
//   2. assets/js/admin.js          SEED_DATA (admin panel fallback, IIFE)
//   3. scripts/seed_catalog.js     vendors/products (Supabase upsert tool)
// They are deliberately kept as separate copies (browser scripts cannot
// share a module; seed_catalog runs under Node) — this validator catches
// drift between them. Read-only.   node scripts/validate_seed_sync.js
// ============================================================
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'scripts/seed_catalog.js'), 'utf8');

let fail = 0;
const check = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra && !cond ? '  ' + extra : ''));
  if (!cond) fail++;
};

// Lenient one-object-per-line parsers (seed literals are formatted one per line).
function parseVendors(text, label) {
  const out = new Map();
  const re = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']*)'/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (out.has(m[1])) { console.log(`WARN  duplicate vendor id in ${label}: ${m[1]}`); }
    out.set(m[1], { name: m[2] });
  }
  return out;
}
function parseProducts(text, label) {
  const out = new Map();
  const re = /\{\s*id:\s*(\d+),\s*vendor:\s*'([^']*)',\s*name:\s*'([^']*)',\s*desc:\s*(?:'((?:[^'\\]|\\.)*)')?,\s*price:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (out.has(m[1])) console.log(`WARN  duplicate product id in ${label}: ${m[1]}`);
    out.set(m[1], { vendor: m[2], name: m[3], price: Number(m[5]) });
  }
  return out;
}

const appV = parseVendors(app, 'app.js');
const appP = parseProducts(app, 'app.js');
const admV = parseVendors(admin, 'admin.js');
const admP = parseProducts(admin, 'admin.js');
// seed_catalog.js: vendors list + products list (products use same literal shape)
const seedV = parseVendors(seed, 'seed_catalog.js');
const seedP = parseProducts(seed, 'seed_catalog.js');

console.log('Counts: app.js vendors=' + appV.size + ' products=' + appP.size +
  ' | admin.js vendors=' + admV.size + ' products=' + admP.size +
  ' | seed_catalog.js vendors=' + seedV.size + ' products=' + seedP.size);

console.log('\n== VENDOR CONSISTENCY (id + name) ==');
check('app.js and admin.js vendor sets match',
  appV.size === admV.size && [...appV.keys()].every(k => admV.has(k)));
check('app.js and seed_catalog.js vendor sets match',
  appV.size === seedV.size && [...appV.keys()].every(k => seedV.has(k)));
let vnames = true;
for (const [id, v] of appV) {
  if ((admV.get(id) || {}).name !== v.name || (seedV.get(id) || {}).name !== v.name) {
    vnames = false; console.log('  drift: vendor ' + id + ' -> app="' + v.name + '" admin="' + (admV.get(id) || {}).name + '" seed="' + (seedV.get(id) || {}).name + '"');
  }
}
check('vendor names match across all three copies', vnames);

console.log('\n== PRODUCT CONSISTENCY (id, name, vendor, price) ==');
check('app.js and admin.js product id sets match',
  appP.size === admP.size && [...appP.keys()].every(k => admP.has(k)));
check('app.js and seed_catalog.js product id sets match',
  appP.size === seedP.size && [...appP.keys()].every(k => seedP.has(k)));
let pdrift = [];
for (const [id, p] of appP) {
  const a = admP.get(id) || {}, s = seedP.get(id) || {};
  if (a.name !== p.name || s.name !== p.name) pdrift.push(id + ' name');
  if (a.price !== p.price || s.price !== p.price) pdrift.push(id + ' price');
  if (a.vendor !== p.vendor || s.vendor !== p.vendor) pdrift.push(id + ' vendor');
}
check('product name/price/vendor match across all three copies', pdrift.length === 0,
  pdrift.length ? 'drift: ' + pdrift.join(', ') : '');

console.log('\n== SAFETY GUARDS ==');
check('seed_catalog.js requires the service key from env (no hardcoded key)',
  /SUPABASE_SERVICE_ROLE_KEY = process\.env\.SUPABASE_SERVICE_ROLE_KEY \|\| ''/.test(seed));
check('seed_catalog.js aborts on id clash unless SEED_ALLOW_OVERWRITE / --allow-overwrite',
  /SEED_ALLOW_OVERWRITE/.test(seed) && /--allow-overwrite/.test(seed) && /ABORT: /.test(seed));

console.log('\n' + (fail === 0 ? 'ALL SEED-SYNC CHECKS PASSED' : fail + ' CHECK(S) FAILED'));
process.exit(fail === 0 ? 0 : 1);