-- ============================================================
-- Dropzyy — Add payment-prep fields to orders
-- ============================================================
-- Prepares the orders table for the upcoming Paystack integration.
-- No Paystack code is added here — only the data capabilities the
-- payment flow will need.
--
-- New columns:
--   subtotal          — product-only amount (price × qty, no delivery fee)
--   payment_status    — 'pending' | 'success' | 'failed'  (default 'pending')
--   payment_reference — Paystack reference (unique when present)
--   transaction_id    — Paystack transaction id
--
-- Existing `fee` column is retained as the delivery fee. No duplicate
-- `delivery_fee` column is created.
--
-- Existing rows receive safe defaults via DEFAULT clauses and a
-- backfill UPDATE, so old orders keep working.
-- ============================================================

-- 1. Add the new columns with safe defaults.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0
    CHECK (subtotal >= 0),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'success', 'failed')),
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS transaction_id text;

-- 2. Backfill existing rows:
--    subtotal = total - fee (never negative), payment_status = 'pending'.
UPDATE public.orders
SET
  subtotal = GREATEST(total - fee, 0),
  payment_status = 'pending'
WHERE subtotal IS DISTINCT FROM GREATEST(total - fee, 0)
   OR payment_status IS DISTINCT FROM 'pending';

-- 3. payment_reference must be unique when set (one reference per order).
--    NULLs are allowed to coexist (a payment not yet attempted).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_reference_key'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_reference_key UNIQUE (payment_reference);
  END IF;
END $$;

-- 4. Keep the existing total CHECK meaningful: total >= 0.
--    (total is expected to equal subtotal + fee at creation time.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_total_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_total_check CHECK (total >= 0);
  END IF;
END $$;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * subtotal, payment_status, payment_reference, transaction_id added.
-- * fee retained as delivery fee; no duplicate column.
-- * Existing orders backfilled safely (subtotal = total - fee).
-- * payment_reference is UNIQUE when present; NULLs allowed.
-- * payment_status restricted to pending/success/failed.
-- * No Paystack code, no workflow/RLS changes.
-- ============================================================