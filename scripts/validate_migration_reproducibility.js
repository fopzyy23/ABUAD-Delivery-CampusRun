const fs = require('fs');
const path = require('path');
const migrationDir = path.join(__dirname, '..', 'supabase', 'migrations');
const bootstrapPath = path.join(__dirname, '..', 'supabase', 'bootstrap', '00000000_base_schema.sql');
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
  '20270101_scheduler_environment_configuration.sql','20270102_customer_reimbursement_provider_reconciliation.sql',
  '20270103_reimbursement_reconciliation_final_hardening.sql','20270104_transfer_conflict_observation.sql',
]) {
  const ok = names.includes(n); console.log(`${ok ? 'PASS' : 'FAIL'} — required hardening migration ${n}`); if (!ok) failed++;
}
const bootstrapSql = fs.readFileSync(bootstrapPath, 'utf8');
const ridersMigrationName = '20260819_restore_rider_hub.sql';
const ridersMigrationSql = names.includes(ridersMigrationName)
  ? fs.readFileSync(path.join(migrationDir, ridersMigrationName), 'utf8')
  : '';
function ridersTableDefinition(sql) {
  return sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+public\.riders\s*\(([\s\S]*?)\)\s*;/i)?.[1] ?? null;
}
function normalizeDefinition(sql) {
  return sql.toLowerCase().replace(/\s+/g, '').replace(/;$/, '');
}
const bootstrapRiders = ridersTableDefinition(bootstrapSql);
const migrationRiders = ridersTableDefinition(ridersMigrationSql);
const bootstrapHasRiders = bootstrapRiders !== null;
console.log(`${bootstrapHasRiders ? 'PASS' : 'FAIL'} — fresh-install bootstrap defines public.riders before migration replay`);
if (!bootstrapHasRiders) failed++;
const profilesPosition = bootstrapSql.search(/CREATE\s+TABLE\s+public\.profiles\s*\(/i);
const ridersPosition = bootstrapSql.search(/CREATE\s+TABLE\s+public\.riders\s*\(/i);
const dependencyOrderOk = profilesPosition >= 0 && ridersPosition > profilesPosition;
console.log(`${dependencyOrderOk ? 'PASS' : 'FAIL'} — bootstrap creates profiles before its riders foreign-key dependency`);
if (!dependencyOrderOk) failed++;
const requiredRiderShape = [
  'id uuid primary key default gen_random_uuid()',
  'user_id uuid not null references public.profiles(id) on delete cascade',
  'matric_number text not null',
  'phone text not null',
  "status text not null default 'pending' check (status in ('pending','approved','rejected','suspended'))",
  'available boolean not null default false',
  'rating_avg numeric(3,2) not null default 5.00',
  'rating_count integer not null default 0',
  'created_at timestamptz not null default now()',
  'updated_at timestamptz not null default now()',
];
const normalizedBootstrapRiders = normalizeDefinition(bootstrapRiders || '');
const completeRiderShape = requiredRiderShape.every((field) =>
  normalizedBootstrapRiders.includes(normalizeDefinition(field)));
console.log(`${completeRiderShape ? 'PASS' : 'FAIL'} — bootstrap riders definition retains all expected initial columns, types, defaults and constraints`);
if (!completeRiderShape) failed++;
const migrationUsesCompatibleCreate = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.riders\s*\(/i.test(ridersMigrationSql);
console.log(`${migrationUsesCompatibleCreate ? 'PASS' : 'FAIL'} — 20260819 keeps CREATE TABLE IF NOT EXISTS for bootstrap compatibility`);
if (!migrationUsesCompatibleCreate) failed++;
const matchingRiderShape = bootstrapRiders !== null && migrationRiders !== null &&
  normalizeDefinition(bootstrapRiders) === normalizeDefinition(migrationRiders);
console.log(`${matchingRiderShape ? 'PASS' : 'FAIL'} — bootstrap riders table shape matches the initial 20260819 definition`);
if (!matchingRiderShape) failed++;
const earlyRiderReferences = [
  '20260815_fix_rls_security.sql',
  '20260818_add_vendor_order_workflow.sql',
];
const earlyRiderDependenciesOk = earlyRiderReferences.every((file) => {
  const index = names.indexOf(file);
  return index >= 0 && index < names.indexOf(ridersMigrationName) &&
    /public\.riders/i.test(fs.readFileSync(path.join(migrationDir, file), 'utf8'));
});
console.log(`${earlyRiderDependenciesOk ? 'PASS' : 'FAIL'} — both pre-creation rider-dependent migrations are covered by bootstrap`);
if (!earlyRiderDependenciesOk) failed++;
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
console.log(`STATIC REPRODUCIBILITY CHECKS PASSED (${names.length} migrations). This is not an actual PostgreSQL clean replay.`);
