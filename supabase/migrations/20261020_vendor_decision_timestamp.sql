ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vendor_decision_at timestamptz;
