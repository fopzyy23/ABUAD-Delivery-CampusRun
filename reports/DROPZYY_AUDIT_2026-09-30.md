# Dropzyy project audit — 30 September 2026

**Assessment: substantial functionality and thoughtful security controls, but several reproduced financial and workflow defects prevent a production-readiness sign-off.** Passing the current validators does not establish that the financial workflows execute correctly.

Reviewed checkout, authentication/session handling, customer/vendor/rider flows, admin workspaces, database authorization and migration history, Edge Functions, payment/refund/transfer handling, hosting, dependency configuration, and validation coverage. Repository HEAD: `a5bbc7e`; the working tree was clean before the audit. Inventory: 138 SQL migrations, 17 Edge Functions, a 6,409-line customer application and a 4,115-line admin application.

This is a broad repository audit with targeted execution, not a claim that every path or deployed permission has been exhaustively tested. Findings below describe the repository's latest definitions. Migration filenames extending into 2027 do not prove which migrations are deployed.

## Evidence and limits

| Check | Result |
|---|---|
| `npm run validate` | Passed: 66 JavaScript files checked for syntax; all 43 validator scripts passed. Some historical validators still emit warnings. |
| Static publish build | Passed; 15 files, approximately 1,033.5 KB uncompressed. Repository SQL, scripts, reports and documents excluded. |
| Targeted SQL execution | Extracted actual function bodies and the reservation backfill into isolated PGlite PostgreSQL fixtures. Reproduced cancellation, replacement, support, assignment, withdrawal accounting, backfill and direct-write authorization problems. |
| Targeted DOM execution | Executed actual ratings renderer and modal code using LinkeDOM; reproduced filter reset and overlapping-dialog promise errors. |
| Credential pattern scan | No matches for the tested long Paystack secret, Supabase secret-key or private-key patterns. This is not a complete historical secret scan. The browser publishable key is not a secret. |
| Dependency vulnerability scan | Attempted `npm audit --omit=dev --json`; npm's advisory endpoint request failed. No vulnerability clearance is claimed. |
| Full database replay | Not run. No `psql`, Docker or Deno executable was available on PATH. PGlite tests use reduced schemas and mocked identity/role helpers, not a complete Supabase deployment. |
| Live application / money movement | No live account mutations, payment calls, migration deployment or payout execution. No authenticated browser journey, mobile visual inspection or production database introspection. |

Raw validator and SQL-probe output is retained under `reports/audit-2026-09-30/`. Application source and migrations were not changed.

## Findings

P1 means fix before relying on the affected real-money or security workflow. P2 means an important correctness, operational or verification defect. Reproductions used synthetic records only.

### 1. P1 — Rejecting a processing withdrawal releases money already in flight

**Reproduced.** `admin_reject_withdrawal` accepts an `approved` withdrawal and changes it to `rejected` without checking its transfer. `_calculate_rider_balance` reserves withdrawal amounts only for `pending`/`approved` withdrawals. Processing withdrawal transfers are not independently subtracted; the additional transfer reservation calculation covers delivery-settlement transfers.

Local fixture: gross earnings ₦1,000, approved withdrawal ₦1,000, linked transfer `processing`. Available balance was ₦0. Calling the rejection RPC succeeded and increased available balance to ₦1,000 while the transfer remained processing. This exposes a second withdrawal opportunity before the first provider result is known. The existing withdrawal-state trigger did not prevent it.

Evidence: [admin rejection](C:/Users/user/Documents/DROPZYY/supabase/migrations/20270105_admin_mutation_hardening.sql:118), [balance calculation](C:/Users/user/Documents/DROPZYY/supabase/migrations/20261114_financial_transfer_balance_webhook_repair.sql:4), [withdrawal trigger](C:/Users/user/Documents/DROPZYY/supabase/migrations/20261107_delivery_settlement_withdrawal_reconciliation.sql:26).

**Fix:** serialize rejection with transfer preparation/execution and rider-balance changes; reject attempts to release a pending, processing, successful or unresolved provider obligation. Enforce the invariant in the database, including direct updates. Release funds only after authoritative terminal evidence. Test concurrent rejection, withdrawal and webhook delivery.

### 2. P1 — Reservation backfill blocks refunds for orders with no prior resolution

**Reproduced.** The financial-resolution backfill selects every order using left joins. When both `has_refund` and `has_reimbursement` are false, its `CASE` still selects owner `reimbursement`. There is no filter excluding those rows.

A normal order with no refund or cancellation acquired a reservation with owner `reimbursement`, state `reserved` and all evidence IDs null. The latest `reserve_financial_resolution(..., 'refund')` then failed with `financial resolution is already owned by reimbursement`. This affects ordinary orders present when the backfill is applied; it does not automatically affect every newly created order.

Evidence: [backfill](C:/Users/user/Documents/DROPZYY/supabase/migrations/20261223_financial_resolution_exclusivity.sql:22), [latest reservation guard](C:/Users/user/Documents/DROPZYY/supabase/migrations/20261227_financial_resolution_proof_hardening.sql:5).

**Fix:** backfill only orders with actual qualifying financial evidence. Add an append-only repair migration that identifies and removes or corrects unsupported reservations after checking all related ledgers. Do not blanket-delete valid reservations.

### 3. P1 — Customer cancellation fails with an ambiguous-column error

**Reproduced.** `request_customer_cancellation` declares a local variable named `amount`, then uses `SELECT SUM(amount) FROM public.transfers`. PostgreSQL cannot distinguish the variable from the column under the default PL/pgSQL conflict setting.

Executing the actual function produced SQLSTATE `42702`, `column reference "amount" is ambiguous`. The transaction aborts before cancellation is persisted.

Evidence: [cancellation function](C:/Users/user/Documents/DROPZYY/supabase/migrations/20261211_fix_customer_cancellation.sql:61).

**Fix:** qualify the transfer column and use clearly prefixed local variables. Then test paid and unpaid orders, funded purchases, already-cancelled orders and every allowed lifecycle state with the real triggers enabled.

### 4. P1 — Replacement checkout fails with an ambiguous ID

**Reproduced.** `store_replacement_payment_checkout` declares `id uuid` and uses an unqualified `WHERE id = p.id`; its fallback also uses `RETURNING id INTO id`. The normal existing-obligation branch failed with SQLSTATE `42702`, `column reference "id" is ambiguous`.

The initializer calls Paystack before this RPC. Consequently, a provider checkout initialization can succeed while local checkout persistence fails and the customer receives an error. This does not by itself prove a charge occurred.

Evidence: [checkout persistence](C:/Users/user/Documents/DROPZYY/supabase/migrations/20261209_fix_replacement_payment_duplicate.sql:55), [initializer](C:/Users/user/Documents/DROPZYY/supabase/functions/paystack-initialize/index.ts:307).

**Fix:** rename the local variable and qualify all ID references. Test normal/retry/concurrent replacement initialization and keep payment references stable once exposed to the provider.

### 5. P1 — Direct admin table writes bypass new MFA and audit RPCs

**Reproduced for issue reports; additional exposure identified by source tracing.** The new support RPC requires AAL2 and writes an audit record. The earlier `issue_reports_update_admin` policy and authenticated UPDATE grant remain in place and require only `is_admin()`.

With an admin identity and an AAL2 helper deliberately rejecting the session, the RPC failed as expected, but a direct UPDATE succeeded and wrote zero support audit records. This is an admin-session MFA/audit bypass, not evidence that an ordinary customer can become an admin.

The orders table likewise retains a role-only admin UPDATE policy, and its latest lifecycle trigger explicitly allows admins through. Other tables retain direct AAL2-protected admin writes that can bypass RPC-only audit logging even when MFA is satisfied.

Evidence: [support policy and grants](C:/Users/user/Documents/DROPZYY/supabase/migrations/20260926_create_issue_reports.sql:93), [new RPC](C:/Users/user/Documents/DROPZYY/supabase/migrations/20270108_admin_support_workspaces.sql:19), [order admin policy](C:/Users/user/Documents/DROPZYY/supabase/migrations/20260815_fix_rls_security.sql:330), [latest lifecycle trigger](C:/Users/user/Documents/DROPZYY/supabase/migrations/20261207_fix_rider_claim_delivery_payment_gate.sql:45).

**Fix:** make the intended boundary real: restrict direct admin mutation paths or enforce equivalent MFA, field restrictions and audit logging in database policies/triggers. Preserve legitimate customer/vendor/rider update permissions. Test direct REST writes as well as UI/RPC calls.

### 6. P2 — Support review always fails at its audit call

**Reproduced.** `_admin_audit` takes its entity ID as `text`, but `admin_review_issue_report` passes `p_report_id` as UUID without casting. PostgreSQL returned SQLSTATE `42883`: `function public._admin_audit(unknown, unknown, uuid, jsonb, jsonb) does not exist`.

The report UPDATE rolls back with the failed audit call. Other new admin RPCs correctly use `::text` for IDs.

Evidence: [incorrect call](C:/Users/user/Documents/DROPZYY/supabase/migrations/20270108_admin_support_workspaces.sql:46), [audit signature](C:/Users/user/Documents/DROPZYY/supabase/migrations/20270105_admin_mutation_hardening.sql:18).

**Fix:** cast the ID and test both the resulting report state and audit row in the same transaction.

### 7. P2 — Admin rider assignment can strand an order and rejects valid vendor deliveries

**Assignment state reproduced; vendor gate confirmed in source.** Assigning a rider to a `Ready for pickup` order leaves that status unchanged. The function changes status only from `Order confirmed`. The rider progression trigger permits pickup from `Rider assigned`, while its claim branch requires the old rider ID to be null. The newly assigned rider therefore cannot follow the normal next step from this state.

The RPC also requires `payment_status = 'success'` for every request. Vendor delivery requests use a separate `delivery_payment_status` and retain `pending_vendor` for product payment, so a valid paid vendor-delivery request is rejected. The existing rider claim trigger distinguishes these request types correctly.

Evidence: [assignment RPC](C:/Users/user/Documents/DROPZYY/supabase/migrations/20270107_admin_delivery_assignment.sql:11), [rider state rules](C:/Users/user/Documents/DROPZYY/supabase/migrations/20261207_fix_rider_claim_delivery_payment_gate.sql:59).

**Fix:** share one request-type-specific eligibility rule and define explicit assignment/reassignment transitions. Test Ready for pickup, vendor requests, Preparing, in-transit reassignment and the two-delivery cap.

### 8. P2 — Financial recovery controls are unreachable through the current router

**Confirmed by control flow.** The router sends both `financial` and `refunds` to `renderFinanceWorkspace`. Its following branch that would render `renderFinancialSection` can never run. The old section contains cancellation review and cutoff retry buttons. The replacement financial screen is a read-only exception queue, and its refunds destination renders payment/refund/withdrawal controls rather than those cancellation/cutoff controls.

This disconnects existing recovery event handlers from their UI. The new queue also does not enumerate cutoff claims, so it can say no exceptions were detected while a cutoff claim still requires intervention.

Evidence: [routing](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:1386), [replacement queue](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:1319), [unreachable controls](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:2258).

**Fix:** integrate the existing protected recovery actions and cutoff records into the routed workspace. Test navigation from a seeded failed cancellation and cutoff claim through successful recovery.

### 9. P2 — Admin totals and lists silently depend on one API page

**Confirmed implementation; impact depends on data volume and deployed API limits.** Orders, order items, users and several financial ledgers are fetched without server pagination. Admin summaries then use array lengths/reductions as complete totals. Pagination in the finance UI only slices the already-loaded array.

Once a dataset exceeds the configured response cap, old orders and ledger rows disappear from summaries and searches. Order items can hit the cap independently; a large `.in(order_id, ...)` request also grows the request URL substantially.

Evidence: [orders/items loading](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:3802), [payments loading](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:1036), [ledger loading](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:2203), [client pagination](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:1339).

**Fix:** paginate/filter on the server and obtain dashboard counts/sums from scoped database queries. Clearly distinguish loaded-page counts from global totals. Verify with fixtures larger than the configured API cap.

### 10. P2 — Green validation does not verify the critical runtime contracts

**Observed.** All 43 validators passed despite the SQL failures reproduced above. Many validators search historical migration text for strings and expressions. Schema reproducibility checks explicitly do not replay the database. Edge validation strips TypeScript for syntax; it does not type-check or run the Deno functions. Some useful executable auth and reconciliation checks exist, but they do not close these gaps.

Evidence: [runner](C:/Users/user/Documents/DROPZYY/scripts/validate_all.js:57), [schema validator](C:/Users/user/Documents/DROPZYY/scripts/validate_schema_reproducibility.js), [Edge syntax validator](C:/Users/user/Documents/DROPZYY/scripts/validate_edge_function_syntax.js), [CI workflow](C:/Users/user/Documents/DROPZYY/.github/workflows/validate.yml).

**Fix:** require clean Supabase migration replay, actual SQL/RLS tests, Deno checking and a small browser workflow suite. Prioritize cancellation, replacement checkout, withdrawal races, role separation, webhook replay and recovery. Supabase documents [database testing with pgTAP](https://supabase.com/docs/guides/database/testing).

### 11. P2 — Admin support filters erase themselves when used

**Reproduced for ratings; same pattern appears in support, notifications and governance.** Input events rebuild the whole workspace. The renderer reads the old DOM values to filter rows, then replaces the controls with blank/default markup. A ratings search value of `pizza` became an empty string immediately after rendering. Controls are replaced, also disrupting focus and ordinary continuous typing.

Evidence: [ratings renderer](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:2352), [event handlers](C:/Users/user/Documents/DROPZYY/assets/js/admin.js:2487).

**Fix:** retain filter state outside the DOM, render selected values from that state, and update results without replacing the focused input.

### 12. P2 — Overlapping confirmation dialogs settle the wrong promise

**Reproduced.** When another modal is already open, `openDialog` calls the new invocation's `settle(false)` and closes the previous dialog. It never resolves the previous invocation's promise. Two consecutive confirmations produced: first promise still pending, second promise already false, second dialog still visible.

Evidence: [modal overlap handling](C:/Users/user/Documents/DROPZYY/assets/js/modal.js:56).

**Fix:** keep the active dialog's resolver in `current` and cancel that invocation, or queue new dialogs. Test double-clicks and overlapping async flows.

### 13. P2 — Runtime dependencies are not pinned to the reviewed version

**Confirmed configuration risk, not a discovered package vulnerability.** Both HTML shells load Supabase from the floating `@2` CDN URL without integrity metadata. All 17 Edge Functions import the floating `@2` URL from esm.sh. The npm lockfile does not govern those runtime imports, so a source-identical deployment/browser load can use a different dependency version.

Evidence: [customer shell](C:/Users/user/Documents/DROPZYY/assets/html/index.html:99), [admin shell](C:/Users/user/Documents/DROPZYY/assets/html/admin.html:43), [representative Edge import](C:/Users/user/Documents/DROPZYY/supabase/functions/order-admission/index.ts:5).

**Fix:** pin exact versions, use an appropriate Deno dependency lock, and bundle/self-host or integrity-pin the browser library. Re-run the dependency advisory scan when registry access works.

### 14. P2 — README setup instructions are materially obsolete

**Confirmed.** README says there is no `supabase/config.toml`, instructs deploying six functions, describes root-directory publishing and mirrored redirects, and says there is no bootstrap baseline. The repository has the config file, 17 functions, a `dist` allowlist build, comment-only `_redirects`, and a bootstrap SQL file. The localhost instructions also omit the explicit origin/environment configuration required by `config.js`.

Payment/payout and feature descriptions conflict with newer implementations too. This is an operational risk: someone following the primary setup document can deploy an incomplete backend or use the wrong hosting/setup procedure.

Evidence: [README](C:/Users/user/Documents/DROPZYY/README.md), [current hosting](C:/Users/user/Documents/DROPZYY/netlify.toml:40), [origin guard](C:/Users/user/Documents/DROPZYY/assets/js/config.js:28), [baseline instructions](C:/Users/user/Documents/DROPZYY/supabase/BASELINE.md).

**Fix:** make README a concise entry point to one verified deployment runbook and generate function/migration inventories where practical. Test setup from a clean checkout.

## What is working well

- Prices, settlements and key financial mutations are largely server-owned. The browser is not the trusted source of order totals.
- Payment webhooks verify HMAC signatures and check amounts/currency. RPC failures generally return retryable server errors rather than silently claiming success.
- Transfer code distinguishes ambiguous provider responses and includes reconciliation workflows; this is a useful foundation for handling network failures around money movement.
- Row-level security, explicit role checks, fixed function search paths, server-only secrets and MFA requirements are present across important boundaries. The remaining bypasses need closing rather than replacing the architecture wholesale.
- The publish allowlist, CSP header, frame protection and explicit environment/origin checks are good deployment controls.
- Auth lifecycle code explicitly handles asynchronous identity changes and clears private application state. Existing executable auth checks are valuable.
- There is real functional breadth across customers, vendors, riders and administrators, and meaningful documentation of financial intent.

## Maintainability, performance and accessibility

The static frontend plus Supabase architecture is viable for this product; a framework rewrite is not required to fix these findings. The larger problem is concentration and duplication: more than 10,500 lines in two main JavaScript files, historical and replacement admin renderers coexisting, financial state spread over many overriding migrations, and checks often tied to old definitions.

After correctness is restored, split code by workflow and centralize eligibility/state-transition rules. Prefer one authoritative financial state model over duplicated UI assumptions. Load admin datasets on demand; initialization currently awaits many datasets sequentially and requests rider metrics per rider. Measure actual latency before claiming a performance target.

The shared modal has useful focus-trap, Escape and focus-restoration behavior. Several newer admin detail drawers bypass it and build their own dialog markup without the equivalent keyboard handling. Reuse the shared component after fixing its promise bug, then run keyboard and screen-reader checks. Contrast, mobile layout and real-browser performance remain unverified.

## Recommended order of work

1. Fix withdrawal reservation release and the direct-write MFA/audit bypass. Check whether affected financial states already exist in a staging copy or read-only production review.
2. Repair the reservation backfill safely, and fix cancellation/replacement SQL errors with executable regression tests.
3. Restore support review, valid rider assignment and reachable financial-recovery controls.
4. Add a reproducible database replay and role/workflow test gate before treating validator success as release evidence.
5. Repair pagination/filter/dialog behavior, pin runtime dependencies, and reconcile setup documentation.

Before production sign-off, verify the actually applied migrations, policies/grants, deployed function versions, JWT configuration, worker secrets/jobs and Paystack TEST-mode journeys in an explicitly configured staging environment. The local findings are strong evidence of defects; they do not establish the current live incident rate, existing financial loss or deployed exploitability.
