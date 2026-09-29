const fs = require('fs');
const balance = fs.readFileSync('supabase/migrations/20261114_financial_transfer_balance_webhook_repair.sql','utf8');
const withdrawal = fs.readFileSync('supabase/migrations/20261128_rider_payout_reconciliation.sql','utf8');
const bonus = fs.readFileSync('supabase/migrations/20261109_rider_daily_bonus.sql','utf8') + fs.readFileSync('supabase/migrations/20261110_bonus_completion_and_settlement_payout_status.sql','utf8');
const guard = fs.readFileSync('supabase/migrations/20261229_rider_settlement_withdrawal_exclusivity.sql','utf8');
const checks = [
  ['settlement paid is subtracted', /settlement_paid[\s\S]*t\.status='success'/],
  ['settlement pending/processing is reserved', /settlement_reserved[\s\S]*t\.status IN \('pending','processing'\)/],
  ['successful withdrawals are paid once', /wr\.status='paid'[\s\S]*t\.status='success'/],
  ['pending/approved withdrawals are reserved', /status IN \('pending','approved'\)/],
  ['available balance is clamped after ledger math', /GREATEST\(g-w-settlement_paid-r-settlement_reserved,0\)/],
  ['withdrawal locks rider row', /FROM public\.riders WHERE user_id = auth\.uid\(\) FOR UPDATE/],
  ['withdrawal uses authoritative balance', /_calculate_rider_balance\(v_rider\.id\)/],
  ['bonus is unique per rider/date', /UNIQUE \(rider_id, qualifying_date\)/],
  ['bonus award is idempotent', /ON CONFLICT \(rider_id,qualifying_date\) DO NOTHING/],
  ['settlement/withdrawal race locks rider', /FROM public\.riders WHERE id=v_rider_id FOR UPDATE/],
  ['settlement insert checks available balance', /_calculate_rider_balance\(v_rider_id\)[\s\S]*NEW\.amount > v_available/],
  ['guard is service-role only', /GRANT EXECUTE ON FUNCTION public\.guard_rider_settlement_balance\(\)[\s\S]*TO service_role/],
];
let failed=0;
for (const [name,re] of checks) { const ok=re.test(balance+withdrawal+bonus+guard); console.log(`${ok?'PASS':'FAIL'} — ${name}`); if(!ok) failed++; }
if(failed) process.exit(1);
console.log('RIDER LEDGER CHECKS PASSED');
