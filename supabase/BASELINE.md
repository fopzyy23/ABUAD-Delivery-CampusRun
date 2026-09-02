# Database Reproducibility (ACTION 12 — findings, no destructive baseline)

This document records what existed **before** the repo's migration history
and what is required to reproduce the current live database from scratch.

> **Deliberately NOT done:** a generated "baseline" migration that would
> DROP/recreate tables to match the live schema. That would be destructive
> and risky (unknown exact base-column types). Migrations stay append-only
> and idempotent.

## 1. Migration inventory (supabase/migrations/, apply in filename order)

| File | Purpose | Self-contained? |
|---|---|---|
| `20260814_add_delivery_method_to_vendors.sql` | vendors.delivery_method column | additive, idempotent |
| `20260815_current_rls_backup.sql` | point-in-time backup of policies (documentation) | no-op (reference only) |
| `20260815_fix_rls_security.sql` | is_admin(), protection triggers, drops ALL policies on the 6 base tables and recreates them; re-enables RLS | recreates the full base policy set |
| `20260818_add_vendor_order_workflow.sql` | orders.delivery_method, orders.vendor_id, profiles.vendor_id + first vendor policies | **superseded by 20260820** (its orders.vendor_id policies were replaced; the column remains but is unused) |
| `20260819_restore_rider_hub.sql` | creates riders + rider_ratings (IF NOT EXISTS), full RLS, grants | yes |
| `20260820_add_vendor_dashboard_workflow.sql` | corrected vendor workflow (no orders.vendor_id usage), full status CHECK, vendor policies | yes |
| `20260821_fix_orders_rls_recursion.sql` | SECURITY DEFINER helpers (is_approved_rider, is_available_rider, caller_owns_rider, order_has_vendor_item) + rewritten orders policies | yes |
| `20260822_admin_vendor_assignment_rpc.sql` | assign_user_to_vendor RPC | yes |
| `20260901_add_on_the_way_status.sql` | 'On the Way' status, customer-cancel policy, enforce_order_status_transitions trigger | yes |
| `20260902_add_order_payment_fields.sql` | orders.subtotal / payment_status / payment_reference / transaction_id | yes |
| `20260903_create_notifications.sql` | notifications table + RLS + event triggers + realtime | yes |
| `20260904_add_discovery_fields.sql` | vendors.image/description/opening_hours, products.image | yes |
| `20260905_create_withdrawal_requests.sql` | withdrawal_requests + RLS + grants | yes |
| `20260906_secure_order_pricing.sql` | ACTION 12: place_order RPC, write lockdown, pricing trigger, vendor/rider policy fixes | yes |

## 2. Pre-migration "base" tables (existed before 20260814)

The original tables were created directly in the Supabase dashboard and are
NOT covered by any migration. The authoritative snapshot is documented in
the header of `20260820_add_vendor_dashboard_workflow.sql` (validated against
the live schema via PostgREST probes):

- **orders** — id (uuid), order_number (text), user_id (uuid → auth.users),
  status (text), total (numeric), fee (numeric), spot (text), created_at
  (timestamptz). (rider_id was added before 20260819 references it; 20260820
  lists it as live.)
- **order_items** — id, order_id (→ orders.id), product_id (→ products.id),
  qty, price, name, icon, vendor_id (text → vendors.id), created_at.
- **profiles** — id (uuid, mirrors auth.users), created_at, full_name, phone,
  hostel, email, role (text, default 'user').
- **vendors** — id (text PK), name, icon, type, rating, time, cover, open.
- **products** — id, vendor_id (text), name, desc, price (numeric), icon,
  category, active (boolean), created_at.
- **riders / rider_ratings** — *not* base tables; 20260819 recreates them
  idempotently (`CREATE TABLE IF NOT EXISTS`).
- **notifications** (20260903) and **withdrawal_requests** (20260905) are
  fully migration-owned.

## 3. What is NOT reproducible from migrations alone

1. `CREATE TABLE` statements for the 5 base tables (exact PK/FK/type DDL,
   including whether products.id is integer or bigint).
2. Initial `ENABLE ROW LEVEL SECURITY` on the base tables — **but**
   `20260815_fix_rls_security.sql` re-runs `ENABLE ROW LEVEL SECURITY` on
   profiles/riders/orders/order_items/vendors/products, so applying the
   migration chain closes this gap automatically.
3. Initial table GRANTs (`GRANT ALL ... TO anon/authenticated` — the
   Supabase default for dashboard-created tables). Migrations grant only
   riders/rider_ratings/withdrawal_requests explicitly. **Note:** since
   `20260906_secure_order_pricing.sql`, direct INSERT on orders and
   INSERT/UPDATE/DELETE on order_items is *intentionally* revoked; a fresh
   reproduction must run 20260906 (not re-grant) for the checkout RPC flow
   to be the only path.
4. Live data (vendors/products catalog — reproducible via
   `npm run seed:catalog` with a service-role env var).

## 4. Reproduction procedure (fresh Supabase project)

1. Create the 5 base tables per the snapshot in §2 (enable RLS; default
   Supabase grants to anon/authenticated are fine at this stage).
2. Create the `auth`-schema-linked columns exactly as listed (profiles.id
   mirrors auth.users.id; orders.user_id / rider tables reference it).
3. Apply every migration in §1 in filename order (all are idempotent;
   20260815 drops and recreates all base-table policies, so any interim
   policy state self-heals).
4. Seed the catalog: `npm run seed:catalog`
   (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars; never commit keys).
5. Verify with the read-only validators in `scripts/` (no service-role key
   needed): `validate_action12.js`, `_validate_payment_prep.js`,
   `validate_action10.js`, `validate_vendor_migration.js`,
   `validate_discovery_migration.js`, then the live checks
   (`validate_action11_live.js`, `verify_rls_readonly.js`).

## 5. Live schema introspection (ACTION 13 finding)

The Supabase REST API on this project does **not** expose system schemas:
`GET /rest/v1/information_schema/columns` and `/tables` both return
`PGRST125 "Invalid path specified in request URL"`, and the OpenAPI root
spec returns no table definitions. Exact base-column types therefore cannot
be captured with the publishable key alone.

To complete §2, run this in the **Supabase Dashboard → SQL Editor** and
paste the output below (read-only query, no changes):

```sql
select table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('orders','order_items','profiles','vendors','products')
order by table_name, ordinal_position;
```

Also confirm primary/foreign keys with:

```sql
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid)
from pg_constraint
where connamespace = 'public'::regnamespace
  and contype in ('p','f')
  and conrelid::regclass::text in (
    'orders','order_items','profiles','vendors','products')
order by conrelid::regclass::text, conname;
```

## 6. Accuracy confirmation (ACTION 13)

- §1 migration list re-checked against `supabase/migrations/` on disk —
  complete and correctly ordered (filenames sort chronologically; apply
  order = filename order).
- §2 base-table snapshot re-checked against the live-schema documentation
  in the `20260820` migration header and the policy set in `20260815` /
  `20260821` — consistent.
- Since `20260906`, checkout inserts flow through the `place_order` RPC;
  a reproduced database must apply all migrations including 20260906
  before seeding, or checkout will fail (INSERT on orders is revoked).
