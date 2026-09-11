// ============================================================
// ACTION 10 validator — Rider Experience & Earnings Foundation
// ============================================================
// Read-only structural checks over app.js, admin.js and the
// withdrawal_requests migration (20260905). No database access.
//   node scripts/validate_action10.js
// ============================================================
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260905_create_withdrawal_requests.sql'), 'utf8');

let fail = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra && !cond ? '  ' + extra : ''));
  if (!cond) fail++;
}

console.log('== RIDER STATUS UX (existing riders.status + available architecture) ==');
check('rider hub derives isOnline from riders.available', app.includes('const isOnline = !!(state.rider && state.rider.available === true)'));
check('rider hub derives isBusy from active deliveries', /const isBusy = active\.length > 0/.test(app));
check('status badge handles online/offline/busy states', /● On a delivery — busy/.test(app) && /● Online — available/.test(app) && /● Offline — unavailable/.test(app));
check('toggle button reflects current state (Go online/Go offline)', /'Go offline' : 'Go online'/.test(app));
check('available list only shown when approved AND online', /\(isApprovedRider && isOnline\)/.test(app));
check('offline riders see a clear offline empty state', /You're offline/.test(app));

console.log('\n== ELIGIBILITY / ASSIGNED ORDERS ==');
check('available pool excludes already-assigned orders', /!\s*o\.rider_id/.test(app));
check('active pool uses assigned statuses only', /'Rider assigned' \|\| o\.status === 'Picked up' \|\| o\.status === 'On the Way'/.test(app));

console.log('\n== TRANSPARENT ETA (no fake hardcoded ETA) ==');
check('fake "N min away" ETA removed', !/\$\{i\+2\} min away/.test(app));
check('estimate is explicitly derived + labelled (est.)', /pickupEstimate/.test(app) && /\(est\.\)/.test(app));
check('estimate label text explains the estimate', /labelled as an ESTIMATE/.test(app));

console.log('\n== EARNINGS / HISTORY FOUNDATION (derived from delivery fee) ==');
check('earnings never client-supplied — derived from orders.fee', /riderPendingEarnings/.test(app) && /o\.fee \|\| DELIVERY_FEE/.test(app));
check('earnings figures clearly labelled estimated/pending', /Estimated earnings/.test(app) && /pending settlement/.test(app));
check('fake "96% acceptance rate" removed', !/96%/.test(app));
check('delivery history table present', /Delivery history & earnings/.test(app));
check('rider completed deliveries uses Delivered status only', /o\.status === 'Delivered'/.test(app));

console.log('\n== CONTACT INFO DURING ACTIVE DELIVERY ==');
check('fake simulated contact button removed', !/Rider call is simulated/.test(app));
check('real rider phone shown only during an active delivery', /riderIsActive && o\.rider_phone/.test(app));
check('riderIsActive assembled from active delivery stages', /\['Rider assigned', 'Picked up', 'On the Way'\]/.test(app));

console.log('\n== WITHDRAWAL FOUNDATION (rider side) ==');
check('rider withdrawal loader uses withdrawal_requests table', /\.from\('withdrawal_requests'\)/.test(app));
check('rider request submitter exists', /async function requestWithdrawal/.test(app));
check('withdrawal amount validated > 0', /Number\.isFinite\(value\) \|\| value <= 0/.test(app));
check('withdrawal request limited to estimated earnings', /value > available/.test(app));
check('withdrawal form wired to submit handler', /e\.target\.id==='withdrawalForm'/.test(app));
check('withdrawal UI shows loading/empty/error states', /Loading your requests…/.test(app) && /No withdrawal requests yet/.test(app) && /Could not load your requests/.test(app));
check('withdrawals loaded on boot', /loadWithdrawalsFromSupabase\(\)/.test(app));
console.log('\n== WITHDRAWAL FOUNDATION (admin side) ==');
check('admin withdrawal loader exists', /async function loadWithdrawalsFromSupabase/.test(admin));
check('admin review handler exists (approve/reject/paid)', /async function reviewWithdrawal/.test(admin));
check('admin review only updates status/note/review fields', /status: newStatus/.test(admin) && /reviewed_at: new Date\(\)\.toISOString\(\)/.test(admin) && /admin_note:/.test(admin));
check('admin UI lists requests with rows', /renderWithdrawalRows\(\)/.test(admin) && /data-review-withdrawal/.test(admin));
check('admin review wired to click handler', /data-review-withdrawal/.test(admin) && /reviewWithdrawal\(requestId, newStatus/.test(admin));
check('paid requests cannot be re-reviewed (Save disabled)', /w\.status === 'paid' \? 'disabled' : ''/.test(admin));

console.log('\n== SECURITY INVARIANTS ==');
check('no riders self-approve path in app.js (no withdrawal_requests update)', !/from\('withdrawal_requests'\)[\s\S]{0,120}update/i.test(app));
check('no Paystack SDK / secret key in app/admin (gateway runs server-side)', !/new Paystack|js\.paystack|pk_(live|test)_[A-Za-z0-9]|sk_(live|test)_[A-Za-z0-9]/i.test(app) && !/pk_(live|test)_[A-Za-z0-9]|sk_(live|test)_[A-Za-z0-9]/i.test(admin));
check('delivery-fee split uses explicit rider/company constants (rider 1000 / company 500)', /RIDER_DELIVERY_SHARE\s*=\s*1000/.test(app) && /COMPANY_DELIVERY_SHARE\s*=\s*500/.test(app));

console.log('\n== MIGRATION 20260905 (withdrawal_requests) ==');
check('creates withdrawal_requests table', /CREATE TABLE IF NOT EXISTS public\.withdrawal_requests/.test(migration));
check('RLS is enabled on the table', /ALTER TABLE public\.withdrawal_requests ENABLE ROW LEVEL SECURITY/.test(migration));
check('insert policy requires approved rider', /status = 'approved'/.test(migration));
check('insert policy requires status = pending', /AND status = 'pending'/.test(migration));
check('insert policy forbids forged review fields', /reviewed_by IS NULL/.test(migration) && /reviewed_at IS NULL/.test(migration) && /admin_note IS NULL/.test(migration));
check('no rider UPDATE policy exists (admin-only updates)', !/withdrawal_requests_update_own/.test(migration) && /withdrawal_requests_update_admin/.test(migration));
check('admin update policy present', /CREATE POLICY "withdrawal_requests_update_admin"/.test(migration));
check('no DELETE policy (records retained)', !/FOR DELETE/.test(migration));
check('no service_role / DROP TABLE / paystack in migration', !/service_role/.test(migration) && !/DROP TABLE/.test(migration) && !/paystack/i.test(migration));
check('amount guarded by CHECK (amount > 0)', /amount numeric\(12,2\) NOT NULL CHECK \(amount > 0\)/.test(migration));

console.log('\n' + (fail === 0 ? 'ALL ACTION 10 CHECKS PASSED' : fail + ' CHECK(S) FAILED'));
process.exit(fail === 0 ? 0 : 1);