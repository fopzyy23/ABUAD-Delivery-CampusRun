const fs = require('fs');

const p = 'supabase/migrations/20261223_financial_resolution_exclusivity.sql';
const s = fs.readFileSync(p, 'utf8');
const hardening = fs.readFileSync('supabase/migrations/20261227_financial_resolution_proof_hardening.sql', 'utf8');
const a1 = fs.readFileSync('supabase/migrations/20261226_refund_provider_reconciliation.sql', 'utf8');
const checks = [
  ['reservation table keyed by order', /financial_resolution_reservations\s*\([\s\S]*order_id uuid PRIMARY KEY/],
  ['owners are mutually exclusive', /owner text NOT NULL CHECK \(owner IN \('refund','reimbursement','conflict'\)\)/],
  ['row lock used by reservation helper', /financial_resolution_reservations\s+WHERE order_id=p_order_id FOR UPDATE/],
  ['refund claim reserves before status transition', /reserve_financial_resolution\(r\.order_id,'refund'[\s\S]*UPDATE public\.refunds SET status='processing'/],
  ['reimbursement insert/claim reserves', /NEW\.status IN \('pending','processing','success'\)[\s\S]*reserve_financial_resolution\(v_order_id,'reimbursement'/],
  ['terminal refund completion preserves refund ownership', /NEW\.status='processed'[\s\S]*owner='refund'/],
  ['terminal reimbursement completion preserves reimbursement ownership', /NEW\.status='success'[\s\S]*owner='reimbursement'/],
  ['ambiguous states are retained', /state IN \('reserved','terminal','admin_resolution_required'\)/],
  ['definitive refund failure releases only reserved ownership', /NEW\.status='failed'[\s\S]*DELETE FROM public\.financial_resolution_reservations[\s\S]*owner='refund'[\s\S]*state='reserved'/],
  ['definitive reimbursement failure releases only reserved ownership', /NEW\.status IN \('failed','reversed'\)[\s\S]*DELETE FROM public\.financial_resolution_reservations[\s\S]*owner='reimbursement'[\s\S]*state='reserved'/],
  ['conflicts are not silently resolved', /CASE WHEN x\.has_refund AND x\.has_reimbursement THEN 'conflict'/],
];
let failed = 0;
for (const [name, re] of checks) {
  const ok = re.test(s);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
for (const [name, re] of [
  ['reservation validates order identity', /financial resolution order not found/],
  ['reservation validates refund identity', /refund reservation identity mismatch/],
  ['reservation validates cancellation identity', /reimbursement reservation identity mismatch/],
  ['reservation preserves row lock', /WHERE order_id=p_order_id FOR UPDATE/],
  ['reservation remains service-role only', /GRANT EXECUTE ON FUNCTION public\.reserve_financial_resolution[\s\S]*TO service_role/],
]) {
  const ok = re.test(hardening);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) failed++;
}
for (const [name, re] of [
  ['A1 claim uses SKIP LOCKED', /FOR UPDATE SKIP LOCKED/],
  ['A1 provider adapter calls authoritative finalizer', /apply_refund_result/],
  ['A1 provider adapter validates amount', /p_amount_kobo/],
]) {
  const ok = re.test(a1);
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log('FINANCIAL RESOLUTION EXCLUSIVITY CHECKS PASSED');
