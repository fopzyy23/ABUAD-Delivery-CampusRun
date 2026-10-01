# Dropzyy audit remediation — 1 October 2026

## Outcome

The five P0 defects and the requested P1/P2 findings have repository fixes and executable regression coverage. No migration was deployed remotely, no live browser environment was exercised, and no Paystack request was sent. Real-money production sign-off therefore remains pending deployment and staging verification.

## Root causes and fixes

| Finding | Root cause | Correction |
|---|---|---|
| Withdrawal rejection released in-flight funds | Balance reserved only `pending`/`approved` withdrawals; rejection allowed an `approved` request with a `processing` transfer to become `rejected`. | Rider → withdrawal → transfer lock order; active-transfer uniqueness; rejection guard; provider-result state transitions; unresolved late-success hold; balance derives reservations from withdrawal and transfer evidence. |
| False reimbursement reservations | Historical backfill selected every order and defaulted the no-evidence branch to reimbursement. | Evidence-only reconstruction; narrowly remove only evidence-free false rows; preserve conflict/terminal states; audit every derived-row repair. |
| Cancellation ambiguity | Local `amount` variable collided with unqualified `transfers.amount`. | Qualify transfer/cancellation columns without changing eligibility or amount semantics. |
| Replacement checkout ambiguity | Local `id` variable collided with unqualified payment `id`. | Rename local ID and qualify the update/returning targets; preserve server price comparison. |
| Direct admin UPDATE bypass | Older grants/RLS allowed table writes around AAL2/audit RPCs. | Revoke direct writes on RPC-only tables; reject direct admin writes on shared-role tables; keep SECURITY DEFINER RPCs AAL2-gated and audited. |
| Support review failed | UUID report ID passed to `_admin_audit(text,...)` without a cast. | Corrected RPC casts the ID, validates transitions, updates and audits atomically. |
| Rider assignment stranded orders | Ready-for-pickup assignment left status unchanged; one payment gate was applied to both request types. | Ready orders enter `Rider assigned`; restaurant and vendor-request payment gates are explicit; reassignment preserves in-progress status. |
| Recovery controls unreachable | Router returned the newer read-only financial screen before the older actionable recovery workspace. | The routed financial workspace now includes exception detection and the existing protected recovery controls. |
| Admin totals truncated at scale | Dashboard totals were reductions over one REST response page. | Authoritative database aggregate RPC supplies global order counts/value; executable test uses more than 1,000 rows. |
| Search filters reset | Inputs were treated as filter state, then destroyed on each render. | Persistent support-filter state is captured/restored across render and focus is returned to the active control. |
| Modal promises unresolved | Opening a second dialog settled the new resolver and abandoned the old one. | Active dialog stores its own resolver/cancel value and settles once before replacement. |

An additional replayed-schema defect was found: the obsolete `transfers_one_payout_source_check` from 20261024 blocked later purchase-funding/customer-reimbursement transfer shapes. The forward repair removes that obsolete constraint; newer source-shape constraints remain authoritative.

## Corrective migrations

1. `20270110_financial_rpc_runtime_fixes.sql` — cancellation and replacement checkout ambiguity fixes.
2. `20270111_withdrawal_reservation_safety.sql` — withdrawal state machine, locks, balance semantics, provider reconciliation and active-transfer uniqueness.
3. `20270112_resolution_reservation_repair.sql` — evidence-only reservation repair, repair audit and obsolete transfer constraint removal.
4. `20270113_admin_mutation_boundaries.sql` — grants/RLS boundary, direct-admin mutation guard, support review and audited vendor assignment.
5. `20270114_admin_delivery_assignment_lifecycle.sql` — request-specific eligibility and progressable assignment/reassignment.
6. `20270115_admin_authoritative_metrics.sql` — database-authoritative dashboard totals.

All are forward migrations after the stated production position `20270109`. Historical financial ledger rows are retained.

## Financial state machines

### Withdrawals

| Current evidence | Allowed result | Balance treatment |
|---|---|---|
| Pending withdrawal, no transfer | Admin may reject, or trusted approval creates one pending transfer. | Reserved until rejection. |
| Approved + pending transfer | Can be claimed once for processing; duplicate approval reuses it. | Reserved. |
| Processing transfer | Admin rejection is blocked. Provider success/failure/reversal is authoritative. | Reserved. |
| Success | Withdrawal becomes paid, idempotently. | Counted withdrawn once. |
| Failed or reversed | Withdrawal becomes rejected through trusted reconciliation. | Released; transfer attempt remains history. |
| Late success after failed/reversed | Contradiction is recorded; `payout_resolution_required` is set; no new payout may be approved. | Reserved pending admin/provider reconciliation. |

The partial unique index permits at most one pending/processing/success transfer for a withdrawal. Lock order is rider, withdrawal, transfer wherever new payout execution/reservation can race.

### Refund/reimbursement ownership

- No qualifying refund or reimbursement evidence: no reservation.
- Refund only: owner `refund`.
- Customer reimbursement transfer only: owner `reimbursement`.
- Both forms of active evidence: owner `conflict`, state `admin_resolution_required`.
- Processed refund or successful reimbursement: state `terminal`.
- Existing conflict and terminal state cannot be silently downgraded by repair.

## Executable regression tests

`tests/db/database.cjs` replays the bootstrap and migration history in isolated PostgreSQL (PGlite), with fixtures only for Supabase platform schemas/roles. `tests/db/regression.cjs` first proves the five original failures against the `20270109` schema, applies the corrective migrations, then verifies corrected behavior with real PL/pgSQL functions, RLS, grants and triggers.

Twenty-one database scenarios pass, covering:

- processing reservation, rejection blocking, success once, reversal, contradictory late success and duplicate payout prevention;
- normal/refund-only/reimbursement-only/conflict/terminal reservation fixtures;
- paid and unpaid customer cancellation;
- replacement checkout metadata and server amount enforcement;
- direct AAL1/AAL2 table-write denial, AAL1 RPC denial, AAL2 audited RPC success;
- support transitions and audit events;
- assignment progression, vendor-request eligibility and reassignment;
- authoritative metrics beyond 1,000 orders.

`tests/ui/regression.cjs` executes the real modal implementation and verifies overlapping calls settle correctly. It also checks that admin support renderers/events use persistent filter state.

CI now runs `npm test` after the existing static validators.

## Validation results and boundaries

| Layer | Result |
|---|---|
| Static validation | `npm run validate` passes all existing repository validators. |
| Executable DB/workflow tests | `npm test` passes 21 database scenarios and 2 UI workflow checks. |
| Production-baseline migration replay | Starting at repository state through `20270109`, all six forward migrations apply in order and tests pass. |
| From-zero strict migration replay | **Blocked before the corrective migrations** by historical `20260919_create_refund_infrastructure.sql`: duplicate `orders_payment_status_check`. Tests use a documented one-line compatibility drop to exercise the full historical schema without editing an applied migration. |
| Publish build | `node scripts/build_publish.js` passes; repository internals remain excluded. |
| Dependency advisory scan | `npm audit --omit=dev` reports 0 vulnerabilities. |
| Remote migration deployment | Not performed. |
| Live browser testing | Not performed. |
| Paystack sandbox/real testing | Not performed. |

## Files changed

- Six forward SQL migrations under `supabase/migrations/`.
- `assets/js/admin.js` for recovery routing, authoritative totals and persistent filters.
- `assets/js/modal.js` for resolver ownership/one-time settlement.
- `tests/db/database.cjs`, `tests/db/regression.cjs`, `tests/ui/regression.cjs`.
- `package.json`, `package-lock.json` for pinned test-only PGlite/LinkeDOM dependencies and test scripts.
- `.github/workflows/validate.yml` to run executable tests.

## Remaining blockers to real-money sign-off

1. Review and deploy migrations `20270110`–`20270115` to a staging Supabase project, then confirm the remote migration ledger and actual grants/policies/functions.
2. Run authenticated browser journeys for customer cancellation, replacement checkout, AAL1/AAL2 admin behavior, withdrawal approval/rejection, rider assignment/progression and recovery controls.
3. Run Paystack TEST-mode initialization, webhook retry/duplicate/out-of-order delivery, transfer success/failure/reversal and provider reconciliation.
4. Inspect production data read-only for false reservation rows, unresolved/contradictory payout evidence and transfers blocked by the obsolete constraint before applying the repair.
5. Resolve the historical from-zero replay defect through the repository's chosen migration-history policy. It was intentionally not edited because production is already through that migration.

No deployment or external financial action was authorized or performed in this remediation.
