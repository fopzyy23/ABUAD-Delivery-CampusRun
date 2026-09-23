// ============================================================
// validate_all.js — one command to run every project check
// ============================================================
//   node scripts/validate_all.js            local checks only (offline)
//   node scripts/validate_all.js --live     also run live read-only checks
//                                           (publishable key; needs network)
// 1. node --check syntax pass over ALL project .js files
//    (skips node_modules and .git)
// 2. Every structural validator in scripts/
// 3. With --live: every live (read-only / blocked-write probe) validator
// No dependencies. Exits non-zero if anything fails.
// ============================================================
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const live = process.argv.includes('--live');
let failed = false;

function run(label, cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  const ok = r.status === 0;
  console.log(`\n===== ${label} =====`);
  if (r.stdout) process.stdout.write(r.stdout.endsWith('\n') ? r.stdout : r.stdout + '\n');
  if (r.stderr) process.stderr.write(r.stderr.endsWith('\n') ? r.stderr : r.stderr + '\n');
  console.log(`--- ${ok ? 'PASS' : 'FAIL'}: ${label} ---`);
  if (!ok) failed = true;
  return ok;
}

// ---- 1. Syntax pass over every project JS file ----
const jsFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) jsFiles.push(p);
  }
})(root);
console.log(`node --check over ${jsFiles.length} JS file(s)...`);
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ['--check', f], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) {
    failed = true;
    console.log('SYNTAX FAIL: ' + path.relative(root, f));
    if (r.stderr) process.stderr.write(r.stderr);
  }
}
console.log('Syntax pass complete: ' + (failed ? 'FAILURES FOUND' : 'all OK'));

// ---- 2. Structural validators (offline) ----
const structural = [
  'scripts/validate_vendor_migration.js',
  'scripts/validate_discovery_migration.js',
  'scripts/_validate_payment_prep.js',
  'scripts/validate_b1_b2.js',
  'scripts/validate_b3.js',
  'scripts/validate_b4a.js',
  'scripts/validate_b4b.js',
  'scripts/validate_b5.js',
  'scripts/validate_b6.js',
  'scripts/validate_b7.js',
  'scripts/validate_paystack_checkout.js',
  'scripts/validate_action10.js',
  'scripts/_smoke_action12_sql.js',
  'scripts/validate_action12.js',
  'scripts/validate_vendor_product_crud.js',
  'scripts/validate_product_availability.js',
  'scripts/validate_notifications.js',
  'scripts/validate_refund.js',
  'scripts/validate_rider_pool_payment_gate.js',
  'scripts/validate_seed_sync.js',
  'scripts/validate_hardening.js',
  'scripts/validate_settlement_automation.js',
    'scripts/validate_withdrawal_rpc.js',
  'scripts/validate_withdrawal_bank.js',
  'scripts/validate_vendor_foundation.js',
  'scripts/validate_vendor_followup.js',
  'scripts/validate_vendor_delivery_choice.js'
  ,'scripts/validate_h2_h3.js'
];
for (const rel of structural) {
  if (fs.existsSync(path.join(root, rel))) run(rel, process.execPath, [rel]);
  else console.log(`SKIP (missing): ${rel}`);
}

// ---- 3. Live validators (opt-in via --live) ----
if (live) {
  for (const rel of [
    'scripts/verify_rls_readonly.js',
    'scripts/validate_action11_live.js',
    'scripts/validate_action12_live.js',
    'scripts/validate_b1_b2_live.js'
  ]) {
    if (fs.existsSync(path.join(root, rel))) run(rel + ' (--live)', process.execPath, [rel]);
  }
} else {
  console.log('\n(live checks skipped — pass --live to include them)');
}

console.log('\n==============================');
console.log(failed ? 'VALIDATION FAILED' : 'ALL VALIDATIONS PASSED');
console.log('==============================');
process.exit(failed ? 1 : 0);
