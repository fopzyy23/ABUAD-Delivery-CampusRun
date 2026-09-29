-- ============================================================
-- 20261216_fix_realtime_publication.sql
-- ============================================================
-- Adds orders and order_items to the supabase_realtime publication
-- so the rider hub Realtime subscriptions receive live updates.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- orders table
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = 'orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    -- order_items table
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public' AND tablename = 'order_items'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
    END IF;
  END IF;
END $$;