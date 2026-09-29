const fs = require('fs');
const m = fs.readFileSync('supabase/migrations/20261228_transfer_provider_reconciliation.sql','utf8');
const prep = fs.readFileSync('supabase/migrations/20261215_settlement_transfer_preparation_and_hardening.sql','utf8');
const hook = fs.readFileSync('supabase/functions/paystack-transfer-webhook/index.ts','utf8');
const worker = fs.readFileSync('supabase/functions/paystack-transfer-reconcile/index.ts','utf8');
const entrypoints = fs.readFileSync('supabase/migrations/20261230_finalize_transfer_reconciliation_entrypoints.sql','utf8');
for (const [n,re] of [
 ['active settlement transfer uniqueness',/uq_vendor_settlement_active_transfer|uq_delivery_settlement_active_transfer/],
 ['provider amount validation',/p_amount_kobo/], ['provider currency validation',/p_currency/],
 ['provider recipient validation',/p_recipient_code/], ['claim lock',/FOR UPDATE SKIP LOCKED/],
 ['service-only grants',/TO service_role/]
]) { const ok=re.test(m+prep); console.log(`${ok?'PASS':'FAIL'} — ${n}`); if(!ok) process.exitCode=1; }
for (const [n,re] of [['signed webhook',/x-paystack-signature/],['identity adapter',/validate_transfer_provider_event/],['authoritative apply',/apply_transfer_webhook_event/]]) { const ok=re.test(hook); console.log(`${ok?'PASS':'FAIL'} — ${n}`); if(!ok) process.exitCode=1; }
for (const [n,re] of [['provider secret server-side',/PAYSTACK_SECRET_KEY/],['verify endpoint',/transfer\/verify/],['claim worker',/claim_stale_settlement_transfers/]]) { const ok=re.test(worker); console.log(`${ok?'PASS':'FAIL'} — ${n}`); if(!ok) process.exitCode=1; }
for (const [n,re] of [['reconcile entrypoint is non-provider SQL',/provider_call_required/],['stuck batch reports claims not reconciliation',/claimed_for_provider_verification[\s\S]*'reconciled',0/],['stuck batch uses claim RPC',/claim_stale_settlement_transfers/],['no SQL Paystack call',/PostgreSQL never[\s\S]*contacts Paystack/]]) { const ok=re.test(entrypoints); console.log(`${ok?'PASS':'FAIL'} — ${n}`); if(!ok) process.exitCode=1; }
if (process.exitCode) process.exit(1); console.log('SETTLEMENT TRANSFER SAFETY CHECKS PASSED');
