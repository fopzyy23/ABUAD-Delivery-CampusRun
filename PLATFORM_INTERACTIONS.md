# Dropzyy Platform - Complete Interaction Map

## Overview
This document maps every user interaction on the Dropzyy campus delivery platform, organized by role. Each interaction lists the action, required tool call, preconditions, and expected result.

---

## 🛒 CUSTOMER INTERACTIONS

### Account & Authentication
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Create account | N/A (auth service) | Valid email, phone, campus | Account created, user_id assigned |
| Login | N/A (auth service) | Registered credentials | JWT token issued, role=customer |

### Product Discovery
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Search products | `search_products(query)` | Query string (name, category, vendor) | List of matching products with price, vendor, availability |
| Browse by category | `search_products(category: "food")` | Category filter | Filtered product list |
| View product details | `search_products(product_id)` | Specific product ID | Single product with description, images, vendor info |

### Ordering
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Place order | N/A (order service) | Cart with items, delivery address, payment method | Order created (status=pending), payment initiated |
| Pay via Paystack | N/A (payment service) | Order in pending, valid Paystack token | Payment confirmed, order status → confirmed |
| View order history | `get_customer_orders(user_id)` | Authenticated customer | List of all orders with status, timestamps, totals |
| Track order status | `get_order_status(order_id)` | Order belongs to customer | Real-time status: pending → confirmed → accepted → preparing → ready → assigned → picked_up → delivered |
| View payment status | `get_payment_status(order_id)` | Order belongs to customer | Payment state: pending/paid/failed/refunded + transaction ref |

### Post-Delivery
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Contact rider | N/A (chat service) | Order status ∈ {confirmed, accepted, preparing, ready, assigned, picked_up} | In-app chat/phone link to assigned rider |
| Request refund | `request_refund(order_id, reason)` | Order paid, valid reason (wrong item, late, quality) | Refund request created (status=pending_admin_review) |
| View refund status | N/A (refund service) | Refund requested by customer | Track refund: pending → approved/rejected → processed |

---

## 🏪 VENDOR INTERACTIONS

### Vendor Onboarding
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Apply as vendor | N/A (vendor service) | Business docs, campus location, menu | Application submitted (status=pending_admin_approval) |
| Check application status | N/A | Applied vendor | Status: pending/approved/rejected + rejection reason |

### Product Management
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| View own products | `get_vendor_products(vendor_id)` | Approved vendor | List of products with stock, price, categories |
| Add product | N/A (product service) | Approved vendor | Product created, visible to customers |
| Edit product | N/A | Own product | Updated price, description, availability |
| Delete product | N/A | Own product | Product hidden from customers |
| Manage categories | N/A | Approved vendor | Create/edit/delete categories for organization |

### Order Management
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| View incoming orders | `get_vendor_orders(vendor_id, status_filter)` | Approved vendor | Orders filtered by status: pending/accepted/preparing/ready |
| Accept order | `update_order_status(order_id, "accepted")` | Order status=pending, vendor owns store | Status → accepted, customer notified |
| Start preparing | `update_order_status(order_id, "preparing")` | Order status=accepted | Status → preparing, ETA estimate set |
| Mark ready | `update_order_status(order_id, "ready")` | Order status=preparing | Status → ready, enters rider pool (if delivery) |
| Choose delivery method | N/A (order service) | Per order at acceptance | Set pickup / delivery / both for this order |
| View customer contact | N/A (order service) | Order status ∈ {accepted, preparing, ready} | Customer name, phone, delivery notes |

### Earnings & Withdrawals
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| View earnings dashboard | N/A (settlement service) | Approved vendor | Total sales, platform fee, net earnings, pending settlements |
| Request withdrawal | `request_withdrawal(vendor_id, amount, bank_details)` | Available balance ≥ amount, valid bank info | Withdrawal request created (status=pending_admin_approval) |
| View withdrawal history | N/A | Vendor | Past withdrawals: amount, status, processed date |

---

## 🚴 RIDER INTERACTIONS

### Availability & Pool
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Toggle availability | N/A (rider service) | Approved rider | Available/unavailable status updated in real-time |
| View available deliveries | `get_available_pool_orders(rider_id, radius_km)` | Rider available, within campus radius | Orders with status=ready, pickup location, dropoff, estimated earnings |
| Filter pool | `get_available_pool_orders(rider_id, radius_km)` | Rider available | Adjust radius_km to see nearer/farther orders |

### Delivery Execution
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Claim order | `claim_order(order_id, rider_id)` | Order in pool, rider available | Order assigned to rider (status=assigned), removed from pool |
| Decline order | N/A | Order claimed by rider | Order returns to pool, rider stays available |
| Start pickup | `update_delivery_status(order_id, "picked_up")` | Order status=assigned, rider at vendor | Status → picked_up, vendor & customer notified |
| Start delivery | `update_delivery_status(order_id, "in_transit")` | Order status=picked_up | Status → in_transit, live tracking starts |
| Complete delivery | `update_delivery_status(order_id, "delivered")` | Order status=in_transit, at dropoff | Status → delivered, proof of delivery captured, earnings credited |
| Report issue | N/A | During delivery | Issue logged (customer unavailable, address wrong, etc.) |

### Earnings
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| View earnings | `get_rider_earnings(rider_id)` | Approved rider | Total earnings, this week, pending payout, completed deliveries count |
| View payout history | N/A | Rider | Past payouts: amount, date, status |

---

## 👑 ADMIN INTERACTIONS

### User Management
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Approve vendor | `approve_vendor(vendor_id)` | Vendor application pending | Vendor status → approved, can manage products/orders |
| Reject vendor | N/A | Vendor application pending | Vendor status → rejected, reason recorded |
| Approve rider | `approve_rider(rider_id)` | Rider application pending | Rider status → approved, can toggle availability |
| Reject rider | N/A | Rider application pending | Rider status → rejected, reason recorded |

### Order Operations
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Manual vendor assignment | `assign_vendor_to_order(order_id, vendor_id)` | Order pending, vendor approved | Order assigned to specific vendor |
| Auto-assign vendor | `auto_assign_vendor(order_id)` | Order pending, vendors available | Best-matched vendor assigned automatically |

### Financial Oversight
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| View all transactions | `get_all_transactions(date_range)` | Admin | Unified ledger: payments, settlements, transfers, refunds, withdrawals |
| Approve refund | `approve_refund(refund_id)` | Refund requested by customer | Refund → approved, payment reversed to customer |
| Reject refund | N/A | Refund requested | Refund → rejected, customer notified with reason |
| Approve withdrawal | `approve_withdrawal(withdrawal_id)` | Withdrawal requested by vendor | Withdrawal → approved, transfer initiated to vendor bank |
| Reject withdrawal | N/A | Withdrawal requested | Withdrawal → rejected, vendor notified |

### Product & Platform Control
| Action | Tool | Preconditions | Expected Result |
|--------|------|---------------|-----------------|
| Add/edit any product | N/A (product service) | Admin | Direct product management across all vendors |
| Toggle maintenance mode | `set_maintenance_mode(true/false)` | Admin | Platform-wide read-only / disabled state |

---

## 🔄 CROSS-ROLE WORKFLOWS

### Standard Delivery Flow
```
Customer: search_products → place order → pay (Paystack)
    ↓
Order: pending → confirmed (payment success)
    ↓
Vendor: get_vendor_orders → accept → preparing → ready
    ↓
System: order enters rider pool (if delivery_method=delivery)
    ↓
Rider: get_available_pool_orders → claim_order
    ↓
Delivery: assigned → picked_up → in_transit → delivered
    ↓
Settlement: vendor earnings credited, rider earnings credited
```

### Pickup Flow (No Rider)
```
Customer: place order → pay → confirmed
Vendor: accept → preparing → ready
Customer: notified "ready for pickup" → collects order
Vendor: marks collected (or auto-complete)
```

### Refund Flow
```
Customer: request_refund(order_id, reason)
    ↓
Admin: get_all_transactions → approve_refund / reject
    ↓
If approved: payment reversed, order status → refunded
```

### Withdrawal Flow
```
Vendor: request_withdrawal(amount, bank_details)
    ↓
Admin: approve_withdrawal / reject
    ↓
If approved: transfer processed, vendor paid
```

---

## 📋 TOOL REFERENCE SUMMARY

| Tool | Role | Purpose |
|------|------|---------|
| `search_products(query)` | Customer | Product discovery |
| `get_customer_orders(user_id)` | Customer | Order history |
| `get_order_status(order_id)` | Customer | Real-time tracking |
| `get_payment_status(order_id)` | Customer | Payment verification |
| `request_refund(order_id, reason)` | Customer | Refund initiation |
| `get_vendor_orders(vendor_id, status_filter)` | Vendor | Order queue management |
| `update_order_status(order_id, status)` | Vendor | Order progression |
| `get_vendor_products(vendor_id)` | Vendor | Catalog management |
| `request_withdrawal(vendor_id, amount, bank_details)` | Vendor | Earnings withdrawal |
| `get_available_pool_orders(rider_id, radius_km)` | Rider | Delivery discovery |
| `claim_order(order_id, rider_id)` | Rider | Accept delivery |
| `update_delivery_status(order_id, status)` | Rider | Delivery progression |
| `get_rider_earnings(rider_id)` | Rider | Earnings tracking |
| `approve_vendor(vendor_id)` | Admin | Vendor onboarding |
| `approve_rider(rider_id)` | Admin | Rider onboarding |
| `assign_vendor_to_order(order_id, vendor_id)` | Admin | Manual order routing |
| `auto_assign_vendor(order_id)` | Admin | Auto order routing |
| `get_all_transactions(date_range)` | Admin | Financial audit |
| `approve_refund(refund_id)` | Admin | Refund resolution |
| `approve_withdrawal(withdrawal_id)` | Admin | Withdrawal resolution |
| `set_maintenance_mode(boolean)` | Admin | Platform control |

---

## 🔐 DATA SCOPE ENFORCEMENT (RLS Rules)

| Role | Can See | Cannot See |
|------|---------|------------|
| Customer | Own orders, payments, refunds | Other customers' data, vendor earnings, rider pool |
| Vendor | Own products, own store's orders, own settlements | Other vendors' products/orders, rider data, admin ledgers |
| Rider | Eligible pool orders, own deliveries, own earnings | Other riders' earnings, customer payment details, vendor settlements |
| Admin | Everything (no restrictions) | N/A |

---

## ⚠️ NOT YET WIRED UP (Backend Gaps)

The following interactions are defined in product spec but lack backend tool implementations:
- Customer: `place_order`, `pay_via_paystack`, `contact_rider`
- Vendor: `apply_vendor`, `add/edit/delete_product`, `manage_categories`, `view_earnings_dashboard`
- Rider: `toggle_availability`, `decline_order`, `report_issue`, `view_payout_history`
- Admin: `reject_vendor`, `reject_rider`, `reject_refund`, `reject_withdrawal`, `add/edit_any_product`

When these are needed, respond: "Feature isn't wired up in the backend yet."