# Dropzyy — Campus Delivery for Students (ABUAD)

Dropzyy is a campus delivery web app for Afe Babalola University (ABUAD):
students order food, drinks, books and essentials from campus vendors, and
approved student riders deliver them. Built as a **static frontend +
Supabase backend** — no custom server, no build step.

> **Payment status: Paystack is NOT implemented yet.** Checkout places the
> order and records `payment_status: 'pending'` only. No payment processing,
> payouts, or revenue splitting exists anywhere in the codebase.

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

## Payment status

**Not implemented.** Orders carry `payment_status: 'pending'`; the checkout
screen says "Demo payment — no money will be charged." There is no Paystack
(or any gateway) code, no payouts, no commission splitting. The ₦1,000 flat
delivery fee is applied server-side in `place_order`.

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
