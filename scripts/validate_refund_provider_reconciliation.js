const fs = require('fs');
const migration = fs.readFileSync('supabase/migrations/20261226_refund_provider_reconciliation.sql', 'utf8');
const webhook = fs.readFileSync('supabase/functions/paystack-webhook/index.ts', 'utf8');
const worker = fs.readFileSync('supabase/functions/paystack-refund-reconcile/index.ts', 'utf8');
for (const x of ['claim_stale_refunds_for_reconciliation','apply_provider_refund_event','FOR UPDATE SKIP LOCKED','apply_refund_result','p_amount_kobo','p_currency']) if (!migration.includes(x)) throw new Error(`migration missing ${x}`);
for (const x of ['refund.pending','refund.processing','refund.processed','refund.failed','x-paystack-signature','apply_provider_refund_event']) if (!webhook.includes(x)) throw new Error(`webhook missing ${x}`);
for (const x of ['PAYSTACK_SECRET_KEY','/refund/','claim_stale_refunds_for_reconciliation','apply_provider_refund_event','REFUND_RECONCILIATION_WORKER_SECRET']) if (!worker.includes(x)) throw new Error(`worker missing ${x}`);
console.log('refund provider reconciliation validator: PASS');
