# Dropzyy full audit — 1 October 2026

**Assessment: the architecture and security posture remain solid, but the current
repository HEAD is broken in two independent ways and the CI gate is red. This is
not a sign-off state.**

Reviewed the deployment build, front-end app/admin bundles, auth lifecycle, the
145-migration history, 19 Edge Functions, tests/CI, documentation and repository
hygiene. Findings below were reproduced locally (no live account, payment, or
schema mutation was performed).

- Repository HEAD: `500581e` ("LADING ERROR"). Working tree is **not clean**:
  `assets/js/app.js` and `scripts/validate_all.js` are modified and
  `scripts/validate_rider_orders_poll.js` is untracked.
- Inventory: 6,785-line `app.js`, 4,145-line `admin.js`, 145 SQL migrations,
  19 Edge Functions (17 + `_shared` x2), 43+ validator scripts.

## Evidence (executed in this audit)

| Check | Result |
|---|---|
| `node scripts/validate_all.js` | **PASS** (68 JS files syntax-checked; all structural validators pass) |
| `npm test` → `test:db` | **FAIL** — aborts applying `20270116_rider_claim_order_rpc.sql` |
| `npm test` → `test:ui` | Did not run (short-circuited by `&&`); run in isolation, **PASS** (2/2) |
| `node scripts/build_publish.js` | **PASS** — 25 files, 2961.9 KB, internals excluded |
| PGlite reproduction of the failing SQL | Reproduced exactly (see P1-1/P1-2) |
| HEAD vs worktree `stopRiderOrdersPoll` | HEAD: 0 defs / 4 calls; worktree: 1 def / 4 calls |
| Tracked-secret scan | No real secrets; one docstring placeholder `sk_test_xxx` |

## Findings

### P1-1 — `20270116_rider_claim_order_rpc.sql` is invalid PL/pgSQL: it cannot be applied and it breaks CI

`supabase/migrations/20270116_rider_claim_order_rpc.sql:54`:

```sql
RAISE EXCEPTION 'Order cannot be claimed in status %' USING ERRCODE = '409', v_order.status;
```

In PL/pgSQL the format arguments must come **before** `USING`; the migration puts
them after. Verified in PGlite:

```
CREATE FAIL : A: USING then positional arg  ->  unrecognized RAISE statement option at or near "'y'"
CREATE OK   : B: positional arg then USING
```

Because `tests/db/regression.cjs` applies every migration after `20270109`
(lines 87–91), `npm test` fails with
`Corrective migration 20270116_rider_claim_order_rpc.sql: unrecognized RAISE statement option`.
CI (`.github/workflows/validate.yml`) runs `npm test`, so **CI is red**, and
`test:db` aborts before any of its corrected-behaviour scenarios run.

Correct form:

```sql
RAISE EXCEPTION 'Order cannot be claimed in status %', v_order.status USING ERRCODE = 'P0001';
```

### P1-2 — The same migration uses invalid `ERRCODE` values (`'404'`, `'409'`)

Six occurrences (lines 41, 46, 50, 54, 60, 65). `ERRCODE` expects a 5-character
SQLSTATE or a known condition name. Verified in PGlite:

```
CREATE OK   : D: ERRCODE '404' (3-char)
runtime t4 -> unrecognized exception condition "404"
```

So even after the syntax error is fixed from the intended `RAISE` site, the
caller receives `unrecognized exception condition "409"` instead of the intended
message. The front-end classifies claim failures by message regex
(`app.js:5954` `/active deliver|max.*2|limit reached|already has 2/`,
`app.js:5958` `/not found|already has a rider|not a rider delivery|cannot be claimed/`),
so **every eligibility rejection silently falls through to the generic
"Could not accept this delivery" path** and the specific UX is lost.

Fix: use valid SQLSTATEs (`02000`/`no_data_found`, `P0001`, `23505`, …) and put
format args before `USING`.

### P1-3 — Rider claiming and batch rider-detail lookup are effectively dead in shipped code

`claim_order(uuid)` and `get_rider_details_for_orders(uuid[])` are defined
**only** in `20270116`. Since that migration cannot apply:

- `app.js:5923` `supabase.rpc('claim_order', …)` always errors → optimistic
  `Rider assigned` is reverted and riders cannot accept deliveries.
- `app.js:232` `loadRiderDetailsForOrders` calls the (nonexistent) plural RPC and
  swallows the error (`return {}`), so rider name/phone are missing on customer
  and vendor order views (used at `app.js:1130` and `app.js:1202`).

These are functional regressions introduced alongside the front-end commit that
started calling the new RPCs.

### P1-4 — HEAD `app.js` throws `ReferenceError` during auth bootstrap (fixed only in the uncommitted worktree)

At HEAD there are **4 call sites** of `stopRiderOrdersPoll()` and **0
definitions**. The call chain `clearPrivateAuthState()` →
`clearRiderOrdersSubscription()` → `stopRiderOrdersPoll()` throws, so
`initialAuthReady` is never set and the login form never paints — matching the
`LADING ERROR` commit message.

The working tree adds the missing function and an untracked
`scripts/validate_rider_orders_poll.js` that asserts it is defined exactly once
(registered in the modified `scripts/validate_all.js`). **None of this is
committed**, so CI receives the broken HEAD and has no coverage for it. This fix,
the new validator, and the `validate_all.js` registration must all be committed.

---

### P2-1 — Documentation contradicts the actual build and tooling

`README.md` ("no build step", "no dev dependencies") and `DOCUMENTATION.md`
("there is no build step") are stale: `netlify.toml` runs
`node scripts/build_publish.js`, and `package.json` declares `devDependencies`
(`@electric-sql/pglite`, `linkedom`) that CI installs for `npm test`.

### P2-2 — Publish payload has grown and includes unused assets

Adding root `images/` to the publish allow-list raised the deploy from the
previously documented 15 files / ~1,033 KB to **25 files / 2,961.9 KB**. It
includes a 1.1 MB `images/Dropzyy llogo .jpg`, several WhatsApp JPEGs, duplicate
vendor images and filenames containing spaces. Trim/optimise the allow-list.

### P2-3 — Repository hygiene: leftover artifacts are committed

Tracked noise: `_backup_20260929_combined_corrupted.sql`,
`supabase/archive/20260815_current_rls_backup.sql.bak`, and two Word binary temp
files `~WRL0003.tmp` / `~WRL0529.tmp` (plus untracked `~$OPZYY TESTER.docx`).
Two stray root scripts, `debug_checks.js` and `test-openai.mjs`, are committed;
`test-openai.mjs` is the only consumer of the runtime `openai@^7.25.0`
dependency and calls a `gpt-6-luna` model that the application never uses.
`.tmp/` and `dist/` are correctly git-ignored, and the publish allow-list keeps
all of the above out of the deployed site (good).

### P2-4 — `admin.css` shipped to the public app

`assets/html/index.html` loads both `styles.css` and the 1,039-line `admin.css`
although the customer app barely uses it. Minor payload/parse cost.

## What is working well

- **Fail-closed publishing**: `build_publish.js` copies an explicit allow-list,
  refuses symlinks, and validates required files / forbidden segments and
  extensions before upload.
- **Security headers**: one authoritative CSP delivered as an HTTP header
  (`frame-ancestors` actually enforced), HSTS, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`.
- **Config fail-closed**: `config.js` disables the client and throws on any
  origin other than `dropzyy.com`; only the publishable key is present.
- **Edge Functions**: HMAC-SHA512 webhook verification with constant-time
  compare, body-size and content-type guards, service-role strictly server-side,
  and an explicit CORS origin allow-list with no implicit defaults.
- **Auth lifecycle** (`auth-lifecycle.js`): generation tickets, logical-session
  dedup, and password recovery gated on a freshly server-verified session with
  TTL checks — careful, defensible design.
- **Modal** (focus trap, Escape/backdrop cancel, focus restore) — and the
  overlapping-dialog promise bug is fixed; the UI regression test passes.
- **The PGlite DB harness is genuinely valuable** — replaying bootstrap + 138
  migrations is exactly what surfaced the `20270116` defect, which static
  validators missed.
- **No secrets** in tracked source; pricing/financial mutations remain
  server-owned.

## Maintainability

The static-frontend + Supabase architecture is sound and does not need a
rewrite. The recurring risk is concentration and drift: ~11,000 lines across two
monolithic JS files, a 145-file append-only migration history where the newest
file is unverified, and docs that no longer match the build. Two of this audit's
red findings are exactly this class of problem.

## Recommended order of work

1. **Fix and verify `20270116`**: move `RAISE` args before `USING`, replace the
   invalid `'404'`/`'409'` codes, then confirm `npm test` passes end-to-end.
2. **Commit the rider-poll fix** (`app.js`), the new
   `validate_rider_orders_poll.js`, and its `validate_all.js` registration so CI
   actually covers HEAD.
3. Confirm `claim_order` / `get_rider_details_for_orders` survive the real
   triggers and 2-active-delivery cap in a staging project (the harness cannot
   exercise them until P1-1 is fixed).
4. Reconcile the docs with the real build/tooling; trim committed artifacts and
   the publish allow-list.
5. Track the broader items already logged in the 2026-09-30 audit
   (withdrawal/reconciliation hardening, direct-write bypasses) — unchanged here.

## Verification boundary

This audit executed static validation, the PGlite migration replay, the UI
regression, the publish build and targeted SQL reproductions. It did **not**
touch a live Supabase project, run an authenticated browser journey, or send any
Paystack request, and did not modify application source. The local evidence is
strong; it does not establish deployed migration state or real-money behaviour.
