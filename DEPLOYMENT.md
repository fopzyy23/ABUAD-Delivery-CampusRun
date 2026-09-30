# Dropzyy fresh Supabase deployment

## B4 browser verification

Source configuration identifies `https://dropzyy.com` as the production
frontend, with `https://www.dropzyy.com` also allowed for browser API calls.
Neither DNS nor a canonical-domain redirect was verified. No concrete staging
hostname/project is defined. The browser config and Netlify CSP currently bind
to the same production Supabase project. Staging must use its own publishable
key/project URL AND matching CSP connect/img/WebSocket origins before release.
The public publishable key is not a service-role credential.

### B4 closure source model

Before closure, `initialAuthReady` distinguished bootstrap from rendered UI;
`state.user`/`state.user.role` represented anonymous/customer/vendor/rider/admin,
while rider approval and vendor assignment added capability checks. Profile
loading was implicit in three separate startup/login/signup promise chains.
`passwordRecoverySession` was memory-only; profile errors could fall back to a
customer identity. `signInInProgress` and `explicitLoginUserId` attempted to
arbitrate the competing bootstrap paths. These paths are now centralized.

`auth-lifecycle.js` owns readiness and the session/profile generation. The
`initialAuthReady` value in app.js is only its rendering projection. States are
bootstrap/profile-loading, anonymous, authenticated profile/role, recovery and
profile-error. Profile-error fails closed with retry-by-reload/sign-out UI; it
never invents a role. `INITIAL_SESSION` is the customer bootstrap source, not
a competing startup getSession promise. Explicit login/signup rely on SDK events.
Private async loaders capture a per-transition state object; sign-out/account
changes detach it, cancel subscriptions and invalidate in-flight profile/render
work. Server RLS/RPC checks, not frontend roles, authorize operations.

| Event | Profile/session action | UI action |
| --- | --- | --- |
| INITIAL_SESSION | Restore session and fetch database profile once | Release readiness; preserve route; restore valid recovery intent |
| SIGNED_IN | Fresh database profile; invalidate older generation | Resolve role and pending login destination; resume payment callback |
| SIGNED_OUT | Clear session/profile, private state, subscriptions and recovery | Anonymous render; Back cannot restore authoritative private state |
| TOKEN_REFRESHED | Replace current same-user session; no profile/data reload | Preserve route and UI |
| USER_UPDATED | Refresh database profile | Render current role; never establish recovery intent |
| PASSWORD_RECOVERY | Establish bounded intent, synchronize profile/session | Show reset form after server validation |
| MFA_CHALLENGE_VERIFIED | Replace same-user session; admin refreshes AAL metadata | Existing challenge/enrollment completion owns admin initialization |

The SDK callback invalidates old work synchronously, but database/auth requests
are deferred via setTimeout outside the SDK lock. Visible-tab re-entry reloads
the profile; token refresh alone is not a role-change notification.

Recovery intent is stored only in sessionStorage, for at most 15 minutes from
the PASSWORD_RECOVERY event, bound to user ID plus JWT session_id. JWT decoding
is identification, NOT signature verification or authorization. Both restore
and final submission require the current SDK session, matching identity,
unexpired intent/token and a successful Auth-server getUser call. The common
canAccessPasswordRecovery helper controls the UI. A route/query/marker alone
is insufficient; another user or another session cannot inherit intent.
This marker is UX continuity, not tamper-proof proof of how an already signed-in
user authenticated: Supabase remains the authority for self password updates.
SessionStorage failures degrade to same-page recovery, never a permissive bypass.
Success clears intent and URL material, keeps the normal authenticated session
and opens the profile; duplicate submissions are rejected. Passwords are never
persisted. Logout, session mismatch, server rejection or expiry invalidates intent.

The browser loads Supabase JS v2 from the existing CDN major-version URL (not
an immutable SDK build). API assumptions are documented by Supabase:
[auth events](https://supabase.com/docs/reference/javascript/auth-onauthstatechange),
[session IDs](https://supabase.com/docs/guides/auth/sessions), and
[server user validation](https://supabase.com/docs/reference/javascript/auth-getuser).
Hosted SDK/email exchange behavior still needs browser execution.
The additional MFA event is defined in the SDK's
[auth event types](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/lib/types.ts).
The standalone admin shell retains its own checkAuth/getSession bootstrap;
its listener does not run a second INITIAL_SESSION bootstrap.

### Explicit environment prerequisite

No staging deployment is created by this change. `assets/js/config.js` now
rejects origins absent from frontendOrigins BEFORE creating a Supabase client.
Deploy previews and localhost therefore cannot silently use production.
For each staging/development artifact explicitly set browserEnvironment,
frontendOrigins, supabaseUrl and supabaseKey; non-production labels reject the
known production project URL. Values are public, never service-role secrets.
Do not add a staging origin to the production configuration as a workaround.

| Environment | Browser/project selection | CSP and server configuration |
| --- | --- | --- |
| Production | Checked-in production frontend label, `DROPZYY_ENVIRONMENT=production`, dropzyy.com/www origins and production public project/key | Explicit production `ALLOWED_ORIGIN` + `PAYSTACK_CALLBACK_URL`; production HTTPS/WSS/img CSP; verify deployed settings |
| Staging | REQUIRED: chosen isolated origin, browser staging label, `DROPZYY_ENVIRONMENT=staging`, separate Supabase URL/public key | REQUIRED: matching netlify.toml connect-src/img-src HTTPS/WSS, staging-only `ALLOWED_ORIGIN`, staging `PAYSTACK_CALLBACK_URL`, Auth Site URL/exact Redirect URLs |
| Development | REQUIRED: explicit local origin/port, browser development label, `DROPZYY_ENVIRONMENT=development`, non-production Supabase URL/public key | Match local host CSP where served; explicit localhost-only `ALLOWED_ORIGIN`/callback and Auth redirects |

Never use connect-src *. All six environment-specific settings (origin,
browser project/key, CSP, ALLOWED_ORIGIN, callback and Auth URLs) are release
prerequisites; frontend configuration alone does not configure the server.

### Lifecycle traces

- Signup: signUp metadata -> confirmation-required neutral message -> email
  exchange -> SDK session event -> single database profile synchronization.
- Login: credentials -> SIGNED_IN -> fresh profile/role -> intended route.
- Refresh: retain path/query/hash -> INITIAL_SESSION/readiness -> profile -> UI.
- Recovery: email request -> SDK recovery event -> validated reset UI -> refresh
  with matching session/intent -> server revalidation -> updateUser -> clear
  intent and return to normal authenticated profile.
- Logout: invalidate private UI -> SDK signOut -> SIGNED_OUT -> anonymous UI;
  server sign-out errors are reported, not claimed as success.
- Payment return: retain callback while signed out -> login/bootstrap -> consume
  callback once -> paystack-verify ownership/provider checks -> database result.
  Auth-event repetitions cannot replay a consumed callback; stale polls stop.
- Admin: SDK session -> database admin profile -> MFA challenge/AAL2 -> privileged
  RPC, with server authorization final. Cross-tab sign-out clears private state.

### B4 closure validation record

Classification: **B4 STATICALLY COMPLETE / BROWSER VERIFICATION PENDING**.
Validation ran with **Node v22.23.3**, using an isolated npm-cached runtime,
not the default Node 24 installation. B4 lifecycle/mocked callback tests,
B3, Edge deployment, deployment prerequisites, migration reproducibility,
A1-A4 financial validators, all JavaScript syntax checks, 19 Edge TypeScript
syntax checks and `npm run validate` passed. `git diff --check` passed.
TypeScript stripping emits its expected experimental-feature warning; this
check is not Deno type checking or deployed Edge execution.
All 23 browser cases below, Auth Dashboard settings and actual hosting behavior
remain NOT RUN/UNVERIFIED. Staging configuration remains a release prerequisite.
No migration, production, Paystack, deployment, staging or commit operation
was performed for this closure. Do not promote this to B4 VERIFIED or Phase B
closure without the recorded runtime checks.

| Environment | Auth Site URL | Confirmation redirect | Recovery redirect | Payment return |
| --- | --- | --- | --- | --- |
| Production | `https://dropzyy.com` | `/login?auth_return=signup` | `/login` | `/orders` or `/vendor` |
| Staging | `https://<staging-host>` | `/login?auth_return=signup` | `/login` | `/orders` or `/vendor` |
| Development | `http://127.0.0.1:5500` | `/login?auth_return=signup` | `/login` | `/orders` or `/vendor` |

In each Supabase Auth Dashboard, allow the exact absolute confirmation and
recovery URLs for that environment. Add www equivalents only if actively
served. No arbitrary wildcard domain is required. OAuth is not represented in
the inspected login flow. Dashboard settings, confirmation policy and password
policy are UNVERIFIED. Source currently enforces a six-character password
minimum; the configured Supabase policy remains authoritative.

Netlify builds `dist` with `scripts/build_publish.js`. It rewrites `/admin` to
the admin shell and other application paths to the customer shell; that shell
maps recognized paths to hash routes while preserving query parameters.
`_redirects` is comment-only. Root-absolute assets avoid deep-link asset 404s.
Source CSP permits the explicit Supabase project, jsDelivr and Google font
hosts; it permits inline styles, but not wildcard scripts or connections.
Actual TLS, rewrites, headers and cache behavior require hosted tests.

Customer orders/profile/checkout need a session. Vendor access also requires
the profile vendor assignment; rider actions require an approved rider record.
Admin access needs the server profile admin role, with AAL2 required for
privileged financial RPCs. RLS/RPC checks remain authoritative. Reset form
authorization uses the bounded, server-validated recovery model above, not
the reset route. Recovery refresh is covered by mocked lifecycle tests; actual
email/SDK/hosting behavior must still be exercised before B4 VERIFIED.

Use an isolated staging environment and a fresh/incognito browser. For each
scenario record sanitized route, visible result, console error, HTTP status
and Supabase error code; never capture passwords, URL tokens or authorization
headers. All rows below are NOT RUN:

| Scenarios | Status |
| --- | --- |
| Signup with confirmation required; duplicate/invalid email; provider failure | NOT RUN |
| Confirmation in original and fresh browser; expired/reused link; manual destination | NOT RUN |
| Login; authenticated refresh; protected deep link with/without session | NOT RUN |
| Forgot password; valid recovery; manual reset route; reset refresh | NOT RUN |
| Password update; login with new password; logout; Back after logout; second tab | NOT RUN |
| Payment callback; duplicate callback; delayed callback after login | NOT RUN |
| Vendor and approved/unapproved rider routes | NOT RUN |
| Admin login at AAL1; enrollment/challenge; AAL2 write; AAL1 write rejection | NOT RUN |
| Admin refresh; logout; expired session/MFA; revoked role | NOT RUN |

Execute and record each required case separately (all currently NOT RUN):
1. Signup; 2. confirmation same browser; 3. confirmation incognito;
4. normal login; 5. authenticated refresh; 6. protected deep link with session;
7. protected deep link without session; 8. forgot password; 9. valid recovery
link; 10. refresh with reset form open; 11. password update after that refresh;
12. manually typed reset route without recovery context; 13. login using new
password; 14. logout; 15. Back after logout; 16. authenticated payment callback;
17. signed-out callback -> login -> reconciliation; 18. duplicate callback;
19. vendor route; 20. rider route; 21. admin AAL1 denial; 22. admin AAL2 success;
23. multi-tab sign-out/session propagation. Also exercise slow profile response
across A -> logout -> B, revoked role on re-entry, expired recovery intent, and
Auth-server failure before password submission. Do not record PASS from mocks.

Directly navigate and refresh `/`, `/login`, `/profile`, `/orders`, `/vendor`,
`/rider`, `/admin`, `/login` with a recovery link, `/reset-password`, and payment
returns at `/orders` and `/vendor`. Confirm private UI waits for restoration,
unauthenticated access prompts sign-in, and callbacks never count as payment
proof. Admin tests must explicitly attempt a controlled staging privileged RPC
at AAL1 (reject), complete MFA (AAL2), repeat the write, refresh, then sign out
and repeat access. Do not infer these results from the visible admin menu.

This runbook separates schema replay from environment-specific scheduler
activation. Never place secret values in migrations, source files, browser
configuration, or GitHub Actions logs. The historical scheduler migrations
only enable `pg_cron`/`pg_net`; they do not create network jobs or require Vault
secrets. `20270101_scheduler_environment_configuration.sql` is the sole
repository migration that activates the three environment-specific worker jobs.
It removes those exact stable job names and leaves them inactive when the
environment configuration is incomplete.

Editing an already-applied historical migration does not rerun or repair it in
an existing database. This source change makes clean replays safe; existing
projects retain their current scheduler state until the forward migration is
applied or the documented configuration RPC is explicitly called. No remote
database was changed as part of this repository repair.

## Required order

1. Create an isolated Supabase project. Before any remote CLI or SQL command,
   compare `supabase/.temp/project-ref` and `supabase/.temp/linked-project.json`
   with the approved staging project ref. `supabase status` reports local
   services; it is not proof of the remote link target. This checkout currently
   links to production (`cmfohldnmytmwjynqfpz`). Confirm the target, run
   `supabase link --project-ref <staging-project-ref>`, then reread the local
   link metadata before proceeding. Never run `supabase db push`, `supabase db
   reset` (especially with `--linked`), migration repair, remote SQL/database
   mutations, or project-targeted `supabase functions deploy` while the link is
   production unintentionally.
2. Configure the staging frontend URL/key/CSP and staging Edge environment,
   including `DROPZYY_ENVIRONMENT=staging`, Paystack TEST, explicit
   `ALLOWED_ORIGIN`, and explicit `PAYSTACK_CALLBACK_URL`. Do not provision
   scheduler Vault values yet.
3. Confirm the hosted project provides Vault, Storage, `pg_cron`, and `pg_net`.
   The migration history enables `pg_cron`/`pg_net`; availability of those
   extensions and Vault is a Supabase platform prerequisite.
4. Apply the complete migration history to the verified staging project. Keep
   `dropzyy_scheduler_base_url`, `automatic_cutoff_worker_secret`, and
   `cleanup_job_secret` absent so the final migration leaves scheduler jobs
   inactive.
5. Deploy every function in `supabase/functions` after setting the required
   non-scheduler Edge secrets.
   Supabase-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be
   available to the functions that consume them.
6. Add the three database Vault entries below with staging values, then call
   `select public.configure_dropzyy_scheduled_workers();` from a privileged
   database administration session. This safely replaces only the three stable
   repository job names and is idempotent. Do not activate until the Edge
   Functions are deployed and all three entries correctly target staging.
7. Verify the three cron targets point only to staging; then configure the
   authenticated external reconciliation schedulers.
8. Configure staging Auth URLs and Paystack TEST callbacks/webhooks, deploy the
   staging frontend, verify Storage/Realtime/extensions, and run the Phase B
   and Phase A runtime suites.

## Database Vault entries

| Name | Consumer | Required before migration replay | Required before scheduler activation | Purpose |
| --- | --- | --- | --- | --- |
| `automatic_cutoff_worker_secret` | cutoff cron job | No (not required for migration replay) | Yes | Authenticates `automatic-cutoff-worker`; pair with Edge secret `AUTOMATIC_CUTOFF_WORKER_SECRET` |
| `cleanup_job_secret` | cleanup cron jobs | No (not required for migration replay) | Yes | Authenticates both cleanup functions; pair with Edge secret `CLEANUP_JOB_SECRET` |
| `dropzyy_scheduler_base_url` | forward scheduler configuration | No (not required for migration replay) | Yes | The staging project's `https://<project-ref>.supabase.co` base URL |

Replay order is safe by construction: `20261127` enables the cutoff-related
extensions only; `20261217` enables `pg_cron` only; later migrations do not
activate these workers; and `20270101` reconciles the three stable jobs using
the configured Vault base URL, or leaves them inactive when configuration is
missing. The repository-owned jobs are
`dropzyy-automatic-cutoff-worker`, `dropzyy-cleanup-rate-limits`, and
`dropzyy-cleanup-admissions`.

## Edge Function secrets

| Name | Consumers | Required before Edge deployment | Purpose |
| --- | --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | Paystack initialize, verify, webhook, refund, transfer, and reconciliation functions | Yes for Paystack operations | Paystack server authentication |
| `SUPABASE_URL` | server-side functions | Platform-provided | Project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side functions | Platform-provided | Server-side database access |
| `AUTOMATIC_CUTOFF_WORKER_SECRET` | cutoff worker and cutoff transfer worker | Yes before scheduler activation | Matches its Vault scheduler secret |
| `CLEANUP_JOB_SECRET` | cleanup workers | Yes before scheduler activation | Matches its Vault scheduler secret |
| `REFUND_RECONCILIATION_WORKER_SECRET` | refund reconciliation worker | Yes before external invocation | Authenticates trusted reconciliation invoker |
| `TRANSFER_RECONCILIATION_WORKER_SECRET` | transfer reconciliation worker | Yes before external invocation | Authenticates trusted reconciliation invoker |
| `PAYSTACK_RECONCILER_SECRET` | payout-cost reconciliation worker | Yes before external invocation | Authenticates trusted reconciliation invoker |
| `ALLOWED_ORIGIN` | browser-facing functions | Yes | CORS allowlist |
| `PAYSTACK_CALLBACK_URL` | payment initialization functions | Yes | Approved payment return URL |
| `DROPZYY_ENVIRONMENT` | payment initialization functions | Yes | Exact deployment label: `production`, `staging`, or `development`; server-side callback isolation policy |

`paystack-refund-reconcile`, `paystack-transfer-reconcile`, and
`paystack-payout-cost-reconcile` do not currently have repository-owned
`pg_cron` jobs. Configure an authenticated server-side scheduler only after
their corresponding worker secret is set; do not invoke them from a browser or
embed their worker secrets in client code.

## Edge Function deployment manifest

Deploy every directory below after setting its required Edge Function secrets.
`verify_jwt` is declared explicitly in `supabase/config.toml`; it is a gateway
check, not a replacement for the function-level authorization noted here.

| Function | verify_jwt | Primary caller/authentication |
| --- | ---: | --- |
| `admin-financial-recovery` | true | Admin JWT, `is_admin`, and AAL2 |
| `automatic-cutoff-transfer` | false | Internal cutoff worker secret |
| `automatic-cutoff-worker` | false | Internal cutoff worker secret |
| `cleanup-admissions` | false | Cleanup worker secret |
| `cleanup-rate-limits` | false | Cleanup worker secret |
| `order-admission` | true | Customer JWT; SQL owns order identity and value |
| `paystack-initialize` | true | Customer JWT |
| `paystack-initialize-delivery` | true | Vendor JWT |
| `paystack-payout-cost-reconcile` | false | Internal reconciler secret |
| `paystack-refund` | true | Admin JWT and AAL2 |
| `paystack-refund-reconcile` | false | Internal refund-reconciliation secret |
| `paystack-transfer` | true | JWT; server/RPC authorization by transfer purpose |
| `paystack-transfer-recipient` | true | Owner JWT; payee identity derived server-side |
| `paystack-transfer-reconcile` | false | Internal transfer-reconciliation secret |
| `paystack-transfer-webhook` | false | Paystack HMAC-SHA512 signature |
| `paystack-verify` | true | Owner/vendor JWT plus Paystack verification |
| `paystack-webhook` | false | Paystack HMAC-SHA512 signature |

Browser-callable functions use the explicitly configured `ALLOWED_ORIGIN`
comma-separated allowlist. There is no implicit production or localhost
default; missing configuration yields no browser CORS approval, and payment
initializers fail closed. An unlisted origin receives no `Access-Control-Allow-Origin` header. Webhook
and worker functions are POST-only and intentionally do not provide browser
CORS preflight support.

For a reviewed target project, deploy one function at a time using
`supabase functions deploy <function-name>`. The committed `config.toml` is
the intended JWT-verification manifest. Do not use `--no-verify-jwt` for a
function listed as `true`, and do not deploy a webhook/worker with a gateway
JWT requirement that would prevent its legitimate provider/server caller.

## Storage, Realtime, and extensions

Supabase-hosted projects normally provide the `storage` schema. The product
image migration creates the `product-images` public bucket (5 MB; JPEG, PNG,
WebP) and policies when `storage.buckets`/`storage.objects` exist. Its guarded
fallback is not successful provisioning: if it warns, enable/repair Storage and
create or verify that bucket and policies before enabling uploads.

`pg_cron` and `pg_net` are enabled by migration but must be available to the
project plan/platform. Vault is platform-provided and is queried by scheduler
configuration. `gen_random_uuid()` is used throughout the schema and is
expected from Supabase's PostgreSQL environment. Realtime publication changes
are guarded: notifications, products, orders, and order_items are added only
when `supabase_realtime` exists.

## Verification

Run `npm run validate`, then inspect migration state and scheduler jobs in the
isolated project. Confirm the three cron jobs target that project's URL, verify
the Storage bucket/policies, test Auth redirects, and perform the Phase A
financial runtime suite with non-production Paystack credentials. A local clean
reconstruction remains mandatory before classifying deployment reproducibility
as verified.

Before release, compare each deployed function to this manifest: deployed
version, JWT flag, required secrets, expected rejection without authentication,
origin behavior, and sanitized logs. Local source does not prove deployed
function state.

## Operational configuration and environment readiness

### Intentional secret pairings

The following values must contain the same randomly generated value, but use
different names because they are stored by different systems:

| Database Vault | Edge Function environment | Consumers |
| --- | --- | --- |
| `automatic_cutoff_worker_secret` | `AUTOMATIC_CUTOFF_WORKER_SECRET` | cutoff worker and cutoff transfer worker |
| `cleanup_job_secret` | `CLEANUP_JOB_SECRET` | rate-limit and admission cleanup workers |

`dropzyy_scheduler_base_url` is not paired with an Edge secret. It is the
current environment's base URL in the form `https://<project-ref>.supabase.co`.
The SQL rejects non-Supabase-hosted URL shapes, but portable PostgreSQL cannot
independently discover the linked Supabase project reference. The operator must
compare it to `supabase status`/Dashboard project details before scheduler
activation; this is a required runtime check, not a claim made by the schema.

Generate each worker secret with a cryptographically secure generator. Use a
unique value per purpose and per environment; never reuse a Paystack key or a
Supabase service-role key. Keep values out of Git, shell history, browser code,
and logs. Rotation requires first updating the Edge Function secret, then the
matching Vault entry, then immediately running
`select public.configure_dropzyy_scheduled_workers();` so jobs are recreated.
During that short transition, watch for 401 responses and do not rotate both
environments together.

### Scheduler inventory

| Job | Cadence | Target | Auth source | Ownership / duplicate safety |
| --- | --- | --- | --- | --- |
| `dropzyy-automatic-cutoff-worker` | Every minute | `automatic-cutoff-worker` | cutoff Vault/Edge secret pair | Repository-owned; claim RPCs and idempotent finalization tolerate overlap |
| `dropzyy-cleanup-rate-limits` | Daily 03:00 | `cleanup-rate-limits` | cleanup Vault/Edge secret pair | Repository-owned; expired-row cleanup is repeat-safe |
| `dropzyy-cleanup-admissions` | Daily 04:00 | `cleanup-admissions` | cleanup Vault/Edge secret pair | Repository-owned; expired-row cleanup is repeat-safe |
| Refund reconciliation | Recommended every 10–15 minutes | `paystack-refund-reconcile` | `REFUND_RECONCILIATION_WORKER_SECRET` | External authenticated scheduler required; claim RPC uses locked batches |
| Transfer reconciliation | Recommended every 10–15 minutes | `paystack-transfer-reconcile` | `TRANSFER_RECONCILIATION_WORKER_SECRET` | External authenticated scheduler required; reconciles stale settlement and customer-reimbursement transfers by existing Paystack reference (30-minute stale threshold); claim RPCs use locked batches |
| Payout-cost reconciliation | Daily operational review/reconciliation | `paystack-payout-cost-reconcile` | `PAYSTACK_RECONCILER_SECRET` | External authenticated scheduler required; reporting/fee-evidence support, not transfer authorization |

The forward scheduler function unschedules only those three stable repository
job names, then recreates one job per name. Repeated calls are idempotent.
It uses POST `net.http_post` calls with an `apikey` obtained from Vault at run
time. Missing configuration leaves jobs inactive; it does not create insecure
fallback jobs. `pg_cron` does not imply exactly-once execution, so cutoff,
refund, and transfer workers rely on database claims, leases, and idempotent
finalization rather than scheduling alone.

Failure signals are HTTP 401/500 responses in cron/net and Edge logs, increased
stale-claim/reconciliation backlog, or expired cutoff leases. Investigate rather
than blindly creating duplicate transfers. Treat refunds/transfers that remain
processing beyond the existing claim/reconciliation lease window, a cutoff
worker with no recent successful run, or repeated scheduler 401/5xx responses
as operations incidents. This repository does not yet provide alert delivery;
operators must monitor Supabase cron/net, Edge logs, and the financial ledgers.

### Paystack and environment separation

| Environment | Paystack key | Payment/refund webhook | Transfer webhook | Callback / origins |
| --- | --- | --- | --- | --- |
| Staging | TEST `PAYSTACK_SECRET_KEY` only | `https://<staging-project-ref>.supabase.co/functions/v1/paystack-webhook` | `https://<staging-project-ref>.supabase.co/functions/v1/paystack-transfer-webhook` | Staging HTTPS frontend and its explicit `ALLOWED_ORIGIN`/callback |
| Production | LIVE `PAYSTACK_SECRET_KEY` only | `https://<production-project-ref>.supabase.co/functions/v1/paystack-webhook` | `https://<production-project-ref>.supabase.co/functions/v1/paystack-transfer-webhook` | Production HTTPS frontend and its explicit `ALLOWED_ORIGIN`/callback |

`paystack-webhook` handles signed `charge.success`, failure/abandonment events,
and signed refund pending/processing/processed/failed events.
`paystack-transfer-webhook` handles signed `transfer.success`,
`transfer.failed`, and `transfer.reversed` events. Paystack uses the same secret
key for API authorization and webhook HMAC verification in this implementation.
**PAYSTACK DASHBOARD — UNVERIFIED.** Configure each provider environment only
with that environment's endpoints and key mode; a TEST/LIVE key mismatch, or a
staging URL pointing at production, is a release-blocking operator error.

`DROPZYY_ENVIRONMENT` is required by both payment initializers and must match
the deployed project. `PAYSTACK_CALLBACK_URL` is mandatory in every environment
and must be a valid fixed-route URL whose origin is explicitly in that
deployment's `ALLOWED_ORIGIN`. Product/replacement payments return to `/orders`;
vendor delivery payments return to `/vendor`. The request Origin must itself be
allowlisted. Staging callbacks must use the same staging origin as the request;
the resolver rejects production and localhost origins under the staging label.
Development callbacks must remain on the explicitly allowed localhost origin;
production callbacks must be explicitly configured on an allowed Dropzyy
production origin and the request must come from an allowed production origin.
Deployed callbacks require HTTPS; HTTP is allowed only for localhost. No
initializer infers production from a fallback or silently selects a production
URL.

**Never leave `PAYSTACK_CALLBACK_URL` unset expecting a production default.**
Missing, malformed, untrusted, or cross-environment environment/callback/origin
configuration returns a sanitized configuration error before a payment
obligation/payment record is created or Paystack is called.

### Per-environment checklist

- [ ] Confirm environment project reference and `dropzyy_scheduler_base_url` match.
- [ ] Verify/relink CLI to the intended project before every remote command.
- [ ] Set Edge environment secrets, including `DROPZYY_ENVIRONMENT`, distinct worker secrets and the correct TEST/LIVE Paystack key; set explicit callback and origin values.
- [ ] Apply migrations with scheduler Vault activation values absent.
- [ ] Deploy the manifest functions before scheduler activation.
- [ ] Provision environment-specific Vault values, run `configure_dropzyy_scheduled_workers()`, and verify exactly three jobs target this project.
- [ ] Configure the authenticated external scheduler policy for refund, transfer, and payout-cost reconciliation.
- [ ] Verify `product-images` bucket/policies, allowed origins, callback routes, and Auth redirects.
- [ ] Configure and test Paystack payment/refund and transfer webhook destinations for this environment.
- [ ] Test JWT, worker-secret, and invalid-webhook-signature rejection paths before financial release.
