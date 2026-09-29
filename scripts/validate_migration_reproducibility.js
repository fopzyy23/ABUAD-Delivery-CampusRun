const fs = require('fs');
const path = require('path');
const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
const names = fs.readdirSync(migrationDir).filter((n) => n.endsWith('.sql')).sort();
let failed = 0;
// Supabase accepts both date-only and timestamp migration versions. Compare
// the complete leading version: two timestamped migrations may share a date.
const versionPattern = /^(\d{8}(?:\d{6})?)_[a-z0-9_]+\.sql$/i;
const malformed = names.filter((n) => !versionPattern.test(n));
console.log(`${malformed.length ? 'FAIL' : 'PASS'} — migration filenames are versioned and well formed`);
if (malformed.length) { console.error(malformed.join(', ')); failed++; }
const versions = new Map();
for (const n of names) {
  const v = n.match(versionPattern)?.[1];
  if (v) versions.set(v, [...(versions.get(v) || []), n]);
}
const duplicate = [...versions.values()].filter((x) => x.length > 1);
console.log(`${duplicate.length ? 'FAIL' : 'PASS'} — migration version prefixes are unique`);
if (duplicate.length) { console.error(duplicate.flat().join(', ')); failed++; }
for (const n of [
  '20261222_fix_paystack_fee_units.sql','20261223_financial_resolution_exclusivity.sql',
  '20261224_recipient_rotation.sql','20261225_restaurant_payment_gate.sql',
  '20261226_refund_provider_reconciliation.sql','20261227_financial_resolution_proof_hardening.sql',
  '20261228_transfer_provider_reconciliation.sql','20261229_rider_settlement_withdrawal_exclusivity.sql',
  '20261230_finalize_transfer_reconciliation_entrypoints.sql','20261231_cutoff_recovery_reliability.sql',
  '20270101_scheduler_environment_configuration.sql',
]) {
  const ok = names.includes(n); console.log(`${ok ? 'PASS' : 'FAIL'} — required hardening migration ${n}`); if (!ok) failed++;
}
function executableSql(file) {
  return fs.readFileSync(path.join(migrationDir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');
}
const historicalFiles = [
  '20261127_automatic_8pm_cutoff_scheduler.sql',
  '20261217_add_cleanup_jobs.sql',
];
const historicalSql = historicalFiles.map(executableSql);
for (let index = 0; index < historicalFiles.length; index++) {
  const safe = !/cron\.schedule\s*\(|net\.http_post\s*\(/i.test(historicalSql[index]) &&
    !/cmfohldnmytmwjynqfpz|https:\/\/[a-z0-9-]+\.supabase\.co/i.test(historicalSql[index]);
  console.log(`${safe ? 'PASS' : 'FAIL'} — replay checkpoint ${historicalFiles[index]} does not activate a network job or contain a fixed project target`);
  if (!safe) failed++;
}
const finalScheduler = executableSql('20270101_scheduler_environment_configuration.sql');
const finalSafe = /dropzyy_scheduler_base_url/.test(finalScheduler) &&
  /v_base_url\s*\|\|\s*'\/functions\/v1\/automatic-cutoff-worker'/.test(finalScheduler) &&
  /v_base_url\s*\|\|\s*'\/functions\/v1\/cleanup-rate-limits'/.test(finalScheduler) &&
  /v_base_url\s*\|\|\s*'\/functions\/v1\/cleanup-admissions'/.test(finalScheduler) &&
  !/https:\/\/cmfohldnmytmwjynqfpz\.supabase\.co/i.test(finalScheduler);
console.log((finalSafe ? 'PASS' : 'FAIL') + ' — final scheduler activation uses the configured Vault base URL only');
if (!finalSafe) failed++;
const requiredJobs = ['dropzyy-automatic-cutoff-worker', 'dropzyy-cleanup-rate-limits', 'dropzyy-cleanup-admissions'];
const scheduledJobs = [...finalScheduler.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/g)].map(match => match[1]);
const jobCountOk = scheduledJobs.length === 3 && requiredJobs.every(job => scheduledJobs.filter(name => name === job).length === 1);
console.log((jobCountOk ? 'PASS' : 'FAIL') + ' — final migration schedules each stable repository job once');
if (!jobCountOk) failed++;
const orderedReplaySafe = historicalFiles.every((file) => {
  const sql = executableSql(file);
  return !/cron\.schedule\s*\(|net\.http_post\s*\(/i.test(sql);
}) && finalSafe && jobCountOk;
console.log(`${orderedReplaySafe ? 'PASS' : 'FAIL'} — ordered static replay: historical checkpoints remain inactive until the final environment-configured scheduler migration`);
if (!orderedReplaySafe) failed++;
const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'validate.yml'), 'utf8');
const edgeValidator = fs.readFileSync(path.join(__dirname, 'validate_edge_function_syntax.js'), 'utf8');
const ciOk = /node-version:\s*22/.test(workflow) && /stripTypeScriptTypes/.test(edgeValidator);
console.log(`${ciOk ? 'PASS' : 'FAIL'} — CI Node runtime supports Edge TypeScript syntax validation`); if (!ciOk) failed++;
if (failed) process.exit(1);
console.log(`MIGRATION REPRODUCIBILITY STATIC CHECKS PASSED (${names.length} migrations).`);
