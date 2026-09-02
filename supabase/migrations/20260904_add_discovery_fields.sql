-- ============================================================
-- Dropzyy — Product & Vendor Discovery Fields
-- ============================================================
-- ACTION 8: adds OPTIONAL discovery metadata so cards and the
-- product detail view can show richer vendor/product information.
--
-- Adds (all nullable, additive, no data migration needed):
--   vendors.image         text  — optional logo / cover image URL
--   vendors.description   text  — optional short vendor blurb
--   vendors.opening_hours text  — optional opening-hours text, e.g.
--                                "Mon–Fri 08:00–18:00, Sat 09:00–14:00"
--   products.image        text  — optional product photo URL
--
-- DELIBERATELY NO RLS / POLICY / FUNCTION / TRIGGER CHANGES:
-- vendor ownership rules (profiles.vendor_id → vendors.id →
-- products.vendor_id) and all existing policies are untouched.
-- The new columns are plain data columns; existing rows keep
-- working exactly as before (NULL simply means "no image/desc").
-- ============================================================

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS image text;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS opening_hours text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS image text;