$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Add()
$sel = $word.Selection
$sel.Font.Name = "Calibri"
$sel.Font.Size = 20
$sel.Font.Bold = 1
$sel.TypeText("DROPZYY / ABUAD DELIVERY -- Complete Project Documentation")
$sel.TypeParagraph()
$sel.Font.Bold = 0
$sel.Font.Size = 12
$sel.TypeText("Comprehensive project documentation and technical reference -- September 2026")
$sel.TypeParagraph()
$sel.TypeParagraph()

function Heading1($t) { $sel.Font.Bold = 1; $sel.Font.Size = 16; $sel.TypeText($t); $sel.Font.Bold = 0; $sel.Font.Size = 12; $sel.TypeParagraph(); $sel.TypeParagraph() }
function Heading2($t) { $sel.Font.Bold = 1; $sel.Font.Size = 14; $sel.TypeText($t); $sel.Font.Bold = 0; $sel.Font.Size = 12; $sel.TypeParagraph(); }
function Para($t) { $sel.TypeText($t); $sel.TypeParagraph() }
function Bullet($t) { $sel.TypeText([char]0x2022 + " " + $t); $sel.TypeParagraph() }
function CodeBlock($t) { $sel.Font.Name = "Consolas"; $sel.Font.Size = 9; $sel.TypeText($t); $sel.Font.Name = "Calibri"; $sel.Font.Size = 12; $sel.TypeParagraph(); $sel.TypeParagraph() }
# ===== Section 1: Executive Summary =====
Heading1 "1. Executive Summary"
Para "Dropzyy is a university-focused delivery and student-services platform originally developed as ABUAD Delivery / CampusRun."
Para "It evolved into a web application using HTML, CSS and JavaScript on the frontend, Supabase for authentication/database/security, Vercel for hosting, and Paystack for payment and payout infrastructure."
Para "The project has progressively moved from frontend-driven behavior toward a server-authoritative architecture."
Para "Orders, payments, notifications, settlements and transfers are backed by protected database structures and server-side functions."

# ===== Section 2: Project Overview =====
Heading1 "2. Project Overview"
Para "ABUAD DELIVERY (working codename CampusRun) is a full-stack food & goods delivery platform. It supports four primary user roles:"
Bullet "Customer  -- Places orders, tracks delivery, pays via Paystack, receives refunds."
Bullet "Vendor    -- Restaurants/shops that receive orders, update status, manage products."
Bullet "Admin     -- Oversees platform, assigns vendors, manages riders, handles disputes."
Bullet "Rider     -- Claims pooled orders, updates delivery status, earns 20% of delivery fee."
Para "Key features:"
Bullet "Paystack checkout (card/transfer) for customer payments"
Bullet "Automated payouts to vendors via Paystack Transfer API"
Bullet "80/20 rider earnings model (rider gets 20% of delivery fee)"
Bullet "Real-time order status tracking"
Bullet "Notification system (in-app + push)"
Bullet "Refund infrastructure with ledger tracking"
Bullet "Vendor withdrawal requests"
Bullet "Full-text search & featured listings"

# ===== Section 3: Technology Stack =====
Heading1 "3. Technology Stack"
Bullet "Frontend:        HTML5, CSS3, vanilla JavaScript (ES6+)"
Bullet "Backend / DB:    Supabase (PostgreSQL 15+)"
Bullet "Payments:        Paystack API (Checkout, Transfer, Transfer Recipient, Refund)"
Bullet "Hosting:         Vercel (static) + Supabase Edge Functions"
Bullet "CI/CD:           GitHub Actions (.github/workflows/validate.yml)"
Bullet "Validation:      Node.js scripts (scripts/validate_*.js)"
# ===== Section 4: Repository Layout =====
Heading1 "4. Repository Layout"
CodeBlock @"
ABUAD DELIVERY/
|-- index.html
|-- netlify.toml
|-- _redirects
|-- package.json
|-- README.md
|-- DOCUMENTATION.md
|-- assets/
|   |-- html/
|   |   |-- index.html
|   |   +-- admin.html
|   |-- css/
|   |   |-- styles.css
|   |   +-- admin.css
|   +-- js/
|       |-- config.js
|       |-- app.js          (approx 2695 lines)
|       +-- admin.js         (approx 1981 lines)
|-- supabase/
|   |-- BASELINE.md
|   |-- migrations/          (26 migrations)
|   +-- functions/
|       |-- paystack-initialize/
|       |-- paystack-webhook/
|       |-- paystack-transfer/
|       |-- paystack-transfer-recipient/
|       +-- paystack-transfer-webhook/
|-- scripts/
|   |-- validate_all.js
|   |-- validate_b1_b2.js
|   |-- validate_b3.js
|   +-- ... (18 total)
+-- .github/
    +-- workflows/
        +-- validate.yml
"@
# ===== Section 5: Frontend Architecture =====
Heading1 "5. Frontend Architecture"
Heading2 "5.1 config.js -- Central Configuration"
Para "Defines the Supabase client and Paystack public key. All frontend modules import from this file."
CodeBlock @"
// Constants
const SUPABASE_URL = "...";
const SUPABASE_ANON_KEY = "...";
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const PAYSTACK_PUBLIC_KEY = "...";
const DELIVERY_FEE_BASE = 200;
const DELIVERY_FEE_PER_KM = 50;
const PLATFORM_COMMISSION = 0.15;
const VAT_RATE = 0.075;
const RIDER_EARNINGS_RATE = 0.20;
const MIN_PAYOUT_THRESHOLD = 1000;
"@
Heading2 "5.2 app.js -- Customer Application (approx 2695 lines)"
Para "Major sections:"
Bullet "Lines 1-180: Initialization, DOM setup, event listeners, role detection"
Bullet "Lines 180-380: Menu Loading -- fetches products, renders menu grid"
Bullet "Lines 380-450: Cart Management -- add/remove items, quantity, localStorage"
Bullet "Lines 450-600: Checkout Flow -- address input, fee calculation, order placement"
Bullet "Lines 600-760: Paystack Integration -- checkout call, callback handling"
Bullet "Lines 750-870: Order Tracking -- real-time status subscription"
Bullet "Lines 1000-1150: Order History -- past orders with status badges"
Bullet "Lines 1150-1340: Vendor Dashboard -- order list, status updates"
Bullet "Lines 1340-1887: Map & Location -- geolocation, address pinning"
Bullet "Lines 1800-1900: Payment History -- transaction records from payments_ledger"
Bullet "Lines 1916-2130: Pool Order Joining -- rider pool functionality"
Bullet "Lines 2130-2400: Profile Management -- user profile updates"
Bullet "Lines 2222-2280: Search/Discovery -- search bar integration"
Para "Key functions: initApp(), loadMenu(), renderCart(), placeOrder(), trackOrder(orderId), payWithPaystack(orderData)"

Heading2 "5.3 admin.js -- Admin Dashboard (approx 1981 lines)"
Para "Major sections:"
Bullet "Lines 1-100: Initialization, admin auth check, sidebar navigation"
Bullet "Lines 100-520: Dashboard Stats -- order counts, revenue charts"
Bullet "Lines 520-760: Vendor Management -- list, approve/reject, categories"
Bullet "Lines 760-1200: Order Management -- view orders, update statuses, assign riders"
Bullet "Lines 1200-1600: Rider Management -- list riders, earnings, payouts"
Bullet "Lines 1600-1981: System Settings -- config, notifications, audit logs"
Para "Key functions: loadDashboardStats(), manageVendors(), manageOrders(), manageRiders(), manageNotifications()"
# ===== Section 6: Database Schema & Migrations =====
Heading1 "6. Database Schema & Migrations"
Para "26 migrations applied chronologically from Aug 14 to Sep 19, 2026."
Para "Core tables: profiles, vendors, products, categories, orders, order_items, riders, payments_ledger, settlement_ledger, transfer_ledger, refunds, notifications, withdrawal_requests, rider_hub."

Heading2 "6.1 Foundation & Security Migrations"
Bullet "20260815_fix_rls_security.sql -- Creates core tables and defines RLS policies for all tables."
Bullet "20260821_fix_orders_rls_recursion.sql -- Fixes infinite recursion in orders RLS using current_setting("app.role")."
Bullet "20260819_restore_rider_hub.sql -- Re-adds rider_hub table for availability, location, pool orders."
Heading2 "6.2 Vendor Workflow Migrations"
Bullet "20260818_add_vendor_order_workflow.sql -- Adds vendor_status to orders, vendor_notes, vendor_order_items view."
Bullet "20260820_add_vendor_dashboard_workflow.sql -- Adds delivery_method, vendor_daily_stats view, estimated_prep_time."
Bullet "20260822_admin_vendor_assignment_rpc.sql -- Creates assign_vendor_to_order() and auto_assign_vendor() RPCs."
Bullet "20260814_add_delivery_method_to_vendors.sql -- Adds delivery_method enum (delivery/pickup/both)."
Heading2 "6.3 Order & Payment Field Migrations"
Bullet "20260901_add_on_the_way_status.sql -- Adds "on_the_way" to order status enum."
Bullet "20260902_add_order_payment_fields.sql -- Adds payment_status, payment_reference, payment_method, subtotal, tax_amount."
Bullet "20260907_lock_order_payment_columns.sql -- Trigger prevents payment column updates except by app.role="system"."
Bullet "20260906_secure_order_pricing.sql -- secure_pricing trigger recalculates total from order_items."
Bullet "20260908_order_identifier_uniqueness.sql -- Adds unique constraint on order_number."
Bullet "20260912_add_payment_checkout_fields.sql -- Adds checkout_url, checkout_access_code, payment_initiated_at."
Bullet "20260916_require_paid_orders_for_rider_claim.sql -- Trigger ensures only paid orders can be claimed by riders."
Heading2 "6.4 Ledger & Financial Migrations"
Bullet "20260909_create_payments_ledger.sql -- Creates payments_ledger, ledger_id sequence, payment_number."
Bullet "20260910_create_settlement_ledger.sql -- Creates settlement_ledger, calculate_settlement() RPC."
Bullet "20260913_create_transfer_ledger.sql -- Creates transfer_ledger for individual transfer tracking."
Bullet "20260915_drop_obsolete_pending_payment.sql -- Drops old pending_payments table."
Bullet "20260918_settlement_transfer_handoff.sql -- Adds settlement status tracking for transfer handoff."
Heading2 "6.5 Notification & Discovery Migrations"
Bullet "20260903_create_notifications.sql -- Creates notifications table (id, user_id, title, message, type, read, data, created_at). Includes send_notification() RPC."
Bullet "20260904_add_discovery_fields.sql -- Adds search_vector to products, popularity_score, is_featured. Creates search_products() RPC, featured_products/featured_vendors views."
Heading2 "6.6 Transfer Execution & Refund Migrations"
Bullet "20260914_create_transfer_execution.sql -- Creates transfer_execution_queue, enqueue_transfers() and process_transfer_queue() RPCs."
Bullet "20260919_create_refund_infrastructure.sql -- Creates refunds, refund_items, refund_audit tables. Functions: request_refund(), process_refund(), approve_refund(), reject_refund()."
Bullet "20260905_create_withdrawal_requests.sql -- Creates withdrawal_requests for vendor payouts. Functions: request_withdrawal(), approve_withdrawal(), reject_withdrawal()."
Heading2 "6.7 Specialized Migrations"
Bullet "20260911_rider_80_20_earnings_cutover.sql -- Fixed 80/20 split. Adds rider_earnings_rate=0.20 to orders. Creates rider_earnings_summary view."
Bullet "20260917_notify_riders_new_pool_order.sql -- notify_riders_new_pool_order() triggers on orders status "confirmed". Notifies riders within 5km."
Bullet "20260905_drop_obsolete_pending_payment.sql -- Drops old pending_payments table (replaced by payments_ledger)."
# ===== Section 7: Supabase Edge Functions =====
Heading1 "7. Supabase Edge Functions (Paystack)"
Para "All Edge Functions use Deno runtime with TypeScript. Five functions handle the complete Paystack integration."
Heading2 "7.1 paystack-initialize"
Para "File: supabase/functions/paystack-initialize/index.ts"
Para "Endpoint: POST /functions/v1/paystack-initialize"
Para "Initializes a Paystack Transaction (Checkout) for a customer order."
Para "Request: { order_id, amount, email, currency, callback_url }"
Para "Flow: Validates order, calculates amount, calls Paystack /transaction/initialize, updates orders.checkout_url, returns { authorization_url, access_code, reference }"
Heading2 "7.2 paystack-webhook"
Para "File: supabase/functions/paystack-webhook/index.ts"
Para "Endpoint: POST /functions/v1/paystack-webhook"
Para "Handles Paystack webhook events. Verifies HMAC-SHA512 signature."
Para "Events: charge.success (updates payments_ledger + orders + settlement_ledger), charge.failed, refund, transfer."
Para "Flow: Verify signature, parse payload, look up payments_ledger by reference, update payment status, trigger calculate_settlement(), notify riders."
Heading2 "7.3 paystack-transfer"
Para "File: supabase/functions/paystack-transfer/index.ts"
Para "Endpoint: POST /functions/v1/paystack-transfer"
Para "Initiates Paystack Transfer (payout) to vendor bank account."
Para "Request: { settlement_id, amount, recipient_code, reason }"
Para "Flow: Validate settlement, verify recipient, check balance, call Paystack /transfer, update transfer_ledger + settlement_ledger."
Heading2 "7.4 paystack-transfer-recipient"
Para "File: supabase/functions/paystack-transfer-recipient/index.ts"
Para "Endpoint: POST /functions/v1/paystack-transfer-recipient"
Para "Creates/updates Paystack Transfer Recipient for vendor bank accounts."
Para "Request: { vendor_id, account_number, account_name, bank_code, bank_name }"
Para "Flow: Validate vendor, check existing recipient, call Paystack /transferrecipient (create or update), save recipient_code."
Heading2 "7.5 paystack-transfer-webhook"
Para "File: supabase/functions/paystack-transfer-webhook/index.ts"
Para "Endpoint: POST /functions/v1/paystack-transfer-webhook"
Para "Handles Paystack Transfer webhook events. Verifies HMAC signature."
Para "Events: transfer.success (marks transfer complete, settlement settled, order updated), transfer.failed (schedules retry), transfer.reversed."
# ===== Section 8: Payment System =====
Heading1 "8. Payment System Deep-Dive"
Heading2 "8.1 Payment Flow"
CodeBlock @"
Customer places order
  -> Order created (status="pending", payment_status="pending")
  -> Frontend calls paystack-initialize
  -> Edge Function calls Paystack /transaction/initialize
  -> Returns authorization_url
  -> Customer redirected to Paystack checkout
  -> Customer pays (card/transfer/bank)
  -> Paystack calls /paystack-webhook
  -> Webhook updates:
     1. payments_ledger.status = "paid"
     2. orders.payment_status = "paid"
     3. orders.status = "confirmed"
  -> calculate_settlement() creates settlement_ledger
  -> Admin runs enqueue_transfers() -> process_transfer_queue()
  -> paystack-transfer calls Paystack /transfer
  -> Paystack calls /paystack-transfer-webhook
  -> Transfer marked success, settlement settled
"@
Heading2 "8.2 Financial Tables"
Bullet "payments_ledger -- Records all incoming payments from customers"
Bullet "settlement_ledger -- Calculates vendor payout (gross, commission, vendor_payout, rider_earnings)"
Bullet "transfer_ledger -- Tracks individual Paystack transfer calls"
Bullet "refunds -- Manages refund requests and processing"
Bullet "withdrawal_requests -- Vendor-initiated payout requests"
Heading2 "8.3 Commission Model"
Bullet "Platform commission: 15% of order subtotal"
Bullet "Delivery fee: N200 base + N50/km (first 5km included)"
Bullet "Rider earnings: 20% of delivery fee (80/20 split)"
Bullet "VAT: 7.5% on subtotal + delivery fee"
Bullet "Minimum payout threshold: N1,000"
Heading2 "8.4 Payout Schedule"
Para "Settlements calculated immediately on payment confirmation. Transfers queued daily or manually from admin dashboard. Processed via enqueue_transfers() -> process_transfer_queue() -> paystack-transfer Edge Function."
# ===== Section 9: Order Lifecycle =====
Heading1 "9. Order Lifecycle & Workflows"
Heading2 "9.1 Order Status Values"
CodeBlock @"
pending -> confirmed -> preparing -> ready -> on_the_way -> completed
    \-----------> cancelled
    \-----------> refunded
"@
Bullet "pending -- Order created, awaiting payment (System)"
Bullet "confirmed -- Payment verified (Webhook)"
Bullet "preparing -- Vendor accepted, cooking (Vendor)"
Bullet "ready -- Ready for pickup/delivery (Vendor)"
Bullet "on_the_way -- Rider picked up, en route (Rider)"
Bullet "completed -- Delivered to customer (Rider)"
Bullet "cancelled -- Cancelled before prep (Customer/Vendor/Admin)"
Bullet "refunded -- Fully/partially refunded (System/Admin)"
Heading2 "9.2 Transition Rules"
Bullet "pending -> confirmed: Paystack webhook (charge.success)"
Bullet "pending -> cancelled: Customer (before vendor acceptance)"
Bullet "confirmed -> preparing: Vendor"
Bullet "preparing -> ready: Vendor"
Bullet "ready -> on_the_way: Rider (claim)"
Bullet "on_the_way -> completed: Rider (deliver)"
Bullet "any -> cancelled: Admin"
Bullet "any -> refunded: Admin (via refund process)"
Para "Transition gate: Status -> on_the_way/completed requires payment_status = "paid" (enforced by trigger from 20260916)."
Heading2 "9.3 Pool Orders"
Bullet "Orders with status="confirmed" are checked for proximity pooling"
Bullet "Eligible orders within 5km radius are pooled together"
Bullet "notify_riders_new_pool_order() triggers on confirmation (migration 20260917)"
Bullet "Rider claims pool -> all pooled orders transition to on_the_way"
# ===== Section 10: Vendor Management =====
Heading1 "10. Vendor & Product Management"
Heading2 "10.1 Vendor Attributes"
Bullet "id (int) -- Primary key"
Bullet "name (varchar) -- Business name"
Bullet "phone (varchar) -- Contact phone"
Bullet "address (text) -- Physical address"
Bullet "lat/lng (decimal) -- Location coordinates"
Bullet "approved (boolean) -- Admin approval required"
Bullet "delivery_method -- enum: delivery/pickup/both"
Bullet "is_featured (boolean) -- Featured listing"
Bullet "category (varchar) -- Restaurant type"
Bullet "operating_hours (jsonb) -- Open/close times"
Bullet "estimated_prep_time (int) -- Prep time in minutes"
Heading2 "10.2 Product Attributes"
Bullet "id (int), vendor_id (int FK), name, description, price (numeric)"
Bullet "category_id (int FK), image_url, available (boolean)"
Bullet "is_featured (boolean), popularity_score (int), search_vector (tsvector)"
Heading2 "10.3 Vendor Dashboard Features"
Para "Via admin.js and app.js vendor views:"
Bullet "Order list with status filtering (today, this week, all)"
Bullet "One-click status updates (accept, preparing, ready)"
Bullet "Order item details modal"
Bullet "Daily revenue summary"
Bullet "Customer contact info"
Bullet "Cancellation history"

# ===== Section 11: Rider System =====
Heading1 "11. Rider System & Earnings"
Heading2 "11.1 Rider Profile"
Bullet "id (int PK), profile_id (uuid FK), available (boolean)"
Bullet "current_lat/lng (decimal) -- Real-time location"
Bullet "rating (decimal(3,2)) -- Customer rating average"
Bullet "earnings_total (numeric) -- Lifetime earnings"
Bullet "earnings_pending (numeric) -- Unpaid earnings"
Heading2 "11.2 Rider Earnings Calculation"
CodeBlock "rider_earnings = delivery_fee * 0.20"
Para "Monthly summary via rider_earnings_summary view:"
CodeBlock @"
SELECT r.id, p.name, COUNT(o.id) as orders_completed,
       SUM(o.delivery_fee * 0.20) as earnings
FROM riders r JOIN profiles p ON r.profile_id = p.id
JOIN orders o ON o.rider_id = r.id
WHERE o.status = "completed"
  AND o.completed_at >= DATE_TRUNC("month", NOW())
GROUP BY r.id, p.name
"@
Heading2 "11.3 Rider Claim Conditions"
Para "From 20260916_require_paid_orders_for_rider_claim.sql:"
Bullet "Order must have payment_status = "paid""
Bullet "Order must have status IN ("ready", "confirmed")"
Bullet "Rider must be available = true"
# ===== Section 12: Notifications =====
Heading1 "12. Notifications"
Heading2 "12.1 Notification Types"
Bullet "order_update -- Order status changed (Customer)"
Bullet "payment -- Payment confirmed/failed (Customer)"
Bullet "refund -- Refund processed (Customer)"
Bullet "promotion -- Special offers (All users)"
Bullet "system -- Platform announcements (All users)"
Bullet "payout -- Vendor payout processed (Vendor)"
Bullet "pool_order -- New pool order available (Rider)"
Heading2 "12.2 Notification Data Structure"
CodeBlock "{"id":"uuid","user_id":"uuid","title":"Order Confirmed","message":"Your order has been confirmed","type":"order_update","read":false,"data":{"order_id":123,"new_status":"confirmed"},"created_at":"2026-04-01T12:00:00Z"}"
Heading2 "12.3 Real-time Delivery"
Para "In app.js:"
Bullet "Uses supabase Realtime subscription on notifications table"
Bullet "Fetches every 30 seconds or via channel subscription"
Bullet "addNotificationToUI(payload.new) adds to UI dynamically"

# ===== Section 13: Discovery & Search =====
Heading1 "13. Discovery & Search"
Para "Products have search_vector tsvector updated via trigger on name, description, category."
Para "search_products(query TEXT) RPC returns products by relevance + popularity_score."
Para "Featured listings via featured_products and featured_vendors views."
Para "popularity_score incremented by background job counting orders."

# ===== Section 14: Refund System =====
Heading1 "14. Refund System"
Heading2 "14.1 Refund Flow"
CodeBlock @"
Customer requests refund
  -> request_refund() creates refund (status="pending")
  -> Admin reviews and approves
  -> process_refund() calls Paystack /refund API
  -> Paystack processes refund
  -> Webhook updates refund.status = "processed"
  -> payments_ledger + orders updated to "refunded"
"@
Heading2 "14.2 Refund Conditions"
Bullet "Only orders with payment_status = "paid" are eligible"
Bullet "Partial refunds via refund_items table"
Bullet "Full refund reverses entire transaction"
Heading2 "14.3 Refund Tables"
Bullet "refunds -- (id, order_id, amount, reason, status, processed_by, created_at, updated_at)"
Bullet "refund_items -- (id, refund_id, order_item_id, quantity, unit_price)"
Bullet "refund_audit -- (id, refund_id, action, performed_by, notes, created_at)"
# ===== Section 15: Security Model =====
Heading1 "15. Security Model (RLS)"
Heading2 "15.1 Role-Based Access"
Bullet "customer -- Place orders, view own data, request refunds"
Bullet "vendor -- View own orders, update status, manage products"
Bullet "admin -- Full access to all tables"
Bullet "rider -- View assigned orders, update delivery status"
Heading2 "15.2 Sensitive Column Protection"
Bullet "Payment columns only writable by app.role = "system""
Bullet "Trigger raises exception on unauthorized updates"
Bullet "verify_rls_readonly.js validates unauthenticated connections cannot write"

# ===== Section 16: Configuration =====
Heading1 "16. Configuration"
Heading2 "16.1 config.js Constants"
Bullet "DELIVERY_FEE_BASE -- 200 (base delivery fee in Naira)"
Bullet "DELIVERY_FEE_PER_KM -- 50 (per-km rate in Naira)"
Bullet "PLATFORM_COMMISSION -- 0.15 (15% commission rate)"
Bullet "VAT_RATE -- 0.075 (7.5% VAT)"
Bullet "RIDER_EARNINGS_RATE -- 0.20 (20% of delivery fee to rider)"
Bullet "MIN_PAYOUT_THRESHOLD -- 1000 (minimum payout in Naira)"
Heading2 "16.2 platform_config Table"
Para "Key-value store for runtime configuration. Overrides config.js constants when present."

# ===== Section 17: Validation Scripts =====
Heading1 "17. Validation Scripts"
Para "All scripts use Node.js with Supabase client. Run via node scripts/validate_all.js"
Bullet "validate_b1_b2.js -- Auth & user profile setup"
Bullet "validate_b3.js -- Vendor registration & approval"
Bullet "validate_b4a.js -- Product CRUD"
Bullet "validate_b4b.js -- Category management"
Bullet "validate_b6.js -- Order placement"
Bullet "validate_b7.js -- Order status transitions"
Bullet "validate_action10.js -- Payment initialization"
Bullet "validate_action11_live.js -- Live Paystack checkout"
Bullet "validate_action12.js -- Settlement calculation"
Bullet "validate_action12_live.js -- Live settlement"
Bullet "validate_paystack_checkout.js -- Full checkout flow"
Bullet "validate_refund.js -- Refund flow"
Bullet "validate_vendor_migration.js -- Vendor workflow migration"
Bullet "validate_notifications.js -- Notification system"
Bullet "validate_discovery_migration.js -- Search & featured"
Bullet "verify_rls_readonly.js -- RLS write protection"
# ===== Section 18: Environment Variables =====
Heading1 "18. Environment Variables"
Heading2 "18.1 Frontend (config.js)"
Bullet "SUPABASE_URL -- Supabase project URL"
Bullet "SUPABASE_ANON_KEY -- Anonymous API key"
Bullet "PAYSTACK_PUBLIC_KEY -- Paystack public key"
Heading2 "18.2 Edge Functions"
Bullet "PAYSTACK_SECRET_KEY -- API secret for server calls"
Bullet "PAYSTACK_WEBHOOK_SECRET -- HMAC secret for webhook verification"
Bullet "SUPABASE_URL -- Supabase project URL"
Bullet "SUPABASE_SERVICE_ROLE_KEY -- Service role for admin DB access"

# ===== Section 19: Deployment & Quick Start =====
Heading1 "19. Deployment & Quick Start"
Heading2 "19.1 GitHub Actions CI/CD"
Bullet "Triggers on push to main and PRs"
Bullet "Sets up Node.js 18"
Bullet "Installs dependencies"
Bullet "Runs validation scripts"
Bullet "Posts status to PR"
Bullet "Deploys to Vercel on successful merge"
Heading2 "19.2 Supabase Deployment"
CodeBlock @"
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy paystack-initialize
supabase functions deploy paystack-webhook
supabase functions deploy paystack-transfer
supabase functions deploy paystack-transfer-recipient
supabase functions deploy paystack-transfer-webhook
supabase secrets set PAYSTACK_SECRET_KEY=sk_... PAYSTACK_WEBHOOK_SECRET=whsec_...
"@
Heading2 "19.3 Quick Start"
CodeBlock @"
git clone https://github.com/fopzyy23/ABUAD-Delivery-CampusRun.git
cd ABUAD-DELIVERY
npm install
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy paystack-initialize
supabase functions deploy paystack-webhook
supabase functions deploy paystack-transfer
supabase functions deploy paystack-transfer-recipient
supabase functions deploy paystack-transfer-webhook
supabase secrets set PAYSTACK_SECRET_KEY=sk_... PAYSTACK_WEBHOOK_SECRET=whsec_... SUPABASE_SERVICE_ROLE_KEY=...
node scripts/validate_all.js
npx serve .
"@
# ===== Appendix A: Migration Timeline =====
Heading1 "Appendix A: Migration Timeline (Chronological)"
Para "Aug 14 -- add_delivery_method_to_vendors -- Vendor delivery method enum"
Para "Aug 15 -- fix_rls_security -- Core tables + RLS policies"
Para "Aug 18 -- add_vendor_order_workflow -- Vendor status workflow"
Para "Aug 19 -- restore_rider_hub -- Rider hub table"
Para "Aug 20 -- add_vendor_dashboard_workflow -- Vendor stats, prep time"
Para "Aug 21 -- fix_orders_rls_recursion -- Orders RLS fix"
Para "Aug 22 -- admin_vendor_assignment_rpc -- Vendor assignment RPCs"
Para "Sep 01 -- add_on_the_way_status -- New order status"
Para "Sep 02 -- add_order_payment_fields -- Payment fields"
Para "Sep 03 -- create_notifications -- Notification system"
Para "Sep 04 -- add_discovery_fields -- Search & featured"
Para "Sep 05 -- create_withdrawal_requests -- Vendor withdrawals"
Para "Sep 05 -- drop_obsolete_pending_payment -- Cleanup old table"
Para "Sep 06 -- secure_order_pricing -- Price tamper prevention"
Para "Sep 07 -- lock_order_payment_columns -- Payment column locking"
Para "Sep 08 -- order_identifier_uniqueness -- Unique order numbers"
Para "Sep 09 -- create_payments_ledger -- Payment ledger"
Para "Sep 10 -- create_settlement_ledger -- Settlement calculations"
Para "Sep 11 -- rider_80_20_earnings_cutover -- Rider earnings"
Para "Sep 12 -- add_payment_checkout_fields -- Checkout URL"
Para "Sep 13 -- create_transfer_ledger -- Transfer tracking"
Para "Sep 14 -- create_transfer_execution -- Transfer queue"
Para "Sep 16 -- require_paid_orders_for_rider_claim -- Payment gate for riders"
Para "Sep 17 -- notify_riders_new_pool_order -- Pool notifications"
Para "Sep 18 -- settlement_transfer_handoff -- Settlement handoff"
Para "Sep 19 -- create_refund_infrastructure -- Full refund system"

# ===== Appendix B: Key RPC Functions =====
Heading1 "Appendix B: Key RPC Functions"
Bullet "assign_vendor_to_order -- Manually assign vendor to order"
Bullet "auto_assign_vendor -- Auto-assign based on proximity"
Bullet "calculate_settlement -- Create settlement ledger entry"
Bullet "send_notification -- Send in-app notification"
Bullet "search_products -- Full-text product search"
Bullet "request_refund -- Create refund request"
Bullet "process_refund -- Execute Paystack refund"
Bullet "approve_refund -- Admin approve refund"
Bullet "reject_refund -- Admin reject refund"
Bullet "request_withdrawal -- Vendor withdrawal request"
Bullet "approve_withdrawal -- Admin approve withdrawal"
Bullet "reject_withdrawal -- Admin reject withdrawal"
Bullet "enqueue_transfers -- Queue settlement transfers"
Bullet "process_transfer_queue -- Execute queued transfers"
Bullet "notify_riders_new_pool_order -- Notify riders of pool orders"

$sel.TypeParagraph()
$sel.TypeText("---")
$sel.TypeParagraph()
$sel.TypeText("This documentation was auto-generated and covers the complete ABUAD DELIVERY codebase as of September 2026.")
$sel.TypeParagraph()

# ===== Save & Close =====
$outputPath = Join-Path $PSScriptRoot "..\Dropzyy_Complete_Documentation.docx"
$outputPath = [System.IO.Path]::GetFullPath($outputPath)
$doc.SaveAs([ref]$outputPath, [ref]16)
$doc.Close()
$word.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
Write-Host "DOCX saved to: $outputPath"
