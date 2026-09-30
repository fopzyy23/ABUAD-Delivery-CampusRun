const fs = require('fs');
const path = require('path');

let failed = 0;
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const check = (label, condition) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${label}`);
  if (!condition) failed++;
};

const docs = read('DEPLOYMENT.md');
const baseline = read('supabase/BASELINE.md');
const migration = read('supabase/migrations/20270101_scheduler_environment_configuration.sql');
const cutoffHistory = read('supabase/migrations/20261127_automatic_8pm_cutoff_scheduler.sql');
const cleanupHistory = read('supabase/migrations/20261217_add_cleanup_jobs.sql');
const uncomment = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
const historicalSchedulerSql = uncomment(cutoffHistory + '\n' + cleanupHistory);
const workflow = read('.github/workflows/validate.yml');
const requiredMigrations = [
  '20261222_fix_paystack_fee_units.sql', '20261223_financial_resolution_exclusivity.sql',
  '20261224_recipient_rotation.sql', '20261225_restaurant_payment_gate.sql',
  '20261226_refund_provider_reconciliation.sql', '20261227_financial_resolution_proof_hardening.sql',
  '20261228_transfer_provider_reconciliation.sql', '20261229_rider_settlement_withdrawal_exclusivity.sql',
  '20261230_finalize_transfer_reconciliation_entrypoints.sql', '20261231_cutoff_recovery_reliability.sql',
  '20270101_scheduler_environment_configuration.sql', '20270102_customer_reimbursement_provider_reconciliation.sql',
  '20270103_reimbursement_reconciliation_final_hardening.sql',
  '20270104_transfer_conflict_observation.sql',
];

for (const name of requiredMigrations) {
  check(`migration exists: ${name}`, fs.existsSync(path.join(__dirname, '..', 'supabase', 'migrations', name)));
}
for (const name of ['automatic_cutoff_worker_secret', 'cleanup_job_secret', 'dropzyy_scheduler_base_url', 'AUTOMATIC_CUTOFF_WORKER_SECRET', 'CLEANUP_JOB_SECRET', 'REFUND_RECONCILIATION_WORKER_SECRET', 'TRANSFER_RECONCILIATION_WORKER_SECRET']) {
  check(`deployment documentation names ${name}`, docs.includes(name));
}
check('forward scheduler migration has no historical project URL', !migration.includes('cmfohldnmytmwjynqfpz.supabase.co'));
check('scheduler configuration uses Vault base URL', migration.includes('dropzyy_scheduler_base_url'));
check('historical replay creates no cron/network jobs or fixed project target', !/cron\.schedule\s*\(|net\.http_post\s*\(|cmfohldnmytmwjynqfpz|https:\/\/[a-z0-9-]+\.supabase\.co/i.test(historicalSchedulerSql));
check('historical migrations do not require Vault worker secrets for schema replay', !/vault\.decrypted_secrets|automatic_cutoff_worker_secret|cleanup_job_secret/i.test(historicalSchedulerSql));
check('deployment runbook says worker Vault secrets are not required during replay', /not required for migration replay/i.test(docs) && docs.includes('Required before migration replay'));
check('deployment runbook warns the current CLI link is production', /currently\s+links\s+to production/.test(docs));
check('deployment guides keep scheduler Vault activation after function deployment', docs.indexOf('Keep\n   `dropzyy_scheduler_base_url`') < docs.indexOf('Deploy every function') && docs.indexOf('Deploy every function') < docs.indexOf('Add the three database Vault entries') && baseline.indexOf('scheduler Vault values') < baseline.indexOf('Deploy every directory') && baseline.indexOf('Deploy every directory') < baseline.indexOf('Provision the three scheduler Vault values'));
check('deployment guides contain no stale instruction to provision scheduler Vault before migration replay', !/Vault entry listed in §8 before\s+applying the scheduler migration|Vault `automatic_cutoff_worker_secret` and `cleanup_job_secret` before a clean migration run/i.test(docs + baseline));
const jobNames = ['dropzyy-automatic-cutoff-worker', 'dropzyy-cleanup-rate-limits', 'dropzyy-cleanup-admissions'];
check('scheduler reconciliation has stable job names', jobNames.every((name) => migration.includes(name)));
check('final scheduler creates exactly three environment-derived HTTP jobs', (migration.match(/cron\.schedule\s*\(/g) || []).length === 3 && /v_base_url\s*\|\|\s*'\/functions\/v1\//.test(migration));
check('final scheduler removes only its three known job names', jobNames.every((name) => migration.includes(`cron.unschedule('${name}')`)));
check('required worker functions are documented', ['automatic-cutoff-worker', 'cleanup-rate-limits', 'cleanup-admissions', 'paystack-refund-reconcile', 'paystack-transfer-reconcile'].every((name) => docs.includes(name)));
check('CI uses Node 22 for Edge TypeScript validation', /node-version:\s*22/.test(workflow));

if (failed) process.exit(1);
console.log('DEPLOYMENT PREREQUISITE STATIC CHECKS PASSED.');
