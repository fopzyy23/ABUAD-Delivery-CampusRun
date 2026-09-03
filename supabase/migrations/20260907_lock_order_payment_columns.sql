-- ============================================================
-- 20260907_lock_order_payment_columns.sql
-- PRE-PAYSTACK BLOCKER B1 — lock payment/financial columns
-- ============================================================
-- Protects these `orders` columns from EVERY normal client role
-- (customer, vendor, rider — and admin acting through the client):
--
--   payment_status
--   payment_reference
--   transaction_id
--   subtotal
--
-- HOW IT WORKS
-- ------------
-- The existing trigger function public.prevent_order_unauthorized_changes()
-- (introduced by 20260815) already blocks user_id + order_number for
-- everyone and total/fee/spot for non-admins — but it predates the
-- payment columns added by 20260902, so those four columns were wide
-- open to any client with an UPDATE path (e.g. a customer could forge
-- payment_status = 'success' on their own order through the legitimate
-- cancel/rating UPDATE window).
--
-- This migration CREATE OR REPLACEs that one function with a version
-- that ALSO rejects any change to the four payment/financial columns
-- for ALL roles, INCLUDING admins, unless the update comes from trusted
-- server-side code.
--
-- SERVER-SIDE ESCAPE HATCH (for the future Paystack/settlement code)
-- ------------------------------------------------------------------
-- Trusted server-side code announces itself with a transaction-local
-- GUC, set INSIDE its own SECURITY DEFINER function before updating:
--
--     PERFORM set_config('app.order_server_update', 'on', true);
--
-- * PostgREST clients cannot run SET statements, and
--   pg_catalog.set_config is not exposed (PostgREST only exposes
--   functions in `public`), so anon/authenticated/vendor/rider roles
--   have no way to flip this flag.
-- * The flag is transaction-local (third argument true), so it can
--   never leak beyond the payment function's own transaction.
--
-- WHAT IS DELIBERATELY NOT CHANGED
-- --------------------------------
-- * Existing admin behavior on total/fee/spot (admin may still edit
--   those — unchanged legacy behavior; no RLS weakening anywhere).
-- * user_id / order_number remain locked for every client role.
-- * All RLS policies, grants and the other triggers are untouched.
-- * No Paystack code, no settlement tables, no data changes.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The hardened trigger function (replaces the 20260815 body;
--    the legacy guards are preserved verbatim).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_order_unauthorized_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 'on' ONLY when trusted server-side code (a SECURITY DEFINER
  -- payment/settlement/maintenance function) opted in for THIS
  -- transaction. Clients cannot set GUCs through PostgREST.
  v_server_update boolean :=
    COALESCE(current_setting('app.order_server_update', true), 'off') = 'on';
BEGIN
  -- ---- NEW (B1): payment/financial columns are server-managed ----
  -- Blocked for every client role, admin included. Only a server-side
  -- function that set app.order_server_update may change these — this
  -- is exactly the path the future Paystack verify/webhook and
  -- settlement functions will use.
  IF NOT v_server_update THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      RAISE EXCEPTION 'payment_status is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.payment_reference IS DISTINCT FROM OLD.payment_reference THEN
      RAISE EXCEPTION 'payment_reference is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.transaction_id IS DISTINCT FROM OLD.transaction_id THEN
      RAISE EXCEPTION 'transaction_id is server-managed and cannot be changed by clients';
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
      RAISE EXCEPTION 'subtotal is server-managed and cannot be changed by clients';
    END IF;
  END IF;

  -- ---- Legacy guards (unchanged from 20260815) ----
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Cannot change order user_id';
  END IF;
  IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
    RAISE EXCEPTION 'Cannot change order_number';
  END IF;
  IF NOT public.is_admin() THEN
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      RAISE EXCEPTION 'Cannot change order total';
    END IF;
    IF NEW.fee IS DISTINCT FROM OLD.fee THEN
      RAISE EXCEPTION 'Cannot change order fee';
    END IF;
    IF NEW.spot IS DISTINCT FROM OLD.spot THEN
      RAISE EXCEPTION 'Cannot change order spot';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 2. Re-bind the trigger (idempotent; keeps the same name so every
--    existing reference and validation keeps working).
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_prevent_order_unauthorized_changes ON public.orders;
CREATE TRIGGER trg_prevent_order_unauthorized_changes
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.prevent_order_unauthorized_changes();

-- ============================================================
-- SUMMARY
-- ============================================================
-- * payment_status / payment_reference / transaction_id / subtotal
--   can no longer be modified through ANY client UPDATE window
--   (customer cancel/rating, rider progression, vendor workflow,
--   admin) — the trigger rejects the change before it lands.
-- * Legacy guards (user_id, order_number, total/fee/spot for
--   non-admins) are preserved verbatim; RLS untouched.
-- * Future server-side Paystack/settlement functions update these
--   columns securely by setting the transaction-local GUC
--   app.order_server_update inside their own SECURITY DEFINER body.
-- * No data modified; no Paystack code; no settlement tables.
-- ============================================================
