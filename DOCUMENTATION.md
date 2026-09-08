# ABUAD DELIVERY — Comprehensive Project Documentation

> Auto-generated documentation covering the full architecture, database schema, payment system, API surface, and workflows of the **ABUAD DELIVERY / CampusRun** platform.

## Table of Contents

1. Project Overview
2. Technology Stack
3. Repository Layout
4. Frontend Architecture
5. Database Schema & Migrations
6. Supabase Edge Functions (Paystack)
7. Payment System Deep-Dive
8. Order Lifecycle & Workflows
9. Vendor & Product Management
10. Rider System & Earnings
11. Notifications
12. Discovery & Search
13. Refund System
14. Security Model (RLS)
15. Configuration
16. Validation Scripts
17. Environment Variables
18. Deployment & CI/CD
19. Quick Start

---

## 1. Project Overview

ABUAD DELIVERY (working codename **CampusRun**) is a full-stack food & goods delivery platform built on Vercel (static hosting) + Supabase (PostgreSQL + Edge Functions). It supports four primary user roles:

| Role | Description |
|------|-------------|
| Customer | Places orders, tracks delivery, pays via Paystack, receives refunds. |
| Vendor | Restaurants/shops that receive orders, update status, manage products. |
| Admin | Oversees platform, assigns vendors, manages riders, handles disputes. |
| Rider | Claims pooled orders, updates delivery status, earns 20% of delivery fee. |

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
| Hosting | Vercel (static) + Supabase Edge Functions |
| CI/CD | GitHub Actions (`.github/workflows/validate.yml`) |
| Validation | Node.js scripts (`scripts/validate_*.js`) |

---

## 3. Repository Layout

```
ABUAD DELIVERY/
├── index.html                      # Customer-facing landing page
├── netlify.toml                    # Redirect rules
├── _redirects                      # SPA fallback redirects
├── package.json                    # Project metadata
├── README.md                       # Original README
├── DOCUMENTATION.md                # This file
│
├── assets/
│   ├── html/
│   │   ├── index.html              # Customer app shell
│   │   └── admin.html              # Admin dashboard shell
│   ├── css/
│   │   ├── styles.css              # Customer styles
│   │   └── admin.css               # Admin dashboard styles
│   └── js/
│       ├── config.js               # Supabase + Paystack client config
│       ├── app.js                  # Customer app logic (~2695 lines)
│       └── admin.js                # Admin dashboard logic (~1981 lines)
│
├── supabase/
│   ├── BASELINE.md                 # Database baseline documentation
│   ├── migrations/                 # SQL schema migrations (chronological)
│   └── functions/
│       ├── paystack-initialize/
│       ├── paystack-webhook/
│       ├── paystack-transfer/
│       ├── paystack-transfer-recipient/
│       └── paystack-transfer-webhook/
│
├── scripts/                        # Validation & smoke tests

## 4. Frontend Architecture

### 4.1 `config.js` — Central Configuration

Defines the Supabase client and Paystack public key. All frontend modules import from this file.

```js
// Key exports:
const SUPABASE_URL = "...";
const SUPABASE_ANON_KEY = "...";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PAYSTACK_PUBLIC_KEY = "...";

// Constants
const DELIVERY_FEE_BASE = 200;      // ₦200 base
const DELIVERY_FEE_PER_KM = 50;     // ₦50 per additional km
const PLATFORM_COMMISSION = 0.15;   // 15%
const VAT_RATE = 0.075;             // 7.5%
const RIDER_EARNINGS_RATE = 0.20;   // 20% of delivery fee
const MIN_PAYOUT_THRESHOLD = 1000;  // ₦1,000
```

### 4.2 `app.js` — Customer-Facing Application (~2695 lines)

Organized into these major sections:

| Lines | Section | Description |
|-------|---------|-------------|
| 1–180 | Initialization | DOM ready, event listeners, role detection |
| 180–380 | Menu Loading | Fetches products from `products` table, renders menu grid |
| 380–450 | Cart Management | Add/remove items, quantity adjustment, localStorage persistence |
| 450–600 | Checkout Flow | Address input, delivery fee calculation, order placement |
| 600–760 | Paystack Integration | `paystack.checkout` call, callback handling |
| 750–870 | Order Tracking | Polls for order status, real-time subscription |
| 1000–1150 | Order History | Displays past orders with status badges |
| 1150–1340 | Vendor Dashboard | Order list, status update buttons (vendor view) |
| 1340–1887 | Map & Location | Geolocation, delivery address pinning |
| 1800–1900 | Payment History | Shows transaction records from `payments_ledger` |
| 1916–2130 | Pool Order Joining | Rider pool functionality |
| 2130–2400 | Profile Management | User profile updates |
| 2222–2280 | Search / Discovery | Search bar integration with `discovery` fields |

**Key functions:**
- `initApp()` — bootstraps the entire customer interface
- `loadMenu()` — renders product cards from DB
- `renderCart()` — updates cart UI with items and total
- `placeOrder()` — validates cart, creates order record, triggers Paystack
- `trackOrder(orderId)` — subscribes to real-time order updates
- `payWithPaystack(orderData)` — opens Paystack checkout modal

### 4.3 `admin.js` — Admin Dashboard (~1981 lines)

Organized into these major sections:

| Lines | Section | Description |
|-------|---------|-------------|
| 1–100 | Initialization | Admin auth check, sidebar navigation setup |
| 100–520 | Dashboard Stats | Order counts, revenue charts, daily stats |
| 520–760 | Vendor Management | List vendors, approve/reject, assign categories |
| 760–1200 | Order Management | View all orders, update statuses, assign riders |
| 1200–1600 | Rider Management | List riders, view earnings, manage payouts |
| 1600–1981 | System Settings | Config, notifications, audit logs |

**Key functions:**
- `loadDashboardStats()` — aggregates order/payment metrics
- `manageVendors()` — CRUD operations on vendors
- `manageOrders()` — status transitions, rider assignment
- `manageRiders()` — earnings overview, manual payout triggers
- `manageNotifications()` — broadcast system notifications

## 5. Database Schema & Migrations

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

**`20260909_create_payments_ledger.sql`** — Creates `payments_ledger` table (id, order_id, amount, reference, status, method, provider, processed_at). Includes insert trigger, RLS policies, indexes on order_id/reference/status.

**`20260910_create_settlement_ledger.sql`** — Creates `settlement_ledger` (id, order_id, vendor_id, gross_amount, commission, vendor_payout, rider_earnings, status, transfer_reference, settled_at). Includes `calculate_settlement()` RPC.

**`20260913_create_transfer_ledger.sql`** — Creates `transfer_ledger` (id, settlement_id, transfer_id, amount, status, error_message, initiated_at, completed_at, retry_count). Includes `create_transfer()` RPC, admin-only RLS.

**`20260918_settlement_transfer_handoff.sql`** — Creates `settlement_transfer_handoff` view (joins settlement, transfer, orders). Updates `calculate_settlement()` to create transfer_ledger entry.

### 5.5 Notifications

**`20260903_create_notifications.sql`** — Creates `notifications` table (id, user_id, title, message, type, read, data, created_at). Types: order_update/payment/refund/promotion/system/payout/pool_order. Includes `send_notification()` RPC, insert trigger, RLS, indexes.

### 5.6 Discovery & Search

**`20260904_add_discovery_fields.sql`** — Adds `search_vector` (tsvector) to products with trigger, `popularity_score` and `is_featured` to products/vendors. Creates `search_products()` RPC, `featured_products` and `featured_vendors` views.

### 5.7 Transfer Execution

**`20260914_create_transfer_execution.sql`** — Creates `transfer_execution_queue` table (id, settlement_id, vendor_id, amount, status, scheduled_at, attempt_count, last_error). Creates `enqueue_transfers()` and `process_transfer_queue()` RPCs.

### 5.8 Refund System

**`20260919_create_refund_infrastructure.sql`** — Creates `refunds` (id, order_id, amount, reason, status, processed_by), `refund_items`, `refund_audit` tables. Functions: `request_refund()`, `process_refund()`, `approve_refund()`, `reject_refund()`. Triggers: `refund_updated_at_trigger`, `log_refund_audit`.

### 5.9 Withdrawal Requests

**`20260905_create_withdrawal_requests.sql`** — Creates `withdrawal_requests` (id, vendor_id, amount, status, account_name, account_number, bank_code, narration). Functions: `request_withdrawal()`, `approve_withdrawal()`, `reject_withdrawal()`.

### 5.10 Rider Earnings Cutover

**`20260911_rider_80_20_earnings_cutover.sql`** — Updates model to fixed 80/20 split. Adds `rider_earnings_rate` to orders (default 0.20). Updates `calculate_settlement()`. Backfills orders. Creates `rider_earnings_summary` view.

### 5.11 Pool Order Notifications

**`20260917_notify_riders_new_pool_order.sql`** — Creates `notify_riders_new_pool_order()` function. Trigger on orders when status → 'confirmed' for pool-eligible orders. Notifies riders within 5km via `rider_hub.current_location`.

### 5.12 Pending Payment Cleanup

**`20260905_drop_obsolete_pending_payment.sql`** — Drops old `pending_payments` table (replaced by `payments_ledger`).

## 6. Supabase Edge Functions (Paystack)

All Edge Functions use Deno runtime with TypeScript. Five functions handle the complete Paystack integration.

### 6.1 `paystack-initialize`

**File:** `supabase/functions/paystack-initialize/index.ts`
**Endpoint:** `POST /functions/v1/paystack-initialize`

Initializes a Paystack Transaction (Checkout) for a customer order.

**Request:**
```json
{
  "order_id": 123,
  "amount": 5000,
  "email": "customer@example.com",
  "currency": "NGN",
  "callback_url": "https://campusrun.vercel.app/payment/callback"
}
```

**Flow:**
1. Validates order exists and belongs to calling user
2. Calculates final amount (subtotal + delivery_fee + tax)
3. Calls `POST https://api.paystack.co/transaction/initialize`
4. Updates `orders.checkout_url` with `data.authorization_url`
5. Returns `{ authorization_url, access_code, reference }`

### 6.2 `paystack-webhook`

**File:** `supabase/functions/paystack-webhook/index.ts`
**Endpoint:** `POST /functions/v1/paystack-webhook`

Handles Paystack webhook events. Verifies HMAC-SHA512 signature.

**Events:**
- `charge.success` → updates payments_ledger + orders + settlement_ledger
- `charge.failed` → marks payment failed
- `refund` → updates refund status
- `transfer` → updates settlement status

### 6.3 `paystack-transfer`

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

### 7.1 Payment Flow

```
Customer places order
  → Order created (status='pending', payment_status='pending')
  → Frontend calls paystack-initialize
  → Edge Function calls Paystack /transaction/initialize
  → Returns authorization_url
  → Customer redirected to Paystack checkout
  → Customer pays (card/transfer/bank)
  → Paystack calls /paystack-webhook
  → Webhook updates:
    1. payments_ledger.status = 'paid'
    2. orders.payment_status = 'paid'
    3. orders.status = 'confirmed'
  → calculate_settlement() creates settlement_ledger entry
  → Admin runs enqueue_transfers() → process_transfer_queue()
  → paystack-transfer calls Paystack /transfer
  → Paystack calls /paystack-transfer-webhook
  → Transfer marked success, settlement settled
```

### 7.2 Financial Tables

| Table | Purpose |
|-------|---------|
| `payments_ledger` | Records all incoming payments from customers |
| `settlement_ledger` | Calculates vendor payout (gross, commission, vendor_payout, rider_earnings) |
| `transfer_ledger` | Tracks individual Paystack transfer calls |
| `refunds` | Manages refund requests and processing |
| `withdrawal_requests` | Vendor-initiated payout requests |

### 7.3 Commission Model

- **Platform commission:** 15% of order subtotal
- **Delivery fee:** ₦200 base + ₦50/km (first 5km included)
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
5. **No deploy step in CI.** The static site is hosted on **Netlify** (`netlify.toml` + `_redirects`); Supabase migrations and Edge Functions are deployed manually with the Supabase CLI (below).

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

## 19. Quick Start

```bash
# Clone
git clone https://github.com/fopzyy23/ABUAD-Delivery-CampusRun.git
cd ABUAD-DELIVERY

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













