-- ============================================
-- Add `delivery_method` to public.vendors
-- ============================================
-- Allowed values:
--   'rider'       = restaurant; rider collects/purchases and delivers.
--   'vendor_self' = vendor handles delivery.
--   'both'        = vendor can choose either.
--
-- Default existing/current restaurants to 'rider'.

-- 1. Add the column with a default of 'rider' and a CHECK constraint
--    restricting the allowed values.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT 'rider'
  CHECK (delivery_method IN ('rider', 'vendor_self', 'both'));

-- 2. Backfill any existing rows that somehow have a NULL/empty value
--    (the NOT NULL + DEFAULT above already covers new inserts, but this
--    guards against rows inserted before the column existed).
UPDATE public.vendors
  SET delivery_method = 'rider'
  WHERE delivery_method IS NULL OR delivery_method = '';