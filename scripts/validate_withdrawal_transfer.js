const fs = require('fs');
const migration = fs.readFileSync('supabase/migrations/20261024_rider_withdrawal_transfer_flow.sql', 'utf8');
const edge = fs.readFileSync('supabase/functions/paystack-transfer/index.ts', 'utf8');
const admin = fs.readFileSync('assets/js/admin.js', 'utf8');
let failed = 0;
function check(name, ok) { console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`); if (!ok) failed++; }
check('withdrawal transfer linkage', /withdrawal_request_id bigint REFERENCES public\.withdrawal_requests/.test(migration));
check('one payout source constraint', /transfers_one_payout_source_check/.test(migration));
check('authoritative withdrawal amount', /amt:=w\.amount/.test(migration));
check('verified rider recipient lookup', /profile_id=\(SELECT user_id FROM public\.riders WHERE id=w\.rider_id\)/.test(migration));
check('admin-only approval RPC', /REVOKE ALL ON FUNCTION public\.approve_withdrawal_for_payout/.test(migration));
check('failed transfer retry creates a new attempt', /status <> 'failed'/.test(migration));
check('webhook success marks linked withdrawal paid', /status='paid'.*withdrawal_request_id/s.test(migration));
check('edge accepts withdrawal id only', /approve_withdrawal_for_payout/.test(edge) && /transferId = approved\.transfer_id/.test(edge));
check('admin UI says approve and pay', /Approve &amp; pay/.test(admin));
if (failed) process.exitCode = 1;
