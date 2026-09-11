-- ============================================================
-- Product availability UI (per-product Available / Not available)
-- ============================================================
-- Requirement: a vendor toggles products.active OFF and the item stays
-- VISIBLE on the customer site (clearly marked "Currently unavailable"),
-- but can no longer be added to the cart or purchased. Toggling it back
-- ON restores ordering.
--
-- Two changes, both additive/idempotent, none touching the write path:
--
--   1. products_select_public is relaxed to USING (true) so unavailable
--      products remain readable (and visibly disabled) for customers.
--      Purchase security is UNCHANGED: place_order still joins products
--      `AND p.active = true`, and the enforce_order_item_pricing trigger
--      (20260930) still rejects any order_items insert whose product is
--      inactive. No customer can buy a toggled-off product by bypassing
--      the UI.
--
--   2. products is added to the supabase_realtime publication (same
--      idempotent pattern as notifications in 20260903) so a vendor's
--      availability flip propagates to the customer app live.

-- 1. Public read: include inactive products so they render greyed-out /
--    disabled rather than disappearing from the menu.
DROP POLICY IF EXISTS "products_select_public" ON public.products;
CREATE POLICY "products_select_public" ON public.products
  FOR SELECT
  USING (true);

-- 2. Realtime publish for availability flips (idempotent, safe when the
--    publication exists — always true on Supabase-hosted projects).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = 'products'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
    END IF;
  END IF;
END $$;