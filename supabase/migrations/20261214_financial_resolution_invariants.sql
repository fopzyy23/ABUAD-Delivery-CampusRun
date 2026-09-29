-- ============================================================
-- 20261213_financial_resolution_invariants.sql
-- ============================================================
-- Adds database-level constraints and triggers to enforce financial resolution invariants:
-- 1. Unpaid order cannot receive reimbursement
-- 2. Unpaid order cannot receive Paystack refund
-- 3. Successfully reimbursed payment cannot be refunded again
-- 4. Successfully refunded payment cannot be reimbursed again
-- 4. Reimbursement cannot be created twice
-- 5. Refund cannot be created twice
-- 6. Cancellation must not restart financial resolution
-- ============================================================

-- Constraint: Prevent reimbursement on unpaid orders
-- (Already enforced by amount > 0 check in create_pending_customer_reimbursement_transfer)

-- Trigger: Prevent refund if already reimbursed
CREATE OR REPLACE FUNCTION public.prevent_refund_if_reimbursed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancellation public.cancellations%ROWTYPE;
  v_reimbursed boolean := false;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('requested','approved') THEN
      -- Check if there's a successful reimbursement for this order
      SELECT EXISTS(
        SELECT 1 FROM public.cancellations c
        JOIN public.transfers t ON t.cancellation_id = c.id
        WHERE c.order_id = NEW.order_id
          AND t.transfer_kind = 'customer_reimbursement'
          AND t.status = 'success'
      ) INTO v_reimbursed;
      
      IF v_reimbursed THEN
        RAISE EXCEPTION 'Cannot create refund: order already has a successful reimbursement';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_refund_if_reimbursed
BEFORE INSERT OR UPDATE ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.prevent_refund_if_reimbursed();

-- Trigger: Prevent reimbursement if already refunded
CREATE OR REPLACE FUNCTION public.prevent_reimbursement_if_refunded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refunded boolean := false;
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.transfer_kind = 'customer_reimbursement' THEN
      -- Check if there's a successful refund for this order
      SELECT EXISTS(
        SELECT 1 FROM public.refunds r
        JOIN public.payments p ON p.id = r.payment_id
        WHERE p.order_id = (
          SELECT order_id FROM public.cancellations WHERE id = NEW.cancellation_id
        )
        AND r.status = 'processed'
      ) INTO v_refunded;
      
      IF v_refunded THEN
        RAISE EXCEPTION 'Cannot create reimbursement: order already has a successful refund';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_reimbursement_if_refunded
BEFORE INSERT OR UPDATE ON public.transfers
FOR EACH ROW
WHEN (NEW.transfer_kind = 'customer_reimbursement')
EXECUTE FUNCTION public.prevent_reimbursement_if_refunded();

-- Constraint: Prevent double reimbursement (already have uq_cancellation_reimbursement_transfer)
-- Constraint: Prevent double refund (already have unique index on payment_id in refunds table)

-- Trigger: Prevent cancellation from restarting financial resolution
CREATE OR REPLACE FUNCTION public.prevent_cancellation_restart()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.cancellations%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO v_existing FROM public.cancellations WHERE order_id = NEW.order_id LIMIT 1;
    IF FOUND THEN
      -- Check if existing cancellation has already reached a terminal state
      IF v_existing.stage IN ('reimbursed','resolved','reimbursement_failed','reimbursement_reversed') THEN
        RAISE EXCEPTION 'Cancellation already resolved for this order';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_cancellation_restart
BEFORE INSERT ON public.cancellations
FOR EACH ROW EXECUTE FUNCTION public.prevent_cancellation_restart();

-- Trigger: Prevent automatic cutoff from creating second resolution for already resolved payment
-- (Already handled by the checks in finalize_automatic_8pm_cutoff_claim)

-- Grant execute permissions
REVOKE ALL ON FUNCTION public.prevent_refund_if_reimbursed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_reimbursement_if_refunded() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_cancellation_restart() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prevent_refund_if_reimbursed() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_reimbursement_if_refunded() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_cancellation_restart() TO service_role, authenticated;