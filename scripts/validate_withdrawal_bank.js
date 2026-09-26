// ============================================================
// Withdrawal bank details validator — 20261023 extension.
// Read-only structural checks over the new migration, app.js and admin.js.
// Verify: node scripts/validate_withdrawal_bank.js
// ============================================================
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const mig = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261023_withdrawal_bank_details.sql'),
  'utf8',
);
const app = fs.readFileSync(path.join(root, 'assets/js/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'assets/js/admin.js'), 'utf8');

let fail = 0;
function check(name, cond, extra = '') {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra && !cond ? '  ' + extra : ''));
  if (!cond) fail++;
}

console.log('== FILES ==');
check('20261023 migration exists', fs.existsSync(path.join(root, 'supabase/migrations/20261023_withdrawal_bank_details.sql')));

console.log('\n== MIGRATION: schema ==');
check('adds account_name (IF NOT EXISTS)', /ADD COLUMN IF NOT EXISTS account_name text/.test(mig));
check('adds account_number (IF NOT EXISTS)', /ADD COLUMN IF NOT EXISTS account_number text/.test(mig));
check('adds bank_name (IF NOT EXISTS)', /ADD COLUMN IF NOT EXISTS bank_name text/.test(mig));
check('adds bank_code (IF NOT EXISTS)', /ADD COLUMN IF NOT EXISTS bank_code text/.test(mig));
check('account_number CHECK bound to ^[0-9]{6,20}$', mig.includes("account_number ~ '^[0-9]{6,20}$'"));

console.log('\n== MIGRATION: request_withdrawal RPC (5-arg, bank-capturing) ==');
check('5-arg signature', /CREATE OR REPLACE FUNCTION public\.request_withdrawal\(\s*p_amount numeric,\s*p_account_name text,\s*p_account_number text,\s*p_bank_name text,\s*p_bank_code text/.test(mig));
check('SECURITY DEFINER', /request_withdrawal\([\s\S]*?SECURITY DEFINER/.test(mig));
check('SET search_path = public', /request_withdrawal\([\s\S]*?SET search_path = public/.test(mig));
check('resolves caller rider via auth.uid() + FOR UPDATE', /FROM public\.riders[\s\S]*?WHERE user_id = auth\.uid\(\)[\s\S]*?FOR UPDATE/.test(mig));
check('approved-rider gate preserved', /v_rider\.status <> 'approved'/.test(mig));
check('amount validation preserved', /p_amount > 0 AND p_amount < 1000000/.test(mig));
check('LIFETIME boundary preserved (ds.status <> reversed)', /WHERE ds\.rider_id = v_rider\.id AND ds\.status <> 'reversed'/.test(mig));
check('encumbrance boundary preserved (w.status <> rejected)', /WHERE w\.rider_id = v_rider\.id AND w\.status <> 'rejected'/.test(mig));
check('account_number regex enforced', mig.includes("v_account_number !~ '^[0-9]{6,20}$'"));
check('bank_code regex enforced', mig.includes("v_bank_code !~ '^[A-Za-z0-9]{2,10}$'"));
check('account_name required (1..120)', mig.includes('v_account_name IS NULL OR length(v_account_name) > 120'));
check('bank_name required (1..120)', mig.includes('v_bank_name IS NULL OR length(v_bank_name) > 120'));
check('INSERT populates all bank columns', /INSERT INTO public\.withdrawal_requests\s*\(\s*rider_id, amount, status, account_name, account_number, bank_name, bank_code\s*\)/.test(mig));
check('return json includes bank fields', mig.includes("'account_name', v_account_name") && mig.includes("'bank_code', v_bank_code"));
check('REVOKE on 5-arg signature', /REVOKE ALL ON FUNCTION public\.request_withdrawal\(numeric, text, text, text, text\)/.test(mig));
check('GRANT on 5-arg signature', /GRANT EXECUTE ON FUNCTION public\.request_withdrawal\(numeric, text, text, text, text\) TO authenticated/.test(mig));
check('old 1-arg signature dropped', /DROP FUNCTION IF EXISTS public\.request_withdrawal\(numeric\)/.test(mig));
check('no DROP TABLE / DELETE / DISABLE RLS / service_role', !/DROP TABLE|DELETE FROM|DISABLE ROW LEVEL SECURITY|service_role/.test(mig));

console.log('\n== APP.JS: bank capture ==');
check('RIDER_PAYOUT_BANKS const defined', /const RIDER_PAYOUT_BANKS = \[/.test(app));
check('bank list includes GTBank (058) + Access (044)', /code: '058'/.test(app) && /code: '044'/.test(app));
check('form has account_name input', /name="account_name"/.test(app));
check('form has account_number input', /name="account_number"/.test(app));
check('form has bank select', /<select[^>]*name="bank"/.test(app));
check('withdrawal request amount validated > 0 kept', /Number\.isFinite\(value\) \|\| value <= 0/.test(app));
check('withdrawal availability remains server-authoritative', /request_withdrawal/.test(app) && !/value > available/.test(app));
check('RPC called with bank params', app.includes('p_account_name:') && app.includes('p_bank_name:') && app.includes('p_bank_code:'));
check('recipient registration via paystack-transfer-recipient (rider)', /paystack-transfer-recipient/.test(app) && /payee_type: 'rider'/.test(app));
check('no direct withdrawal_requests INSERT on client', !/from\('withdrawal_requests'\)[\s\S]{0,200}\.insert/.test(app));
check('no rider self-update of withdrawal_requests', !/from\('withdrawal_requests'\)[\s\S]{0,120}\.update/i.test(app));
check('no Paystack secret/publishable key in app.js', !/sk_(live|test)_[A-Za-z0-9]|pk_(live|test)_[A-Za-z0-9]/.test(app));
check('requestWithdrawal accepts bankDetails', /async function requestWithdrawal\(amount, bankDetails\)/.test(app));

console.log('\n== ADMIN.JS: bank surfaced ==');
check('loader maps account_number', /account_number: w\.account_number/.test(admin));
check('loader maps bank_name + bank_code', /bank_name: w\.bank_name/.test(admin) && /bank_code: w\.bank_code/.test(admin));
check('header has Bank account column', /<th>Bank account<\/th>/.test(admin));
check('withdrawal state rows use colspan="7"', /colspan="7" class="muted center">Loading withdrawal requests/.test(admin) && /colspan="7" class="muted center">No withdrawal requests yet/.test(admin) && /colspan="7" class="muted center">Could not load withdrawal requests/.test(admin));
check('no stale colspan="6" in withdrawal rows', !/colspan="6" class="muted center">Loading withdrawal requests/.test(admin) && !/colspan="6" class="muted center">No withdrawal requests yet/.test(admin) && !/colspan="6" class="muted center">Could not load withdrawal requests/.test(admin));
check('row renders bank details', admin.includes('w.bank_name ? escHtml'));
check('reviewWithdrawal still only updates status/note/review', /status: newStatus/.test(admin) && /reviewed_at: new Date\(\)/.test(admin) && /reviewed_by: session\.user\.id/.test(admin));


console.log('\n===============================');
console.log(fail ? 'WITHDRAWAL BANK VALIDATION FAILED' : 'WITHDRAWAL BANK ALL CHECKS PASSED');
console.log('===============================');
process.exit(fail ? 1 : 0);
