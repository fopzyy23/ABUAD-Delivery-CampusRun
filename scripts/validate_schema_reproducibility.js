const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const bootstrap = path.join(root, 'supabase', 'bootstrap', '00000000_base_schema.sql');
const required = ['profiles', 'vendors', 'products', 'orders', 'order_items'];
const sql = fs.readFileSync(bootstrap, 'utf8');
const errors = [];

for (const table of required) {
  if (!new RegExp(`create\\s+table\\s+public\\.${table}\\b`, 'i').test(sql)) {
    errors.push(`missing foundational table: ${table}`);
  }
}
for (const token of ['auth.users', 'gen_random_uuid()', 'enable row level security']) {
  if (!sql.toLowerCase().includes(token.toLowerCase())) errors.push(`missing bootstrap requirement: ${token}`);
}

const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter(name => name.endsWith('.sql'));
if (migrations.length < 100) errors.push('migration inventory unexpectedly incomplete');
if (!fs.existsSync(path.join(root, 'supabase', 'migrations', '20261219_product_images_storage.sql'))) {
  errors.push('missing storage migration');
}

console.log('=== SCHEMA REPRODUCIBILITY STRUCTURAL CHECK ===');
if (errors.length) {
  for (const error of errors) console.log(`FAIL — ${error}`);
  process.exit(1);
}
console.log('PASS — fresh-install bootstrap exists');
console.log('PASS — five original foundational tables represented');
console.log('PASS — auth.users dependencies represented');
console.log('PASS — foundational RLS enabled');
console.log('PASS — storage migration present');
console.log('PASS — migration inventory present');
console.log('NOTE — this is a static check; execute migrations in a fresh database separately');
