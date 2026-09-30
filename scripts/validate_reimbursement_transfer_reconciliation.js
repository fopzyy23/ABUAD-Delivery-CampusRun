const fs = require('fs');
const { classifyVerifiedTransfer } = require('../supabase/functions/_shared/transfer-reconciliation.mjs');
const { classifyTransferPostResponse } = require('../supabase/functions/_shared/transfer-execution.mjs');

const migration = fs.readFileSync('supabase/migrations/20270102_customer_reimbursement_provider_reconciliation.sql', 'utf8');
const finalHardening = fs.readFileSync('supabase/migrations/20270103_reimbursement_reconciliation_final_hardening.sql', 'utf8');
const conflictMigration = fs.readFileSync('supabase/migrations/20270104_transfer_conflict_observation.sql', 'utf8');
const worker = fs.readFileSync('supabase/functions/paystack-transfer-reconcile/index.ts', 'utf8');
const cutoff = fs.readFileSync('supabase/functions/automatic-cutoff-worker/index.ts', 'utf8');
const execution = fs.readFileSync('supabase/functions/_shared/execute-transfer.ts', 'utf8');
const publicTransfer = fs.readFileSync('supabase/functions/paystack-transfer/index.ts', 'utf8');
const executionValidator = fs.readFileSync('scripts/validate_b7.js', 'utf8');
const retry = finalHardening;
const effectiveEvent = finalHardening;
const exclusivity = fs.readFileSync('supabase/migrations/20261227_financial_resolution_proof_hardening.sql', 'utf8');

const check = (label, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${label}`);
  if (!ok) process.exitCode = 1;
};

check('candidate is customer reimbursement only', /transfer_kind = 'customer_reimbursement'[\s\S]*payee_type = 'customer'[\s\S]*cancellation_id IS NOT NULL/.test(migration));
check('only stale processing rows with an existing reference qualify', /status = 'processing'/.test(migration) && /updated_at < now\(\) - interval '30 minutes'/.test(migration) && /NULLIF\(t\.paystack_reference, ''\) IS NOT NULL/.test(migration) && /LIMIT p_batch_size/.test(migration));
check('bounded locked claim uses SKIP LOCKED and existing reconciliation lease', /p_batch_size > 100[\s\S]*FOR UPDATE OF t SKIP LOCKED[\s\S]*provider_reconciliation_claimed_at = now\(\)/.test(migration));
check('RPC is service-role only', /REVOKE ALL ON FUNCTION public\.claim_stale_customer_reimbursement_transfers\(integer\)[\s\S]*GRANT EXECUTE[\s\S]*TO service_role/.test(migration));
check('reconciler calls both existing settlement and new reimbursement claim RPCs', /claim_stale_settlement_transfers[\s\S]*claim_stale_customer_reimbursement_transfers/.test(worker));
check('provider query uses existing Paystack reference; no create/transfer POST', /transfer\/verify\//.test(worker) && !/api\.paystack\.co\/transfer['"`]/.test(worker));
check('identity is checked before shared authoritative state application', /classifyVerifiedTransfer[\s\S]*validate_transfer_provider_event[\s\S]*apply_transfer_webhook_event/.test(worker));
check('cutoff worker still only executes pending reimbursements', /eq\("transfer_kind", "customer_reimbursement"\)[\s\S]*eq\("status", "pending"\)/.test(cutoff));
check('retry RPC preserves bounded retry count and completion behavior', /next_count>COALESCE\(c\.max_retry_count,5\)/.test(retry) && /t\.status='success'[\s\S]*status='completed'/.test(retry));
check('ambiguous reservation ownership remains retained', /v\.owner = p_owner AND v\.state IN \('reserved','terminal','admin_resolution_required'\)/.test(exclusivity));
check('cutoff worker selects expired claims only when cancellation-linked', /eq\("status", "expired"\)\.not\("cancellation_id", "is", null\)/.test(cutoff));
check('E1 reuses expired no-cancellation claim rows instead of colliding on order uniqueness', /claim_automatic_8pm_cutoff_orders[\s\S]*status='expired' AND cancellation_id IS NULL[\s\S]*status='claimed'[\s\S]*ON CONFLICT DO NOTHING/.test(finalHardening));
check('in-flight pending/processing claims renew the 15-minute lease without retry increment', /t\.status IN \('pending','processing'\)[\s\S]*lease_until=now\(\)\+interval '15 minutes'[\s\S]*retry_count/.test(retry));
check('successful existing transfer completes cutoff claim and clears lease', /t\.status='success'[\s\S]*status='completed'[\s\S]*lease_until=NULL/.test(retry));
check('late success detects old failed/reversed reimbursement before terminal early-return', /t\.status IN \('failed','reversed'\)[\s\S]*p_event_status='success'[\s\S]*IF t\.status='reversed'[\s\S]*RETURN t\.status/.test(effectiveEvent));
check('late success preserves attempt status while retaining contradictory provider evidence', /UPDATE public\.transfers[\s\S]*raw_payload=COALESCE\(raw_payload,'\{\}'::jsonb\)[\s\S]*late_success_anomaly[\s\S]*RETURN t\.status/.test(effectiveEvent));
check('late success escalates cancellation, order, cutoff claim, and reservation conflict', /stage='admin_resolution_required'[\s\S]*UPDATE public\.orders SET cancellation_stage='admin_resolution_required'[\s\S]*UPDATE public\.automatic_cutoff_claims[\s\S]*owner='conflict',state='admin_resolution_required'/.test(effectiveEvent));
check('late-success path does not create or resubmit a transfer', !/create_pending_customer_reimbursement_transfer|INSERT INTO public\.transfers/i.test(effectiveEvent.slice(effectiveEvent.indexOf('late_success_anomaly') - 300, effectiveEvent.indexOf('IF t.status=\'reversed\''))));
check('shared event RPC remains service-role only', /REVOKE ALL ON FUNCTION public\.apply_transfer_webhook_event\(text,text,text,jsonb\)[\s\S]*GRANT EXECUTE[\s\S]*TO service_role/.test(effectiveEvent));
check('provider event RPC sets and clears exact transfer observation marker', /set_config\('app\.transfer_provider_observation_id',t\.id::text,true\)[\s\S]*UPDATE public\.transfers[\s\S]*set_config\('app\.transfer_provider_observation_id','',true\)/.test(conflictMigration));
check('conflict trigger permits only existing processing terminal observations (and success reversal)', /v_reservation_owner='conflict'[\s\S]*TG_OP='UPDATE'[\s\S]*v_observation_id=NEW\.id::text[\s\S]*OLD\.status='processing' AND NEW\.status IN \('success','failed','reversed'\)[\s\S]*OLD\.status='success' AND NEW\.status='reversed'[\s\S]*RAISE EXCEPTION/.test(conflictMigration));
check('conflict terminal observation leaves reservation unchanged', /Existing provider outcome only: retain owner\/state=conflict\.[\s\S]*RETURN NEW/.test(conflictMigration));
check('conflict finalizer and apply RPC preserve admin cancellation/order state', /v_owner='conflict'[\s\S]*RETURN NEW/.test(conflictMigration) && /reservation_owner='conflict' THEN RETURN ns/.test(conflictMigration));
check('new migration keeps provider observation functions server-only', /REVOKE ALL ON FUNCTION public\.guard_financial_resolution_write\(\) FROM PUBLIC,anon,authenticated[\s\S]*GRANT EXECUTE[\s\S]*TO service_role/.test(conflictMigration) && /REVOKE ALL ON FUNCTION public\.apply_transfer_webhook_event\(text,text,text,jsonb\) FROM PUBLIC,anon,authenticated[\s\S]*GRANT EXECUTE[\s\S]*TO service_role/.test(conflictMigration));
check('pending-to-processing remains blocked under conflict; refund reservation still rejects conflict owner', /IF v_reservation_owner='conflict'[\s\S]*RAISE EXCEPTION 'financial resolution conflict blocks reimbursement execution'/.test(conflictMigration) && /RAISE EXCEPTION 'financial resolution is already owned by %', v\.owner/.test(exclusivity));
check('execution helper classifies provider response and does not release after request begins', /classifyTransferPostResponse/.test(execution) && !/release_transfer_for_retry/.test(execution.slice(execution.indexOf('const providerOutcome'))));
check('public paystack-transfer keeps its established 502 JSON error shape', /result\.stage === "paystack"\) return json\(req, 502, \{ error: "Paystack transfer request failed" \}\)/.test(publicTransfer));
check('legacy transfer validators assert ambiguous outcome retention', /ambiguous Paystack response preserves processing/.test(executionValidator) && /ambiguous Paystack response is not released/.test(fs.readFileSync('scripts/validate_hardening.js', 'utf8')));

// Behavioral fixtures (pure in-memory expectations; not PostgreSQL integration tests).
function recoverExpiredClaim(claim, transfer) {
  if (!claim.cancellationId) return claim.orderEligible
    ? { action: 'e1-reclaim-existing-row', claimId: claim.id }
    : { action: 'leave-for-order-re-evaluation' };
  if (transfer?.status === 'success') return { action: 'complete', transferId: transfer.id, lease: null };
  if (['pending', 'processing'].includes(transfer?.status)) return { action: 'keep-processing', transferId: transfer.id, lease: 'renewed', retryCount: claim.retryCount };
  if (transfer && ['failed', 'reversed'].includes(transfer.status)) {
    if (claim.retryCount >= claim.maxRetryCount) return { action: 'admin-resolution-required', transferId: transfer.id };
    return { action: 'retry-existing-rpc', transferId: transfer.id, retryCount: claim.retryCount + 1 };
  }
  return { action: 'retry-existing-rpc' };
}
const expiredFixture = { cancellationId: 'cancel-1', retryCount: 1, maxRetryCount: 5 };
check('behavior fixture: eligible expired/no-cancellation claim is re-evaluated by E1 using the same row', recoverExpiredClaim({ ...expiredFixture, id: 'claim-1', cancellationId: null, orderEligible: true }, null).claimId === 'claim-1');
check('behavior fixture: ineligible expired/no-cancellation claim stays untouched', recoverExpiredClaim({ ...expiredFixture, cancellationId: null, orderEligible: false }, null).action === 'leave-for-order-re-evaluation');
check('behavior fixture: expired/pending transfer stays linked and retry count is unchanged', (() => {
  const out = recoverExpiredClaim(expiredFixture, { id: 'attempt-2', status: 'pending' });
  return out.action === 'keep-processing' && out.transferId === 'attempt-2' && out.retryCount === 1;
})());
check('behavior fixture: expired/processing transfer stays linked and retry count is unchanged', recoverExpiredClaim(expiredFixture, { id: 'attempt-2', status: 'processing' }).retryCount === 1);
check('behavior fixture: expired/success transfer completes without retry', recoverExpiredClaim(expiredFixture, { id: 'attempt-2', status: 'success' }).action === 'complete');
check('behavior fixture: expired/failed at retry cap escalates', recoverExpiredClaim({ ...expiredFixture, retryCount: 5 }, { id: 'attempt-2', status: 'failed' }).action === 'admin-resolution-required');

function lateSuccess(state, attemptId) {
  if (!state.attempts[attemptId]) return state;
  const attempt = state.attempts[attemptId];
  if (!['failed', 'reversed'].includes(attempt.status)) return state;
  return {
    ...state,
    attempts: { ...state.attempts, [attemptId]: { ...attempt, status: attempt.status, lateSuccessEvidence: true } },
    cancellation: 'admin_resolution_required',
    order: 'admin_resolution_required',
    claim: state.claim ? 'admin_resolution_required' : null,
    reservation: { owner: 'conflict', state: 'admin_resolution_required' },
  };
}
const twoAttemptFixture = {
  attempts: { old: { status: 'failed' }, newer: { status: 'processing' } },
  cancellation: 'reimbursement_pending', order: 'reimbursement_pending',
  claim: 'processing', reservation: { owner: 'reimbursement', state: 'reserved' },
};
const lateOutcome = lateSuccess(twoAttemptFixture, 'old');
check('behavior fixture: old-attempt late success preserves both attempt rows and escalates order ownership', lateOutcome.attempts.old.status === 'failed' && lateOutcome.attempts.newer.status === 'processing' && lateOutcome.reservation.owner === 'conflict' && lateOutcome.claim === 'admin_resolution_required');
check('behavior fixture: duplicate late-success event is idempotent', JSON.stringify(lateSuccess(lateOutcome, 'old')) === JSON.stringify(lateOutcome));

// These are pure in-memory behavioral fixtures, not PostgreSQL integration tests.
const expectedPost = { reference: 'dropzyy-reimbursement-1-attempt-2', amountKobo: 250000, currency: 'NGN', recipientCode: 'RCP_test' };
const acceptedBody = { status: true, data: { reference: expectedPost.reference, transfer_code: 'TRF_2', status: 'pending', amount: 250000, currency: 'NGN', recipient: { recipient_code: 'RCP_test' } } };
const postResponse = (status, ok = status >= 200 && status < 300) => ({ status, ok });
const ambiguousPostCases = [
  ...[500, 502, 503, 504, 429, 400, 422].map((status) => [postResponse(status), acceptedBody]),
  [postResponse(200), null],
  [postResponse(200), { status: false, data: acceptedBody.data }],
  [postResponse(200), { status: true }],
  [postResponse(200), { status: true, data: { ...acceptedBody.data, reference: 'wrong-ref' } }],
  [postResponse(200), { status: true, data: { ...acceptedBody.data, transfer_code: '' } }],
  [postResponse(200), { status: true, data: { ...acceptedBody.data, status: undefined } }],
  [postResponse(200), { status: true, data: { ...acceptedBody.data, amount: 1 } }],
  [postResponse(200), { status: true, data: { ...acceptedBody.data, currency: 'USD' } }],
  [postResponse(200), { status: true, data: { ...acceptedBody.data, recipient: { recipient_code: 'wrong' } } }],
];
check('behavior fixture: HTTP 500/502/503/504, 429 and 4xx are ambiguous; no refusal class is guessed', ambiguousPostCases.slice(0, 7).every(([response, body]) => classifyTransferPostResponse(response, body, expectedPost).kind === 'ambiguous'));
check('behavior fixture: malformed/missing/mismatched response identity remains ambiguous', ambiguousPostCases.slice(7).every(([response, body]) => classifyTransferPostResponse(response, body, expectedPost).kind === 'ambiguous'));
check('behavior fixture: correlated accepted response remains non-terminal', classifyTransferPostResponse(postResponse(200), acceptedBody, expectedPost).kind === 'correlated');
check('behavior fixture: correlated response with unknown Paystack status still requires reconciliation', (() => {
  const outcome = classifyTransferPostResponse(postResponse(200), { ...acceptedBody, data: { ...acceptedBody.data, status: 'new-provider-state' } }, expectedPost);
  return outcome.kind === 'correlated' && !['success', 'failed', 'reversed'].includes(outcome.data.status);
})());
function simulatedExecution(response, body, transfer) {
  const outcome = classifyTransferPostResponse(response, body, expectedPost);
  if (outcome.kind === 'ambiguous') return { ...transfer, status: 'processing', reference: transfer.reference, releaseCalls: 0, retryCount: transfer.retryCount };
  return { ...transfer, status: 'processing', reference: transfer.reference, transferCode: outcome.data.transfer_code, releaseCalls: 0, retryCount: transfer.retryCount };
}
const beforeAmbiguousPost = { status: 'processing', reference: expectedPost.reference, attemptNo: 2, retryCount: 1 };
check('behavior fixture: HTTP 500 retains processing, exact reference/attempt, and does not release or consume retry', (() => {
  const after = simulatedExecution(postResponse(500), { status: false }, beforeAmbiguousPost);
  return after.status === 'processing' && after.reference === beforeAmbiguousPost.reference && after.attemptNo === 2 && after.releaseCalls === 0 && after.retryCount === 1;
})());
function simulateProviderApply(current, providerStatus) {
  if (current === 'success' && providerStatus !== 'reversed') return current;
  if (['failed', 'reversed'].includes(current)) return current;
  return ['success', 'failed', 'reversed'].includes(providerStatus) ? providerStatus : current;
}
check('behavior fixture: ambiguous POST followed by webhook success records success', simulateProviderApply('processing', 'success') === 'success');
check('behavior fixture: ambiguous POST followed by webhook failed records failure', simulateProviderApply('processing', 'failed') === 'failed');
check('behavior fixture: ambiguous POST followed by reconciler success/failed records terminal status', ['success', 'failed'].every((s) => simulateProviderApply('processing', s) === s));
check('behavior fixture: ambiguous POST followed by processing/unknown reconciliation remains unresolved', simulateProviderApply('processing', 'processing') === 'processing' && simulateProviderApply('processing', 'unknown') === 'processing');
check('behavior fixture: duplicate normal success remains idempotent', simulateProviderApply(simulateProviderApply('processing', 'success'), 'success') === 'success');
check('source assertion: fetch exception path preserves processing without release', /catch \(networkErr\)[\s\S]*?DO NOT release transfer for retry automatically[\s\S]*?return \{ kind: "error"/.test(execution.slice(execution.indexOf('catch (networkErr)'), execution.indexOf('const providerOutcome'))));

function applyConflictObservation(reservation, transferStatus, providerStatus) {
  const valid = (transferStatus === 'processing' && ['success', 'failed', 'reversed'].includes(providerStatus)) ||
    (transferStatus === 'success' && providerStatus === 'reversed');
  if (reservation.owner !== 'conflict' || !valid) return { applied: false, transferStatus, reservation };
  return { applied: true, transferStatus: providerStatus, reservation: { ...reservation } };
}
const conflict = { owner: 'conflict', state: 'admin_resolution_required' };
for (const status of ['success', 'failed', 'reversed']) {
  const observed = applyConflictObservation(conflict, 'processing', status);
  check('behavior fixture: conflict permits existing processing -> ' + status + ' observation and retains conflict', observed.applied && observed.transferStatus === status && observed.reservation.owner === 'conflict');
}
check('behavior fixture: conflict rejects pending -> processing execution', !applyConflictObservation(conflict, 'pending', 'processing').applied);
check('behavior fixture: conflict permits success -> reversed without clearing ownership', (() => {
  const observed = applyConflictObservation(conflict, 'success', 'reversed');
  return observed.applied && observed.reservation.owner === 'conflict';
})());
check('behavior fixture: conflict observations never grant refund reservation ownership', /RAISE EXCEPTION 'financial resolution is already owned by %', v\.owner/.test(exclusivity) && /owner='conflict'/.test(conflictMigration));
check('source assertion: conflict does not create a reimbursement attempt', !/create_pending_customer_reimbursement_transfer/.test(conflictMigration.slice(conflictMigration.indexOf('CREATE OR REPLACE FUNCTION public.apply_transfer_webhook_event'))));
check('source assertion: provider apply preserves admin cancellation/order state on conflict', /reservation_owner='conflict' THEN RETURN ns/.test(conflictMigration));
check('source assertion: ambiguous HTTP response is kept processing for same-reference reconciliation', /providerOutcome\.kind === "ambiguous"[\s\S]*stage: "paystack"/.test(execution) && /claim_stale_customer_reimbursement_transfers/.test(worker));
check('source assertion: only pre-request local prerequisite failure can call release in shared execution helper', /if \(!prep\.recipient_code[\s\S]*release_transfer_for_retry/.test(execution.slice(0, execution.indexOf('const providerOutcome'))) && !/release_transfer_for_retry/.test(execution.slice(execution.indexOf('const providerOutcome'))));
check('source assertion: all non-OK statuses default to ambiguous; no HTTP status is whitelisted for release', /response\.ok !== true[\s\S]*kind: "ambiguous"/.test(fs.readFileSync('supabase/functions/_shared/transfer-execution.mjs', 'utf8')));

const expected = { reference: 'dropzyy-reimbursement-1-attempt-1', amountKobo: 250000, currency: 'NGN', recipientCode: 'RCP_test', transferCode: 'TRF_test' };
const fixture = (overrides = {}) => ({ reference: expected.reference, amount: 250000, currency: 'NGN', status: 'success', recipient: { recipient_code: 'RCP_test' }, transfer_code: 'TRF_test', ...overrides });
check('confirmed success maps to terminal success', classifyVerifiedTransfer(fixture(), expected).status === 'success');
check('confirmed failed maps to terminal failed', classifyVerifiedTransfer(fixture({ status: 'failed' }), expected).status === 'failed');
check('confirmed reversed maps to terminal reversed', classifyVerifiedTransfer(fixture({ status: 'reversed' }), expected).status === 'reversed');
check('provider processing remains in-flight', classifyVerifiedTransfer(fixture({ status: 'processing' }), expected).kind === 'in_flight');
check('provider pending remains in-flight', classifyVerifiedTransfer(fixture({ status: 'pending' }), expected).kind === 'in_flight');
check('not found/missing status is unknown', classifyVerifiedTransfer(fixture({ status: 'not_found' }), expected).kind === 'unknown');
check('reference, amount, currency, recipient and transfer-code mismatch are unknown', [
  fixture({ reference: 'other' }), fixture({ amount: 1 }), fixture({ currency: 'USD' }),
  fixture({ recipient: { recipient_code: 'other' } }), fixture({ transfer_code: 'other' }),
].every((data) => classifyVerifiedTransfer(data, expected).kind === 'unknown'));
check('reimbursement lookup failure keeps backoff while settlement failure behavior stays unchanged', /claim\.amount_kobo === null[\s\S]*provider_reconciliation_claimed_at: null[\s\S]*Reimbursement lookup failures retain their claim timestamp/.test(worker));
check('reconciliation is independent of cutoff-claim lease', !/lease_until/.test(migration));

if (process.exitCode) process.exit(1);
console.log('CUSTOMER REIMBURSEMENT/EXECUTION CHECKS PASSED (source assertions + in-memory behavioral fixtures; no PostgreSQL integration tests)');
