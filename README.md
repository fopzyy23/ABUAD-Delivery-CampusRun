# Dropzyy — Campus Delivery for Students (ABUAD)

Dropzyy is a campus delivery web app for Afe Babalola University (ABUAD):
students order food, drinks, books and essentials from campus vendors, and
approved student riders deliver them. Built as a **static frontend +
Supabase backend** — no custom server, no build step.

> **Payment status: Paystack checkout is integrated.** Checkout places the
> order (server-priced via the `place_order` RPC) and redirects the customer
> to Paystack for payment. Payment state is server-authoritative: the webhook
> updates `payment_status` only after HMAC signature verification and amount
> validation. No payouts, refunds, or revenue splitting happen yet — those
> are B4B/B5.

## Features

- **Customers**: browse vendors/products, cart, checkout (server-priced via
  the `place_order` RPC), order tracking with a status timeline, order
  history + receipt view, reorder, rider ratings, in-app notifications.
- **Vendors**: own-product CRUD (add/edit/toggle/delete), own-order
  dashboard with status transitions, rider vs self-delivery choice.
- **Riders**: application flow, online/offline availability, claimable
  order pool, pickup → on-the-way → delivered progression, estimated
  earnings history, withdrawal **requests** (records only — no money moves).
- **Admin**: catalog/vendor management, user→vendor assignment (via a
  secure RPC), order status control, rider approval, withdrawal review.
- **Security**: RLS everywhere, SECURITY DEFINER helpers, status-transition
  trigger, and **server-side order pricing** — the browser can never set
  prices/totals (see `supabase/migrations/20260906_secure_order_pricing.sql`).

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (hash-routing SPA), HTML, CSS — no framework, no build step |
| Admin | Same stack; `assets/js/admin.js` (IIFE) served standalone at `/admin` |
| Backend | Supabase (Postgres + RLS, Auth, RPCs, triggers, Realtime) |
| Hosting | Netlify (static, `netlify.toml` + `_redirects`) |
| Tooling | Node.js scripts only (`scripts/`), no dev dependencies |

## Repository layout

```
assets/html/          app entry (index.html) + admin panel (admin.html)
assets/js/            app.js (customer/vendor/rider app), admin.js, config.js
assets/css/           styles.css, admin.css
supabase/migrations/  append-only SQL migration history (apply in name order)
supabase/BASELINE.md  database reproduction notes (base tables, gaps)
scripts/              seed + validators (Node, dependency-free)
images/               static vendor images
netlify.toml          deployment + SPA redirects
```

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Recreate the database: see **`supabase/BASELINE.md`** — it documents the
   5 base tables that predate the migration history (`orders`, `order_items`,
   `profiles`, `vendors`, `products`) and everything else the migrations
   create. There is **no destructive baseline migration**; migrations are
   append-only and idempotent.
3. Dashboard → **SQL Editor** → run every file in `supabase/migrations/`
   **in filename order** (20260814 → 20260906). All are safe to re-run.
   Key objects created: RLS policies for every table, `is_admin()` and
   other SECURITY DEFINER helpers, order/vendor/rider workflow triggers,
   `notifications` (+ event triggers + Realtime publication),
   `withdrawal_requests`, and the `place_order` checkout RPC.
4. Dashboard → **Project Settings → API**: copy the project URL and the
   **publishable / anon** key.

### Configuration (`assets/js/config.js`)

The frontend reads two constants from `assets/js/config.js`:

```js
const supabaseUrl = 'https://<project-ref>.supabase.co';
const supabaseKey = '<publishable-anon-key>';
```

The publishable/anon key is **public by design** — all access is protected
by Row Level Security. **Never** place a service-role key in any frontend
file. Service keys belong only in environment variables for trusted
server-side scripts (e.g. `SUPABASE_SERVICE_ROLE_KEY` for the seeder).
This is a static Netlify site with no build step, so there is no
env-substitution — the file *is* the configuration.


## Paystack server-side infrastructure (B3)

Payment processing uses **Supabase Edge Functions** so that no Paystack
secret ever reaches the browser. The frontend only ever calls these
functions with an order id + email; the amount is read from the
authoritative `orders` table server-side and can never be set by the
client.

```
supabase/functions/
  paystack-initialize/   POST  initialize a Paystack transaction
  paystack-webhook/      POST  receive + validate Paystack webhooks
```

### Required Edge Function secrets

Set these in the Supabase Dashboard → **Edge Functions** → **Secrets**
(they are injected at runtime — never hardcoded in any file):

| Variable | Used by | Purpose |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | all six | Paystack secret key (`sk_live_xxx` / `sk_test_xxx`) — authorizes Paystack API calls + verifies webhook signatures |
| `SUPABASE_URL` | all six | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | all six | Service-role key — server-side only; used to read/verify orders/payments before calling Paystack or applying results |
| `ALLOWED_ORIGIN` | initialize, refund, transfer, transfer-recipient | Comma-separated CORS origin allowlist, e.g. `https://dropzyyy.netlify.app,http://127.0.0.1:5500`. The request `Origin` is echoed back only when allowlisted — never a wildcard `*`. These four functions default to exactly those two origins if unset. The two Paystack webhooks do **not** use `ALLOWED_ORIGIN` (server-to-server). |

> **No secret value is stored in this repository.** The Edge Functions
> read them from `Deno.env.get(...)`. The publishable/anon key in
> `assets/js/config.js` is the only key that appears in the codebase,
> and it is public by design (all access is guarded by RLS).

### How it works

- **`paystack-initialize`** — authenticates the caller from the Bearer
  JWT, fetches the order by id, verifies it belongs to that user, that
  `payment_status = 'pending'`, and that the order has items. The amount
  comes from `orders.total` (never the request body). It calls
  `POST https://api.paystack.co/transaction/initialize` server-side and
  returns only `authorization_url`, `access_code`, and `reference`.
- **`paystack-webhook`** — reads the raw body, validates the
  `x-paystack-signature` header using HMAC SHA512 + the Paystack secret,
  rejects invalid signatures with HTTP 401, and validates the event shape
  (`event`, `data.reference`, `data.status`) before acknowledging with
  HTTP 200. `charge.success` / `charge.failed` events are applied through
  the secure, idempotent `handle_paystack_payment_success` /
  `handle_paystack_payment_failed` RPCs, which re-verify the amount and
  currency server-side before updating `payments` / `orders`.

### Deploy the Edge Functions

Deploy **all six** functions. There is no `supabase/config.toml` in this
repository, so the JWT-verification mode is controlled by the per-deploy
flag (`--no-verify-jwt`).

```bash
# Browser-facing functions — keep normal JWT verification (NO flag).
# Each authenticates the caller's Bearer JWT internally
# (supabase.auth.getUser + role checks) and enforces the ALLOWED_ORIGIN
# CORS allowlist (see "Required Edge Function secrets" above).
supabase functions deploy paystack-initialize
supabase functions deploy paystack-refund
supabase functions deploy paystack-transfer
supabase functions deploy paystack-transfer-recipient

# Paystack webhooks — Paystack's servers cannot send a Supabase JWT, so
# JWT verification is DISABLED with --no-verify-jwt. Authentication is the
# HMAC SHA512 x-paystack-signature check inside each function.
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy paystack-transfer-webhook --no-verify-jwt
```

> **Deployment rules**
> * The four browser-facing functions (`paystack-initialize`,
>   `paystack-refund`, `paystack-transfer`,
>   `paystack-transfer-recipient`) must keep **normal JWT verification** —
>   never deploy them with `--no-verify-jwt`.
> * The two webhook functions (`paystack-webhook`,
>   `paystack-transfer-webhook`) must be deployed **with**
>   `--no-verify-jwt`. If deployed with default JWT verification, Paystack's
>   deliveries are rejected with HTTP 401 before the signature check can
>   run: `charge.success` never confirms an order, and `transfer.success`
>   never updates a transfer.


## Migration order

Apply `supabase/migrations/*.sql` in filename order:

`20260814` vendors.delivery_method → `20260815` RLS security reset →
`20260818` (superseded by 20260820) → `20260819` riders/rider_ratings →
`20260820` vendor workflow → `20260821` RLS recursion fix (SECURITY DEFINER
helpers) → `20260822` admin vendor-assignment RPC → `20260901` 'On the Way'
+ transition trigger + customer cancel → `20260902` order payment fields →
`20260903` notifications → `20260904` discovery fields → `20260905`
withdrawal requests → `20260906` **secure order pricing** (`place_order`
RPC, direct-write lockdown, pricing trigger, vendor/rider policy fixes).

## Seed / catalog setup

```bash
npm install   # only @supabase/supabase-js (for the seeder)
SUPABASE_URL=https://<project-ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-key> \
npm run seed:catalog
```

- The seeder **aborts by default** if any seed id already exists in the
  database (it would otherwise upsert over live rows). To intentionally
  refresh seeded rows, re-run with `SEED_ALLOW_OVERWRITE=1` (or
  `--allow-overwrite`). It never deletes anything.
- The catalog lives in three intentionally-separate copies (browser
  fallback ×2 + Node seeder — they cannot share a module across runtimes).
  `scripts/validate_seed_sync.js` fails if they drift.

## Local development

No build step. Serve statically, e.g.:

```bash
npx serve .            # or: python -m http.server 8000
# open http://localhost:3000/assets/html/index.html
```

Hash routing (`#/browse`, `#/cart`, `#/orders`, `#/vendor`, `#/rider`,
`#/track/<id>`) keeps everything on one page. Admin panel: `/admin`
(Netlify) or `assets/html/admin.html` locally.

## Netlify deployment

- `netlify.toml`: publish `.`; `/admin` → `assets/html/admin.html`; SPA
  fallback serves `assets/html/index.html` so hash routes survive refresh.
- `_redirects` mirrors the same rules for non-toml deploys.
- No environment variables are required on Netlify (static config file).
- Deploy = push to `main` (or drag-and-drop the repo root).

## Roles

| Role | How it is granted | What it unlocks |
|---|---|---|
| customer | default `profiles.role = 'user'` at signup | ordering, tracking, rating |
| vendor | admin runs `assign_user_to_vendor` RPC (sets `role='vendor'` + `profiles.vendor_id`) | vendor dashboard: products + own orders |
| rider | user applies (`riders` row, `status='pending'`); admin approves | rider hub: claim/deliver, earnings |
| admin | `profiles.role = 'admin'` (set directly in the DB/SQL editor) | admin panel at `/admin` |

Role escalation is blocked server-side by `prevent_profile_role_escalation`.

## Payment status (B5)

Paystack integration is partially implemented server-side (B1–B5 complete):

* **B1–B2** — payment columns locked from all client roles; `order_number`/`payment_reference`/`transaction_id` uniqueness enforced.
* **B3** — Edge Functions `paystack-initialize` + `paystack-webhook` (signature validation, event handling).
* **B4A** — `payments` ledger table + secure server-side RPCs (`handle_paystack_payment_success`, `handle_paystack_payment_failed`, `create_pending_payment`) that validate amount/currency/order-ownership and update order payment status through the `app.order_server_update` GUC escape hatch.
* **B4B** — Settlement ledger: `vendor_settlements`, `delivery_settlements`, `refunds` tables + `generate_settlement` RPC. Vendor settlement = authoritative `SUM(price*qty)` from `order_items`. Delivery fee is flat ₦1,500, split: rider ₦1,000 + platform ₦500 (computed from the stored `rider_delivery_share` / `company_delivery_share` columns). All settlement amounts derived server-side from `orders.fee`, never from browser input.
* **B5** — Rider earnings cutover: rider earnings shifted from 100% of `orders.fee` to the authoritative rider share (`delivery_settlements.rider_amount`, ₦1,000 per delivery). Frontend uses `riderShareAmount()` for all earnings displays and reads the authoritative `get_rider_earnings` RPC result when available. New `get_rider_earnings` RPC exposes server-authoritative pending earnings, pending withdrawals, and available balance. Existing withdrawal requests preserved; withdrawal cap uses the authoritative pending earnings. `vendor_self` and cancelled/undelivered orders produce no rider earnings.
* **B6** — Payout infrastructure (no transfers initiated): `transfer_recipients` table (Paystack recipient codes, one per vendor/rider) + `transfers` ledger (pending/processing/success/failed/reversed, UNIQUE `paystack_reference` + `transfer_code`, one-settlement-per-transfer). Identity columns immutable via `app.transfer_server_update` GUC guard; all client writes blocked by RLS/grants; `create_transfer_recipient` + `create_pending_transfer` RPCs are SECURITY DEFINER with service-role-only EXECUTE and amounts copied from authoritative settlements. Edge Function `paystack-transfer-recipient` registers recipients only (`/transferrecipient`; `/transfer` is never called).
* **B7** — Transfer execution + webhook (no transfer initiated): Edge Function `paystack-transfer` (admin JWT required; accepts only `transfer_id`; loads amount/recipient/reference authoritatively via `prepare_transfer_for_payout` — never from the client; refuses non-pending/non-eligible transfers, `vendor_self`, and unassigned riders; calls `POST https://api.paystack.co/transfer`; flips the ledger to `processing` via `mark_transfer_processing` only after Paystack accepts). Edge Function `paystack-transfer-webhook` (deployed with `--no-verify-jwt` because Paystack sends no JWT; HMAC SHA512 raw-body signature validation, 401 on bad signatures; handles `transfer.success`/`transfer.failed`/`transfer.reversed` via the `apply_transfer_webhook_event` RPC, which enforces reference + transfer-code matching and terminal-state idempotency). All three RPCs are SECURITY DEFINER with service-role-only EXECUTE.

Settlement model: **Customer payment → `payments` ledger → eligible (Delivered + paid) order → pending vendor/delivery/platform settlement → pending transfer row → admin-initiated Paystack transfer → webhook-confirmed transfer status.**

The checkout button IS wired to Paystack: customers are redirected to Paystack for payment. Payment success is confirmed only via the webhook (HMAC-verified, amount-validated). Transfer *execution* infrastructure exists (B7: `paystack-transfer` + `paystack-transfer-webhook`), but **no transfer is ever initiated automatically** — a transfer only happens when an authenticated admin explicitly calls `paystack-transfer` with a pending transfer id, and none has been triggered. Refunds go through the approved-refund workflow: an admin approves a customer `requested` refund and the `paystack-refund` Edge Function executes it with Paystack (claim-before-call, apply_refund_result records the outcome).

## Payment webhook recovery / ops utility

`scripts/test_paystack_webhook.js` is a **manual, operator-run recovery
utility** for a specific failure mode: a customer's Paystack payment
succeeded, but the webhook never reached the backend, so the order is stuck
in `payment_status = 'pending'`.

**When to use it** — only when there is evidence of a genuine payment (a
real transaction visible in the Paystack Dashboard) that failed to reach
confirmation. It is **not** a normal checkout/payment mechanism and must
never be used to invent payments.

**How it works** — it builds a `charge.success` webhook payload and signs it
with HMAC-SHA512 over the exact raw body, exactly like Paystack does, then
POSTs it to the deployed `paystack-webhook` Edge Function. The deployed
webhook (signature + amount validation) and the server-side payment RPC
remain the **only** authoritative, idempotent confirmation path — the script
itself performs no database writes.

**Required environment variables** (set in your shell, never in files):

| Variable | Meaning |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack secret key (`sk_test_…`/`sk_live_…`). **Must never be committed, logged, or printed.** |
| `PAYSTACK_TXN_ID` | The **real** numeric Paystack transaction ID from the Dashboard — never invented. |
| `PAYSTACK_REFERENCE` | The order payment reference being recovered. |
| `PAYSTACK_AMOUNT_KOBO` | The actual paid amount in kobo (must match the real transaction; the webhook validates it). |
| `PAYSTACK_CURRENCY` | Optional; defaults to `NGN`. |

Example invocation (**all example values are placeholders, not real
transactions**):

```bash
set PAYSTACK_SECRET_KEY=sk_test_xxx
set PAYSTACK_TXN_ID=1234567890
set PAYSTACK_REFERENCE=dropzyy_CR-EXAMPLE_0000000000000
set PAYSTACK_AMOUNT_KOBO=100000
node scripts\test_paystack_webhook.js
```

The script aborts safely if the key format, transaction ID, reference, or
amount is missing or malformed, and redacts any secret-shaped tokens from
its output.

## Testing / validation

```bash
npm run validate         # node --check on every JS file + all offline validators
npm run validate:live    # + live read-only Supabase checks (publishable key)
```

Validators (all dependency-free, in `scripts/`):
`validate_all.js` (runner), `validate_action10.js`, `validate_action12.js`,
`validate_vendor_migration.js`, `validate_discovery_migration.js`,
`_validate_payment_prep.js`, `_smoke_action12_sql.js`,
`validate_seed_sync.js`, and the live probes
`validate_action11_live.js`, `validate_action12_live.js`,
`verify_rls_readonly.js`.

CI: `.github/workflows/validate.yml` runs `npm run validate` on every
push/PR; live checks only on manual dispatch.
