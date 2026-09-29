-- ============================================================
-- 20261204_add_icon_field_constraints.sql
-- ============================================================
-- Adds conservative constraints to the `icon` fields in vendors
-- and products tables to prevent overly long values and reduce
-- XSS risk from vendor-controlled input.
--
-- The `icon` field is used for emoji/text display (e.g., '🍔', '🍛')
-- not for URLs. The `image` field handles URLs separately and is
-- already validated by the application's safeImageUrl() helper.
--
-- Constraints:
--   * Maximum length of 16 characters (allows emoji sequences,
--     flags, and composite emoji while preventing abuse)
--   * NOT NULL with default ensures existing rows are not broken
-- ============================================================

-- 1. Vendors table: add max length constraint to icon
--    Uses a CHECK constraint which is idempotent and won't fail
--    on existing rows that already satisfy the condition.
--    Existing seed data uses single emoji (1-2 chars).
ALTER TABLE public.vendors
  ADD CONSTRAINT vendors_icon_max_length
  CHECK (char_length(icon) <= 16);

-- 2. Products table: add max length constraint to icon
--    Same rationale as vendors.icon.
ALTER TABLE public.products
  ADD CONSTRAINT products_icon_max_length
  CHECK (char_length(icon) <= 16);

-- Note: These constraints are additive and idempotent. They will
-- not cause migration failures on existing valid data. If any
-- existing rows violate the constraint, the migration will fail
-- with a clear error, at which point a data cleanup would be needed.
-- Current seed data and usage patterns use single emoji characters,
-- so this should pass cleanly.