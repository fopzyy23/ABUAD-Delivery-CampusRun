# Dropzyy — Comprehensive Project Documentation

> Auto-generated documentation covering the full architecture, database schema, payment system, API surface, and workflows of the **Dropzyy** platform (student-powered campus delivery at ABUAD).

## Table of Contents

1. Project Overview
2. Technology Stack
3. Repository Layout
4. Frontend Architecture
   - 4.1 `config.js` — Supabase Client Configuration
   - 4.2 `assets/js/app.js` — Customer-Facing Application
   - 4.3 `assets/js/admin.js` — Admin Dashboard
   - 4.4 `assets/js/modal.js` — Reusable Confirm/Prompt Modal
   - 4.5 HTML Structure — Customer App Shell
   - 4.6 Netlify Routing & Headers (`netlify.toml`)
5. Deployment & CI/CD
6. Database Schema & Migrations
7. Supabase Edge Functions (Paystack)
8. Payment System Deep-Dive
9. Order Lifecycle & Workflows
10. Vendor & Product Management
11. Rider System & Earnings
12. Notifications
13. Discovery & Search
14. Refund System
15. Security Model (RLS)
16. Configuration & Secrets
17. Validation Scripts
18. Quick Start
Appendix A: Migration Timeline (Chronological)
Appendix B: Key RPC Functions

---

## 1. Project Overview

Dropzyy is a full-stack food & goods delivery platform built on Netlify (static hosting) + Supabase (PostgreSQL + Edge Functions). It supports four primary user roles:

| Role | Description |
|------|-------------|
| Customer | Places orders, tracks delivery, pays via Paystack, receives refunds. |
| Vendor | Restaurants/shops that receive orders, update status, manage products. |
| Admin | Oversees platform, assigns vendors, manages riders, handles disputes. |
| Rider | Claims pooled orders, updates delivery status, earns a fixed ₦1,000 delivery share of the ₦1,500 delivery fee. |

Key features:
- Paystack checkout (card/transfer) for customer payments
- Automated payouts to vendors via Paystack Transfer API
- 80/20 rider earnings model (rider gets 20% of delivery fee)
- Real-time order status tracking
- Notification system (in-app + push)
- Refund infrastructure with ledger tracking
- Vendor withdrawal requests
- Full-text search & featured listings

---

## 2. Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, vanilla JavaScript (ES6+) |
| Backend / DB | Supabase (PostgreSQL 15+) |
| Payments | Paystack API (Checkout, Transfer, Transfer Recipient, Refund) |
| Hosting | Netlify (static) + Supabase Edge Functions |
| CI/CD | GitHub Actions (`.github/workflows/validate.yml`) |
| Validation | Node.js scripts (`scripts/validate_*.js`) |

---

## 3. Repository Layout

```
Dropzyy/
├── netlify.toml                      # Netlify routing rules (rewrites, SPA fallback, CSP headers)
├── _redirects                        # Comment-only signpost (effective rules live in netlify.toml)
├── package.json                      # Project metadata (scripts: validate, seed:catalog)
├── README.md                         # Original README
├── DOCUMENTATION.md                  # This file
├── debug_checks.js                   # Ad-hoc debug utility
│
├── assets/
│   ├── html/
│   │   ├── index.html              # Customer app shell (loaded via `/` rewrite)
│   │   └── admin.html              # Admin dashboard shell (loaded via `/admin` rewrite)
│   ├── css/
│   │   ├── styles.css              # Customer styles (73 KB)
│   │   └── admin.css               # Admin dashboard styles (20 KB)
│   ├── js/
│   │   ├── config.js               # Supabase client config (1.8 KB)
│   │   ├── modal.js                # Reusable confirm/prompt modal (6.8 KB)
│   │   ├── app.js                  # Customer app logic (310 KB)
│   │   └── admin.js                # Admin dashboard logic (144 KB)
│   └── images/
│       └── vendors/                 # Vendor photos (jpg/webp)
│
├── supabase/
│   ├── BASELINE.md                 # Database baseline documentation
│   ├── migrations/                 # SQL schema migrations (chronological)
│   └── functions/                  # Edge Functions (Paystack integration)
│       ├── paystack-initialize/
│       ├── paystack-webhook/
│       ├── paystack-transfer/
│       ├── paystack-transfer-recipient/
│       └── paystack-transfer-webhook/
│
├── scripts/                        # Validation & smoke tests
└── .netlify/                       # Netlify CLI state (siteId)

## 4. Frontend Architecture

### 4.1 `config.js` — Supabase Client Configuration

Defines the Supabase client (URL + anon/publishable key) and the Edge Function base URL. This file contains **only public credentials** — no service-role key, Paystack secret key, or any server-side credential. All data access is protected by Row Level Security on the server.

```js
// Supabase credentials (public — safe to expose in browser)
const supabaseUrl = 'https://cmfohldnmytmwjynqfpz.supabase.co';
const supabaseKey = 'sb_publishable_B1Akr8vzkzZvAZdTaxqgDA_BalvZXHi';

// Initialize Supabase client globally
window.supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Edge Function base URL (same project, read-only from frontend)
window.SUPABASE_EDGE_URL = supabaseUrl;
```

**How to point the app at a different Supabase project:** replace the two constants above with that project's URL + anon key (Dashboard → Project Settings → API). This is a static Netlify site — there is no build step, so values are read from this file directly.

> **Note:** `config.js` does **not** export Paystack public keys or delivery-fee constants. All pricing is server-side authoritative (see §8 / BASELINE.md). The frontend never supplies the payment amount or any Paystack credential.

### 4.2 `assets/js/app.js` — Customer-Facing Application (4803 lines)

The main customer application. Loaded by `assets/html/index.html` via:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/assets/js/config.js"></script>
<script src="/assets/js/modal.js" defer></script>
<script src="/assets/js/app.js" defer></script>
```

Organized into these major sections:

| Lines | Section | Description |
|-------|---------|-------------|
| 1–180 | Initialization | DOM ready, event listeners, role detection |
| 180–380 | Menu Loading | Fetches products from `products` table, renders menu grid |
| 380–450 | Cart Management | Add/remove items, quantity adjustment, localStorage persistence |
| 450–600 | Checkout Flow | Address input, delivery fee calculation (server-side), order placement |
| 600–760 | Paystack Integration | Calls `paystack-initialize` Edge Function, handles Paystack return (`?reference=`) |
| 750–870 | Order Tracking | Polls for order status, real-time subscription via Supabase channels |
| 1000–1150 | Order History | Displays past orders with status badges |
| 1150–1340 | Vendor Dashboard | Order list, status update buttons (vendor view) |
| 1340–1887 | Map & Location | Geolocation, delivery address pinning |
| 1800–1900 | Payment History | Shows transaction records from `payments` table |
| 1916–2130 | Pool Order Joining | Rider pool functionality |
| 2130–2400 | Profile Management | User profile updates |
| 2222–2280 | Search / Discovery | Search bar integration with `discovery` fields |
| 4915–4960 | Path Route Bootstrap | Maps clean URLs (`/cart`, `/orders/42`) to hash routes (`#/cart`, `#/orders/42`) on boot |

**Key functions:**
- `initApp()` — bootstraps the entire customer interface
- `loadMenu()` — renders product cards from DB
- `renderCart()` — updates cart UI with items and total
- `placeOrder()` — validates cart, creates order record (server-side pricing), triggers Paystack
- `trackOrder(orderId)` — subscribes to real-time order updates
- `handlePaystackReturn()` — processes Paystack's `?reference=` return after checkout

**Routing model:** The app is a hash-router (`#/route`). On load, `applyPathRouteBootstrap()` checks `location.pathname` against a prefix list (`browse`, `vendors`, `cart`, `checkout`, `orders`, `order`, `track`, `refund`, `pay`, `profile`, `login`, `register`, `faqs`, `report`, `report-issue`, `vendor-requests`, `rider`) and rewrites to the matching `#/hash` route via `history.replaceState`. This lets deep links (`/cart`, `/track/42`, `/vendor/7`) resolve instead of falling back to the home route. Netlify's `/*` rewrite (see §15 / `netlify.toml`) serves `assets/html/index.html` for any non-asset path, and the bootstrap takes it from there.

**Admin HTML structure:**
- **Header:** Brand logo + "Back to Site" link + "Sign out" button
- **`#app`** (class `admin-main`): Routed content area
- **`#toastRoot`**: Toast notifications
- **`#modalRoot`**: Confirmation/modals rendered by `modal.js`

**Key functions:**
- `loadDashboardStats()` — aggregates order/payment metrics
- `manageVendors()` — CRUD operations on vendors
- `manageOrders()` — status transitions, rider assignment
- `manageRiders()` — earnings overview, manual payout triggers
- `manageNotifications()` — broadcast system notifications

### 4.4 `assets/js/modal.js` — Reusable Confirm/Prompt Modal

A self-contained, accessible replacement for native `confirm()`/`prompt()`. Loaded before `app.js` and `admin.js` so both shells can use it. No dependencies.

```js
window.DropzyyModal.confirm({ title, message, confirmText, cancelText, danger })
  → Promise<boolean>            // false on Cancel / Escape / backdrop click

window.DropzyyModal.prompt({ title, message, label,
                              placeholder, confirmText, cancelText, defaultValue })
  → Promise<string | null>      // null on Cancel / Escape / backdrop click
```

Accessibility features: `role="dialog"` + `aria-modal`, labelled/described IDs, Tab focus trap, Escape = cancel, backdrop click = cancel, focus restored to the trigger after close, background scroll-locked while open.

---

### 4.5 HTML Structure — Customer App Shell (`assets/html/index.html`)

The customer shell provides the static frame; `app.js` renders all routed content into `#app`. Key landmarks:

| Element | ID / Class | Description |
|---------|------------|-------------|
| Skip link | `#skipLink` → `#app` | Keyboard-accessible skip to content |
| Top app bar | `#appbar` (`.appbar`) | Brand logo (`Dropzyy`), top nav, theme toggle (`🌙`), notifications dropdown (`#notifWrap` → `#notifPanel`), cart icon (`#cartBtn` with `#cartCount` badge), user avatar dropdown (`#userWrap` → `#userPanel`) |
| Routed view | `#app` (`.app-main`) | All content rendered here by `app.js` |
| Footer | `.footer` | Brand, Company nav (Restaurants & Vendors, Browse items, Become a rider), Support nav (My orders, FAQs, Report an issue), copyright + "Designed & built by Alabi Fopefoluwa" |
| Mobile bottom nav | `#bottomnav` (`.bottomnav`) | Mobile-adapted nav rendered by `app.js` |
| Modal root | `#modalRoot` | Rendered into by `modal.js` |
| Toast root | `#toastRoot` (`.toast-root`) | Toast notifications, `aria-live="polite"` |

Script load order (must be exact):
1. Supabase CDN
2. `/assets/js/config.js`
3. `/assets/js/modal.js` (defer)
4. `/assets/js/app.js` (defer)

Fonts: Google Fonts — Bricolage Grotesque, Archivo, JetBrains Mono, Plus Jakarta Sans.

---

### 4.6 Netlify Routing & Headers (`netlify.toml`)

The site is served at the repo root (`publish = "."`). All routing is defined in `netlify.toml`; `_redirects` is intentionally comment-only (see its header comment).

**Rewrites (status = 200):**

| From | To | Notes |
|------|----|-------|
| `/` | `/assets/html/index.html` | Customer app shell; `force=true` so it wins over real files |
| `/admin` | `/assets/html/admin.html` | Admin shell entry point |
| `/admin.html` | `/assets/html/admin.html` | Alternate admin path |
| `/assets/admin.html` | `/assets/html/admin.html` | Alternate admin path |
| `/assets/*` | `/assets/:splat` | Identity rewrite — real files always win |
| `/*` | `/assets/html/index.html` | SPA fallback for the customer app; **not forced** so real assets are never shadowed |

The `/*` fallback lets deep links (`/cart`, `/track/42`, `/vendor/7`) resolve: Netlify serves the shell, and `app.js`'s `applyPathRouteBootstrap()` maps the clean path to a `#/hash` route on boot.

**Response headers (on `for = "/*"`):**

| Header | Value |
|--------|-------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://cmfohldnmytmwjynqfpz.supabase.co; connect-src 'self' https://cmfohldnmytmwjynqfpz.supabase.co wss://cmfohldnmytmwjynqfpz.supabase.co; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), camera=(), microphone=(), payment=(), usb=()` |

Key points:
- The CSP header is the **single authoritative policy**. The `<meta http-equiv>` CSP tags that were in the HTML shells were removed because `frame-ancestors` is silently ignored when delivered via `<meta>`.
- `img-src` permits images from Dropzyy's own Supabase Storage origin (`cmfohldnmytmwjynqfpz.supabase.co`) so product/vendor photos render. No new `unsafe-inline` was added. `https://www.google.com` is **not** in `img-src` — broken Google image search thumbnails remain blocked by the browser.

### 5. Database Schema & Migrations

Migrations are applied chronologically. Total of 26 migrations span Aug 14 – Sep 19, 2026.

### 5.1 Foundation & Security

**`20260815_fix_rls_security.sql`** — Creates core tables and defines RLS policies:
- `profiles` (id, name, phone, email, role, address)
- `vendors` (id, name, phone, address, lat, lng, approved)
- `products` (id, vendor_id, name, price, category_id, image_url, available)
- `categories` (id, name, vendor_id, display_order)
- `orders` (id, customer_id, vendor_id, status, total, delivery_fee, created_at)
- `order_items` (id, order_id, product_id, quantity, price)
- `riders` (id, profile_id, available, current_location, earnings)

**RLS Policies:** Customer sees own orders; vendor sees own; admin sees all. Products vendor-scoped; public sees available only.

**`20260821_fix_orders_rls_recursion.sql`** — Fixes infinite recursion in orders RLS using `current_setting('app.role')` checks. Separates into `customer_orders_policy`, `vendor_orders_policy`, `admin_orders_policy`.

**`20260819_restore_rider_hub.sql`** — Re-adds `rider_hub` table for rider availability, current location, pool orders.

### 5.2 Vendor Workflow

**`20260818_add_vendor_order_workflow.sql`** — Adds `vendor_status` (pending→accepted→preparing→ready), `vendor_notes`, creates `vendor_order_items` view.

**`20260820_add_vendor_dashboard_workflow.sql`** — Adds `delivery_method` to vendors (pickup/delivery/both), `vendor_daily_stats` materialized view, `estimated_prep_time` to orders.

**`20260822_admin_vendor_assignment_rpc.sql`** — `assign_vendor_to_order()` and `auto_assign_vendor()` RPCs, `vendor_assignment_log` table.

**`20260814_add_delivery_method_to_vendors.sql`** — Adds `delivery_method` enum, backfills with 'both'.

### 5.3 Order Status & Payment Fields

**`20260901_add_on_the_way_status.sql`** — Adds `'on_the_way'` to order status enum. Full enum: pending, confirmed, preparing, ready, on_the_way, completed, cancelled, refunded.

**`20260902_add_order_payment_fields.sql`** — Adds `payment_status` (pending/paid/failed/refunded), `payment_reference`, `payment_method` (card/transfer/wallet), `subtotal`, `tax_amount`.

**`20260907_lock_order_payment_columns.sql`** — Trigger prevents payment column updates once set (except `app.role='system'`).

**`20260906_secure_order_pricing.sql`** — `secure_pricing` trigger recalculates total from order_items. Adds `price_locked` to order_items, creates `order_totals_view`.

**`20260908_order_identifier_uniqueness.sql`** — Adds `order_identifier` (ORD-YYYYMMDD-XXXX), `generate_order_identifier()` function.

**`20260912_add_payment_checkout_fields.sql`** — Adds `checkout_url`, `currency` (default NGN), `customer_email`.

**`20260916_require_paid_orders_for_rider_claim.sql`** — Prevents status → on_the_way/completed if payment_status != paid. Prevents rider claims on unpaid orders.

### 5.4 Payments Ledger & Settlement

**`20260909_create_payments_ledger.sql`** — Creates the `payments` table (the single authoritative payment ledger). Columns: id, order_id, reference, transaction_id, amount, currency, status, gateway, raw_payload, authorization_url, access_code, paystack_fee, paystack_net_amount, paystack_channel, paystack_paid_at, created_at, updated_at. Includes insert/update triggers, RLS policies (customers_read_own_payments, no_client_insert_payments, no_client_update_payments), and indexes on order_id/reference/status. Also adds `orders.paid_at`. Server-side functions: `create_pending_payment()`, `handle_paystack_payment_success()`, `handle_paystack_payment_failed()`, `handle_vendor_delivery_payment_success()`, `handle_vendor_delivery_payment_failed()`, `is_admin()`, `require_admin_aal2()`.

**`20260910_create_settlement_ledger.sql`** — NOT USED in current codebase. The migration was superseded; settlement calculations are now embedded in the transfer execution flow (see `20260914_create_transfer_execution.sql`). No `settlement_ledger` table exists.

**`20260913_create_transfer_ledger.sql`** — NOT USED in current codebase. Superseded by `20260914_create_transfer_execution.sql`. No `transfer_ledger` table exists.

**`20260918_settlement_transfer_handoff.sql`** — NOT USED. Superseded. No `settlement_transfer_handoff` view exists.

### 5.5 Notifications

**`20260903_create_notifications.sql`** — Creates `notifications` table (id, user_id, title, message, type, read, data, created_at). Types: order_update/payment/refund/promotion/system/payout/pool_order/user_payment_success/rider_delivery_paid. Includes `send_notification()` RPC, insert trigger, RLS, indexes. The notification system is real-time via Supabase channels.

### 5.6 Discovery & Search

**`20260904_add_discovery_fields.sql`** — Adds `search_vector` (tsvector) to products with trigger, `popularity_score` and `is_featured` to products/vendors. Creates `search_products()` RPC, `featured_products` and `featured_vendors` views.

### 5.7 Transfer Execution

**`20260914_create_transfer_execution.sql`** — Creates `transfers` table (the payout execution tracking table). Columns: id, reference, vendor_id, rider_id, order_id, amount_kobo, recipient_code, paystack_reference, status, paystack_status, paystack_transfer_id, completed_at, initiated_at, error_message, retry_count, processed_by. Includes `claim_transfer_for_execution()` and `release_transfer_for_retry()` RPCs. This is the authoritative table for payout execution — replaces the old `transfer_ledger`/`transfer_execution_queue`.

### 5.8 Refund System

**`20260919_create_refund_infrastructure.sql`** — Creates `refunds` (id, order_id, amount, reason, status, processed_by), `refund_items` tables. Functions: `request_refund()`, `process_refund()`, `approve_refund()`, `reject_refund()`. Triggers: `refund_updated_at_trigger`. Refund status values: pending/approved/rejected/processed/failed.

### 5.9 Withdrawal Requests

**`20260905_create_withdrawal_requests.sql`** — Creates `withdrawal_requests` (id, vendor_id, amount, status, account_name, account_number, bank_code, narration). Functions: `request_withdrawal()`, `approve_withdrawal()`, `reject_withdrawal()`.

**`20261023_withdrawal_bank_details.sql`** — Extends `withdrawal_requests` with `account_name`, `account_number`, `bank_name`, `bank_code` for rider payouts (idempotent `ALTER TABLE` + an `account_number` format CHECK). Rebuilds `request_withdrawal` into a mandatory 5-argument signature (`p_amount`, `p_account_name`, `p_account_number`, `p_bank_name`, `p_bank_code`) that validates bank details server-side with regexes mirroring `paystack-transfer-recipient` (account_number `^[0-9]{6,20}$`, bank_code `^[A-Za-z0-9]{2,10}$`, names ≤120 chars); the legacy single-argument signature is dropped so a bank-less withdrawal can never be submitted. Preserves the 20261022 lifetime-earnings boundary (`ds.status <> 'reversed'`) and the encumbrance rule (`w.status <> 'rejected'`). The rider withdrawal form + RPC carry payout bank details; Paystack recipient registration is best-effort through the rider-JWT Identity Edge Function (`paystack-transfer-recipient`) and does not gate the withdrawal record. Admin review UI gains a Bank account column. No money moves — payouts remain record-only pending manual admin action.

**`20261023_withdrawal_bank_details.sql`** — Extends `withdrawal_requests` with `account_name`, `account_number`, `bank_name`, `bank_code` for rider payouts (idempotent `ALTER TABLE` + an `account_number` format CHECK). Rebuilds `request_withdrawal` into a mandatory 5-argument signature (`p_amount`, `p_account_name`, `p_account_number`, `p_bank_name`, `p_bank_code`) that validates bank details server-side with regexes mirroring `paystack-transfer-recipient` (account_number `^[0-9]{6,20}$`, bank_code `^[A-Za-z0-9]{2,10}$`, names ≤120 chars); the legacy single-argument signature is dropped so a bank-less withdrawal can never be submitted. Preserves the 20261022 lifetime-earnings boundary (`ds.status <> 'reversed'`) and the encumbrance rule (`w.status <> 'rejected'`). The rider withdrawal form + RPC carry payout bank details; Paystack recipient registration is best-effort through the rider-JWT Identity Edge Function (`paystack-transfer-recipient`) and does not gate the withdrawal record. Admin review UI gains a Bank account column. No money moves — payouts remain record-only pending manual admin action.

### 5.10 Rider Earnings Cutover

**`20260911_rider_80_20_earnings_cutover.sql`** — Updates model to fixed 80/20 split. Adds `rider_earnings_rate` to orders (default 0.20). Updates `calculate_settlement()`. Backfills orders. Creates `rider_earnings_summary` view.

### 5.11 Pool Order Notifications

**`20260917_notify_riders_new_pool_order.sql`** — Creates `notify_riders_new_pool_order()` function. Trigger on orders when status → 'confirmed' for pool-eligible orders. Notifies riders within 5km via `rider_hub.current_location`.

### 5.12 Pending Payment Cleanup

**`20260905_drop_obsolete_pending_payment.sql`** — Drops old `pending_payments` table (replaced by `payments_ledger`).

## 6. Supabase Edge Functions (Paystack)

All Edge Functions use Deno runtime with TypeScript. Seven functions handle the complete Paystack integration. The four browser-facing functions (`paystack-initialize`, `paystack-initialize-delivery`, `paystack-transfer`, `paystack-transfer-recipient`) require a `Bearer <user-jwt>` header and enforce the `ALLOWED_ORIGIN` allowlist. The two webhook receivers (`paystack-webhook`, `paystack-transfer-webhook`) are deployed with `--no-verify-jwt` because Paystack sends no Supabase JWT — they authenticate Paystack via HMAC SHA512 of the raw body against the `x-paystack-signature` header.

### 6.1 `paystack-initialize`

**File:** `supabase/functions/paystack-initialize/index.ts`
**Endpoint:** `POST /functions/v1/paystack-initialize`

Initializes a Paystack Transaction (Checkout) for a customer order. **The browser sends ONLY `order_id` — every other field (amount, email, currency, callback_url) is server-side authoritative. The client can never set the payment amount.**

**Request:**
```json
{
  "order_id": "<uuid of orders row>"
}
```

**Auth:** `Authorization: Bearer <user-jwt>` header required.

**Flow:**
1. Authenticates caller from Bearer JWT
2. Verifies the order exists and belongs to the authenticated user
3. Verifies `payment_status = 'pending'` and the order has items
4. Reads the authoritative `total` from the `orders` table (client-supplied amount is never trusted)
5. Checks for an existing pending payment with an `authorization_url` — if found, **reuses it** (safe retry, no duplicate charge)
6. Calls `POST https://api.paystack.co/transaction/initialize` server-side with `email` from the authenticated user, `amount` computed from `orders.total` (kobo), an explicit `callback_url` resolved from the request Origin (falls back to `https://dropzyy.com/orders`), and metadata `{ order_id, order_number, user_id }`
7. Creates a `payments` row via `create_pending_payment(p_order_id, p_reference, p_amount, 'NGN', authorization_url, access_code)`
8. Stores `authorization_url` + `access_code` on the payment row for safe retry/reuse
9. Returns `{ authorization_url, access_code, reference }`

### 6.2 `paystack-webhook`

**File:** `supabase/functions/paystack-webhook/index.ts`
**Endpoint:** `POST /functions/v1/paystack-webhook`

Processes Paystack checkout webhook events. Deployed with `--no-verify-jwt`; authenticates Paystack via HMAC SHA512 of the raw body against the `x-paystack-signature` header using the `PAYSTACK_SECRET_KEY`. Applies **two-layer order-level authorization**: every update checks that the payment's `order_id` matches the payment's `reference` and that the caller's auth context is consistent with the order — Paystack cannot drive updates for arbitrary orders.

**Events handled:**

| Event | Action |
|-------|--------|
| `charge.success` | Marks the `payments` row `success`, sets `transaction_id`, `paid_at` on the order, updates `payment_status = 'success'`. For deliveries, also sets `delivery_payment_status = 'success'`. Updates `payments.paystack_fee`, `payments.paystack_net_amount`, `payments.paystack_channel`, `payments.paystack_paid_at` from the webhook payload. |
| `charge.failed` | Marks the `payments` row `failed`, updates `payment_status = 'failed'`. For deliveries, also marks `delivery_payment_status = 'failed'`. |
| `charge.expired` | Treated like `charge.failed`. |

**Notifications:** On successful payment, sends an in-app notification to the order owner (`UserPaymentSuccess`) and, for deliveries, to the assigned rider (`RiderDeliveryPaid`). Read receipts are written to `receipts`.

**Idempotency:** `handle_paystack_payment_success` and `handle_vendor_delivery_payment_success` are idempotent — if the payment is already `success`, the function returns immediately.

> **Note:** The webhook updates the `payments` table, **not** a separate `payments_ledger`. The `payments` table (created by `20260909_create_payments_ledger.sql`) is the authoritative payment ledger.

### 6.3 `paystack-initialize-delivery`

**File:** `supabase/functions/paystack-initialize-delivery/index.ts`
**Endpoint:** `POST /functions/v1/paystack-initialize-delivery`

Initializes a **₦1,500 vendor delivery payment** for rider deliveries. This is a **separate flow** from the product payment checkout — product payments stay `pending_vendor`/`private` and are not handled here. The delivery payment is the ₦1,500 rider delivery fee that the vendor pays when choosing a rider delivery.

**Request:**
```json
{
  "order_id": "<uuid of orders row>"
}
```

**Auth:** `Authorization: Bearer <user-jwt>` header required (the authenticated account must own the delivery payment).

**Flow:**
1. Authenticate caller from Bearer JWT; extract the email from the JWT
2. Look up the `payments` row by `reference` (the payment reference is stored in the order); verify the payment exists and is `pending`
3. Verify the payment's `order_id` matches the requested order
4. Call `POST https://api.paystack.co/transaction/initialize` server-side with:
   - `email` from the authenticated user (the vendor/customer paying the delivery fee)
   - `amount` = ₦1,500 (kobo: 150,000) — **fixed, never client-supplied**
   - `reference` = the existing payment reference
   - `callback_url` resolved from the request Origin (falls back to `https://dropzyy.com/orders`)
   - metadata `{ order_id, payment_id, user_id }`
5. Return `{ authorization_url, access_code, reference }`

**Security:**
- The payment amount is **not** in the request body — it is hardcoded to ₦1,500
- The payment reference comes from the existing `payments` row, not from the client
- The authenticated user must own the delivery payment
- Idempotent: reusing an existing valid initialization is supported

### 6.4 `paystack-transfer`

**File:** `supabase/functions/paystack-transfer/index.ts`
**Endpoint:** `POST /functions/v1/paystack-transfer`

Initiates Paystack Transfer (payout) to vendor's bank.

**Request:**
```json
{
  "settlement_id": "uuid",
  "amount": 4000,
  "recipient_code": "RCP-xxxxxxxxxx",
  "reason": "Order payout"
}
```

**Flow:** Validate settlement → verify recipient → check balance → call Paystack → update transfer_ledger + settlement_ledger.

### 6.4 `paystack-transfer-recipient`

**File:** `supabase/functions/paystack-transfer-recipient/index.ts`
**Endpoint:** `POST /functions/v1/paystack-transfer-recipient`

Creates/updates Paystack Transfer Recipient for vendor bank accounts.

**Request:**
```json
{
  "vendor_id": 45,
  "account_number": "0123456789",
  "account_name": "John Doe",
  "bank_code": "000001",
    "bank_name": "Access Bank"
}
```

### 6.5 `paystack-transfer-webhook`

**File:** `supabase/functions/paystack-transfer-webhook/index.ts`
**Endpoint:** `POST /functions/v1/paystack-transfer-webhook`

Handles Paystack Transfer webhook events. Verifies HMAC signature.

**Events:**
- `transfer.success` → marks transfer_ledger success, settlement settled, order settlement complete
- `transfer.failed` → marks failed, schedules retry
- `transfer.reversed` → marks reversed, initiates manual review

## 7. Payment System Deep-Dive

### 7.1 Payment Flow — Product Checkout

```
Customer places order (POST /functions/v1/order-admission)
  → Order created by server-side pricing (subtotal + fee, never client-supplied)
     status='pending', payment_status='pending'
  → Frontend calls paystack-initialize (POST /functions/v1/paystack-initialize)
     Body: { "order_id": "<uuid>" }  (only order_id — no amount/email/currency)
  → Edge Function authenticates Bearer JWT, verifies order + ownership + items
  → Reads authoritative total from orders table
  → Calls Paystack /transaction/initialize server-side
  → Returns { authorization_url, access_code, reference }
  → Frontend redirects customer to authorization_url (Paystack checkout)
  → Customer pays (card/transfer/bank) on Paystack
  → Paystack redirects back to callback_url (/orders?reference=...)
  → Paystack sends charge.success webhook to /paystack-webhook
  → Webhook verifies HMAC-SHA512 signature
  → Webhook calls handle_paystack_payment_success RPC:
     - payments.status = 'success', transaction_id set
     - payments.paystack_fee / paystack_net_amount / paystack_channel /
       paystack_paid_at updated from webhook fees payload
     - orders.payment_status = 'success', paid_at set
  → Notification sent to customer (UserPaymentSuccess)
```

### 7.2 Payment Flow — Vendor Delivery Payment (₦1,500)

```
Vendor selects "Rider Delivery" for an order
  → Server creates a separate payments row for the ₦1,500 delivery fee
     (payment_type = 'vendor_delivery', status = 'pending')
  → Frontend calls paystack-initialize-delivery
     (POST /functions/v1/paystack-initialize-delivery)
     Body: { "order_id": "<uuid>" }  (only order_id)
  → Edge Function looks up the delivery payment row, verifies it is pending
  → Calls Paystack /transaction/initialize with fixed ₦1,500 amount
  → Returns { authorization_url, access_code, reference }
  → Frontend redirects to Paystack checkout
  → Vendor pays ₦1,500 delivery fee
  → Paystack sends charge.success webhook
  → Webhook calls handle_vendor_delivery_payment_success RPC:
     - payments.status = 'success', transaction_id set
     - payments.paystack_fee / paystack_net_amount updated
     - orders.delivery_payment_status = 'success'
  → Notification sent to rider (RiderDeliveryPaid)
```

### 7.3 Financial Tables

| Table | Purpose |
|-------|---------|
| `payments` | Single authoritative payment ledger. Records all incoming payments from customers AND vendor delivery fees. Columns: id, order_id, reference, transaction_id, amount, currency, status, gateway, raw_payload, authorization_url, access_code, paystack_fee, paystack_net_amount, paystack_channel, paystack_paid_at, created_at, updated_at. |
| `transfers` | Tracks individual Paystack transfer (payout) calls to vendors/riders. Created by `20260914_create_transfer_execution.sql`. Columns include amount, recipient, reference, status, paystack_transfer_id, paystack_status, completed_at, retry_count, error_message. |
| `refunds` | Manages refund requests and processing. |
| `withdrawal_requests` | Vendor-initiated payout requests. Extended by `20261023_withdrawal_bank_details.sql` with payout bank details. |

> **Note:** The old table names `payments_ledger`, `settlement_ledger`, and `transfer_ledger` from earlier documentation do **not exist** in the current codebase. The current schema uses `payments` as the single payment ledger and `transfers` for payout execution tracking. There is no `settlement_ledger` table — settlement calculations are embedded in the transfer execution flow.
- **Rider earnings:** 20% of delivery fee (80/20 split)
- **VAT:** 7.5% on subtotal + delivery fee
- **Minimum payout threshold:** ₦1,000

### 7.4 Payout Schedule

- Settlements calculated immediately on payment confirmation
- Transfers queued daily or manually from admin dashboard
- Processed via `enqueue_transfers()` → `process_transfer_queue()` → `paystack-transfer` Edge Function

## 8. Order Lifecycle & Workflows

### 8.1 Order Status Values

```
pending → confirmed → preparing → ready → on_the_way → completed
   └─────────→ cancelled
   └─────────→ refunded
```

| Status | Description | Who Sets It |
|--------|-------------|-------------|
| `pending` | Order created, awaiting payment | System |
| `confirmed` | Payment verified | Webhook |
| `preparing` | Vendor accepted, cooking | Vendor |
| `ready` | Ready for pickup/delivery | Vendor |
| `on_the_way` | Rider picked up, en route | Rider |
| `completed` | Delivered to customer | Rider |
| `cancelled` | Cancelled before prep | Customer/Vendor/Admin |
| `refunded` | Fully/partially refunded | System/Admin |

### 8.2 Order Transition Rules

| From | To Allowed | Trigger |
|------|------------|---------|
| pending | confirmed | Paystack webhook (charge.success) |
| pending | cancelled | Customer (before vendor acceptance) |
| confirmed | preparing | Vendor |
| preparing | ready | Vendor |
| ready | on_the_way | Rider (claim) |
| on_the_way | completed | Rider (deliver) |
| any | cancelled | Admin |
| any | refunded | Admin (via refund process) |

**Transition gate (20260916):** Status → on_the_way/completed requires payment_status = 'paid'.

### 8.3 Pool Orders

- Orders with status='confirmed' are checked for proximity pooling
- Eligible orders within 5km radius are pooled together
- `notify_riders_new_pool_order()` triggers on confirmation
- Rider claims pool → all pooled orders transition to on_the_way

## 9. Vendor & Product Management

### 9.1 Vendor Attributes

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `name` | varchar(255) | Business name |
| `phone` | varchar(50) | Contact phone |
| `address` | text | Physical address |
| `lat` | decimal(10,8) | Latitude |
| `lng` | decimal(11,8) | Longitude |
| `approved` | boolean | Admin approval required |
| `delivery_method` | enum | delivery/pickup/both |
| `is_featured` | boolean | Featured listing |
| `category` | varchar(100) | Restaurant type |
| `operating_hours` | jsonb | Open/close times |
| `estimated_prep_time` | int | Prep time in minutes |
| `created_at` | timestamp | Registration date |

### 9.2 Product Attributes

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `vendor_id` | int | FK to vendors |
| `name` | varchar(255) | Product name |
| `description` | text | Product description |
| `price` | numeric(10,2) | Price in NGN |
| `category_id` | int | FK to categories |
| `image_url` | varchar(512) | Product image |
| `available` | boolean | Show/hide on menu |
| `is_featured` | boolean | Featured product |
| `popularity_score` | int | Usage-based ranking |
| `search_vector` | tsvector | Full-text search index |

### 9.3 Vendor Dashboard Features

Via `admin.js` and `app.js` vendor views:
- Order list with status filtering (today, this week, all)
- One-click status updates (accept, preparing, ready)
- Order item details modal
- Daily revenue summary
- Customer contact info
- Cancellation history

## 10. Rider System & Earnings

### 10.1 Rider Profile

| Column | Type | Description |
|--------|------|-------------|
| `id` | int | Primary key |
| `profile_id` | uuid | FK to profiles |
| `available` | boolean | Accepting new orders |
| `current_lat` | decimal | Real-time location |
| `current_lng` | decimal | Real-time location |
| `rating` | decimal(3,2) | Customer rating average |
| `earnings_total` | numeric(12,2) | Lifetime earnings |
| `earnings_pending` | numeric(10,2) | Unpaid earnings |

### 10.2 Rider Earnings Calculation

```
rider_earnings = delivery_fee * 0.20
```

Monthly summary via `rider_earnings_summary` view:
```sql
SELECT r.id, p.name, COUNT(o.id) as orders_completed,
       SUM(o.delivery_fee * 0.20) as earnings
FROM riders r
JOIN profiles p ON r.profile_id = p.id
JOIN orders o ON o.rider_id = r.id
WHERE o.status = 'completed'
  AND o.completed_at >= DATE_TRUNC('month', NOW())
GROUP BY r.id, p.name
```

### 10.3 Rider Claim Conditions

From `20260916_require_paid_orders_for_rider_claim.sql`:
- Order must have `payment_status = 'paid'`
- Order must have `status IN ('ready', 'confirmed')`
- Rider must be `available = true`

## 11. Notifications

### 11.1 Notification Types

| Type | Description | Recipients |
|------|-------------|------------|
| `order_update` | Order status changed | Customer |
| `payment` | Payment confirmed/failed | Customer |
| `refund` | Refund processed | Customer |
| `promotion` | Special offers | All users |
| `system` | Platform announcements | All users |
| `payout` | Vendor payout processed | Vendor |
| `pool_order` | New pool order available | Rider |

### 11.2 Notification Data Structure

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "title": "Order Confirmed",
  "message": "Your order #ORD-20260401-0001 has been confirmed",
  "type": "order_update",
  "read": false,
  "data": {
    "order_id": 123,
    "new_status": "confirmed",
    "tracking_url": "/track/123"
  },
  "created_at": "2026-04-01T12:00:00Z"
}
```

### 11.3 Sending Notifications

Via `send_notification()` RPC:
```sql
SELECT send_notification(
  user_id := 'uuid-here',
  title := 'Order Confirmed',
  message := 'Your order has been confirmed',
  type := 'order_update',
  data := '{"order_id": 123}'::jsonb
);
```

### 11.4 Real-time Delivery

In `app.js`:
```js
supabase
  .channel('public:notifications')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' },
    (payload) => addNotificationToUI(payload.new))
  .subscribe();
```

## 12. Discovery & Search

### 12.1 Full-Text Search

Products have `search_vector` tsvector updated via trigger:
```sql
-- Triggers on name, description, category name updates
SELECT setweight(to_tsvector('english', name), 'A') ||
       setweight(to_tsvector('english', description), 'B') ||
       setweight(to_tsvector('english', category_name), 'C')
```

### 12.2 Search Function

```sql
search_products(query TEXT)
-- Returns products matching query, ordered by relevance + popularity_score
```

### 12.3 Featured Listings

- `featured_products` view — products where is_featured = true AND available = true
- `featured_vendors` view — vendors where is_featured = true AND approved = true

## 13. Refund System

### 13.1 Refund Flow

```
Customer requests refund
  → request_refund() creates refund (status='pending')
  → Admin reviews and approves
  → process_refund() calls Paystack /refund API
  → Paystack processes refund
  → Webhook updates refund.status = 'processed'
  → payments_ledger + orders updated to 'refunded'
```

### 13.2 Refund Conditions

- Only orders with `payment_status = 'paid'` are eligible
- Partial refunds via `refund_items` table
- Full refund reverses entire transaction

### 13.3 Refund Audit Trail

All actions logged in `refund_audit`:
```sql
INSERT INTO refund_audit (refund_id, action, performed_by, notes)
VALUES (..., 'approved', admin_id, 'Customer reported cold food');
```

## 14. Security Model (RLS)

### 14.1 Role-Based Access

| Role | Profile.role | Capabilities |
|------|-------------|-------------|
| customer | 'customer' | Place orders, view own data, request refunds |
| vendor | 'vendor' | View own orders, update status, manage products |
| admin | 'admin' | Full access to all tables |
| rider | 'rider' | View assigned orders, update delivery status |

### 14.2 Sensitive Column Protection

From `20260907_lock_order_payment_columns.sql`:
- Payment columns (payment_status, payment_reference, payment_method) only writable by `app.role = 'system'`
- Trigger raises exception on unauthorized updates

### 14.3 ReadOnly Verification

`verify_rls_readonly.js` validates that unauthenticated connections cannot write to any table.

## 15. Configuration

### 15.1 `config.js` Constants

| Constant | Default | Description |
|----------|---------|-------------|
| `DELIVERY_FEE_BASE` | 200 | Base delivery fee (₦) |
| `DELIVERY_FEE_PER_KM` | 50 | Per-km rate (₦) |
| `PLATFORM_COMMISSION` | 0.15 | 15% commission rate |
| `VAT_RATE` | 0.075 | 7.5% VAT |
| `RIDER_EARNINGS_RATE` | 0.20 | 20% of delivery fee to rider |
| `MIN_PAYOUT_THRESHOLD` | 1000 | Minimum payout (₦) |

### 15.2 `platform_config` Table

Key-value store for runtime configuration:
- `commission_rate`, `min_payout_threshold`, `base_delivery_fee`, `per_km_rate`, `vat_rate`, `rider_earnings_rate`

## 16. Validation Scripts

All scripts use Node.js with Supabase client. Run via `node scripts/validate_all.js`.

| Script | Purpose |
|--------|---------|
| `validate_b1_b2.js` | Auth & user profile setup |
| `validate_b3.js` | Vendor registration & approval |
| `validate_b4a.js` | Product CRUD |
| `validate_b4b.js` | Category management |
| `validate_b6.js` | Order placement |
| `validate_b7.js` | Order status transitions |
| `validate_action10.js` | Payment initialization |
| `validate_action11_live.js` | Live Paystack checkout |
| `validate_action12.js` | Settlement calculation |
| `validate_action12_live.js` | Live settlement |
| `validate_paystack_checkout.js` | Full checkout flow |
| `validate_refund.js` | Refund flow |
| `validate_vendor_migration.js` | Vendor workflow migration |
| `validate_vendor_product_crud.js` | Vendor product management |
| `validate_notifications.js` | Notification system |
| `validate_discovery_migration.js` | Search & featured |
| `validate_seed_sync.js` | Catalog seed data |
| `seed_catalog.js` | Seed initial data |
| `verify_rls_readonly.js` | RLS write protection |
| `_validate_payment_prep.js` | Payment prep validation |
| `_smoke_action12_sql.js` | Settlement SQL smoke test |

## 17. Environment Variables

### Frontend (`config.js`)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Anonymous API key |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key |

### Edge Functions
| Variable | Description |
|----------|-------------|
| `PAYSTACK_SECRET_KEY` | API secret for server calls |
| `PAYSTACK_WEBHOOK_SECRET` | HMAC secret for webhook verification |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role for admin DB access |

## 18. Deployment & CI/CD

### GitHub Actions (`.github/workflows/validate.yml`)
1. Triggers on push and pull requests
2. Sets up Node.js 20
3. Runs `node scripts/validate_all.js` — dependency-free: `node --check` over every project JS file plus all offline structural validators
4. Runs `node scripts/validate_all.js --live` on manual dispatch (`workflow_dispatch`) only
5. **No deploy step in CI.** The static site is hosted on **Netlify** (`netlify.toml` + `_redirects`).

### Supabase Migration & Function Deployment
```bash
supabase login
supabase db push

# Edge Functions — deploy ALL SIX.
# The four browser-facing functions keep normal JWT verification (NO flag);
# they are called with a user/admin Bearer JWT and enforce ALLOWED_ORIGIN.
supabase functions deploy paystack-initialize
supabase functions deploy paystack-refund
supabase functions deploy paystack-transfer
supabase functions deploy paystack-transfer-recipient

# The two Paystack webhooks must be deployed with --no-verify-jwt — Paystack
# sends no Supabase JWT. HMAC SHA512 x-paystack-signature verification
# inside each function is the authentication.
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy paystack-transfer-webhook --no-verify-jwt

# Secrets (never committed): PAYSTACK_SECRET_KEY, SUPABASE_URL and
# SUPABASE_SERVICE_ROLE_KEY on all six functions; ALLOWED_ORIGIN on the
# four browser-facing functions (webhooks do not use it).
supabase secrets set PAYSTACK_SECRET_KEY=sk_... SUPABASE_URL=https://<project-ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... ALLOWED_ORIGIN=https://dropzyyy.netlify.app,http://127.0.0.1:5500
```

### Netlify Deployment
```bash
# Deploy to Netlify (manual)
netlify deploy --prod --dir=.

# Or trigger via GitHub Actions push to main
# (set up Netlify's GitHub App integration in the Netlify dashboard)
```

### Local Development
```bash
# Serve frontend locally (static, no build step)
npx serve .
# Then open http://127.0.0.1:5500
```

## 19. Quick Start

```bash
# Clone
git clone https://github.com/fopzyy23/ABUAD-Delivery-CampusRun.git
cd ABUAD-Delivery-CampusRun

# Link Supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# Deploy Edge Functions
# (the two webhooks MUST use --no-verify-jwt; the other four keep normal
#  JWT verification — no flag)
supabase functions deploy paystack-initialize
supabase functions deploy paystack-refund
supabase functions deploy paystack-transfer
supabase functions deploy paystack-transfer-recipient
supabase functions deploy paystack-webhook --no-verify-jwt
supabase functions deploy paystack-transfer-webhook --no-verify-jwt

# Set Secrets
supabase secrets set \
  PAYSTACK_SECRET_KEY=sk_... \
  SUPABASE_URL=https://<project-ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  ALLOWED_ORIGIN=https://dropzyyy.netlify.app,http://127.0.0.1:5500

# Run validation
node scripts/validate_all.js

# Serve frontend locally
npx serve .
```

## Appendix A: Migration Timeline (Chronological)

| Date | Migration | Key Changes |
|------|-----------|-------------|
| Aug 14 | `add_delivery_method_to_vendors` | Vendor delivery method enum |
| Aug 15 | `fix_rls_security` | Core tables + RLS policies |
| Aug 18 | `add_vendor_order_workflow` | Vendor status workflow |
| Aug 19 | `restore_rider_hub` | Rider hub table |
| Aug 20 | `add_vendor_dashboard_workflow` | Vendor stats, prep time |
| Aug 21 | `fix_orders_rls_recursion` | Orders RLS fix |
| Aug 22 | `admin_vendor_assignment_rpc` | Vendor assignment RPCs |
| Sep 01 | `add_on_the_way_status` | New order status |
| Sep 02 | `add_order_payment_fields` | Payment fields |
| Sep 03 | `create_notifications` | Notification system |
| Sep 04 | `add_discovery_fields` | Search & featured |
| Sep 05 | `create_withdrawal_requests` | Vendor withdrawals |
| Sep 05 | `drop_obsolete_pending_payment` | Cleanup old table |
| Sep 06 | `secure_order_pricing` | Price tamper prevention |
| Sep 07 | `lock_order_payment_columns` | Payment column locking |
| Sep 08 | `order_identifier_uniqueness` | Unique order numbers |
| Sep 09 | `create_payments_ledger` | Payment ledger |
| Sep 10 | `create_settlement_ledger` | Settlement calculations |
| Sep 11 | `rider_80_20_earnings_cutover` | Rider earnings |
| Sep 12 | `add_payment_checkout_fields` | Checkout URL |
| Sep 13 | `create_transfer_ledger` | Transfer tracking |
| Sep 14 | `create_transfer_execution` | Transfer queue |
| Sep 16 | `require_paid_orders_for_rider_claim` | Payment gate for riders |
| Sep 17 | `notify_riders_new_pool_order` | Pool notifications |
| Sep 18 | `settlement_transfer_handoff` | Settlement handoff |
| Sep 19 | `create_refund_infrastructure` | Full refund system |

## Appendix B: Key RPC Functions

| Function | Description |
|----------|-------------|
| `assign_vendor_to_order` | Manually assign vendor to order |
| `auto_assign_vendor` | Auto-assign based on proximity |
| `calculate_settlement` | Create settlement ledger entry |
| `send_notification` | Send in-app notification |
| `search_products` | Full-text product search |
| `request_refund` | Create refund request |
| `process_refund` | Execute Paystack refund |
| `approve_refund` | Admin approve refund |
| `reject_refund` | Admin reject refund |
| `request_withdrawal` | Vendor withdrawal request |
| `approve_withdrawal` | Admin approve withdrawal |
| `reject_withdrawal` | Admin reject withdrawal |
| `enqueue_transfers` | Queue settlement transfers |
| `process_transfer_queue` | Execute queued transfers |
| `notify_riders_new_pool_order` | Notify riders of pool orders |

---

*This documentation was auto-generated and covers the complete ABUAD DELIVERY codebase as of September 2026.*













