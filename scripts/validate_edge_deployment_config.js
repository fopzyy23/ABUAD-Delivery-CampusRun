const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const functionsDir = path.join(root, 'supabase', 'functions');
const config = fs.readFileSync(path.join(root, 'supabase', 'config.toml'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'DEPLOYMENT.md'), 'utf8');
const expected = {
  'admin-financial-recovery': true,
  'automatic-cutoff-transfer': false,
  'automatic-cutoff-worker': false,
  'cleanup-admissions': false,
  'cleanup-rate-limits': false,
  'order-admission': true,
  'paystack-initialize': true,
  'paystack-initialize-delivery': true,
  'paystack-payout-cost-reconcile': false,
  'paystack-refund': true,
  'paystack-refund-reconcile': false,
  'paystack-transfer': true,
  'paystack-transfer-recipient': true,
  'paystack-transfer-reconcile': false,
  'paystack-transfer-webhook': false,
  'paystack-verify': true,
  'paystack-webhook': false,
  'push-dispatcher': false,
};
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`); if (!ok) failed++; };
const deployable = fs.readdirSync(functionsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_') && fs.existsSync(path.join(functionsDir, entry.name, 'index.ts')))
  .map((entry) => entry.name).sort();

check('exactly 18 deployable Edge Functions are present', deployable.length === 18);
check('deployable directories match the deployment manifest', deployable.join('|') === Object.keys(expected).sort().join('|'));
for (const [name, verifyJwt] of Object.entries(expected)) {
  const section = new RegExp(`\\[functions\\.${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\]\\s*\\r?\\nverify_jwt\\s*=\\s*${verifyJwt}`);
  check(`${name} has explicit verify_jwt = ${verifyJwt}`, section.test(config));
  check(`${name} is documented in the deployment manifest`, docs.includes(`\`${name}\``));
}
for (const name of ['paystack-webhook', 'paystack-transfer-webhook']) {
  const source = fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8');
  check(`${name} verifies the Paystack signature before service-role use`, source.includes('isValidSignature') && source.indexOf('isValidSignature') < source.indexOf('createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)'));
  check(`${name} does not expose wildcard browser CORS`, !source.includes('Access-Control-Allow-Origin": "*"'));
}
for (const name of ['automatic-cutoff-transfer', 'automatic-cutoff-worker', 'cleanup-admissions', 'cleanup-rate-limits', 'paystack-payout-cost-reconcile', 'paystack-refund-reconcile', 'paystack-transfer-reconcile']) {
  const source = fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8');
  check(`${name} checks a dedicated worker secret`, /WORKER_SECRET|JOB_SECRET|RECONCILER_SECRET/.test(source) && /Unauthorized|authorized\(req\)/.test(source));
}
for (const secret of ['PAYSTACK_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'ALLOWED_ORIGIN', 'PAYSTACK_CALLBACK_URL', 'DROPZYY_ENVIRONMENT', 'AUTOMATIC_CUTOFF_WORKER_SECRET', 'CLEANUP_JOB_SECRET', 'REFUND_RECONCILIATION_WORKER_SECRET', 'TRANSFER_RECONCILIATION_WORKER_SECRET', 'PAYSTACK_RECONCILER_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_DISPATCHER_SECRET']) {
  check(`deployment documentation names ${secret}`, docs.includes(secret));
}
for (const [name, route] of [['paystack-initialize', '/orders'], ['paystack-initialize-delivery', '/vendor']]) {
  const source = fs.readFileSync(path.join(functionsDir, name, 'index.ts'), 'utf8');
  check(`${name} requires explicit environment/callback config and uses the shared resolver`, source.includes('Deno.env.get("PAYSTACK_CALLBACK_URL") ?? ""') && source.includes('Deno.env.get("DROPZYY_ENVIRONMENT") ?? ""') && source.includes('resolveTrustedCallbackUrl'));
  check(`${name} fixes its callback route to ${route}`, source.includes(`requiredPath: "${route}"`));
  check(`${name} has no production callback fallback`, !/https:\/\/(?:www\.)?dropzyy\.com\//.test(source));
}
check('shared CORS does not default to production origins', /Deno\.env\.get\("ALLOWED_ORIGIN"\)\s*\?\?\s*""/.test(fs.readFileSync(path.join(functionsDir, '_shared', 'http.ts'), 'utf8')));
if (failed) process.exit(1);
console.log('EDGE DEPLOYMENT CONFIGURATION STATIC CHECKS PASSED.');
