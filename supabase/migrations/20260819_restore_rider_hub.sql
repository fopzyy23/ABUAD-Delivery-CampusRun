-- ============================================================
-- Dropzyy — Restore Full Rider Hub (riders + rider_ratings)
-- ============================================================
-- This migration restores the complete rider hub functionality:
--   1. Creates the `riders` table if it does not exist (never drops).
--   2. Creates the `rider_ratings` table for customer ratings/reviews.
--   3. Adds a unique constraint on riders.user_id to prevent duplicates.
--   4. Adds RLS policies for riders (self insert/select, admin manage).
--   5. Adds RLS policies for rider_ratings (customers rate, riders view own, admin view).
--   6. Preserves existing data — uses CREATE TABLE IF NOT EXISTS / ADD CONSTRAINT IF NOT EXISTS.
-- ============================================================

-- ============================================================
-- 1. riders table (CREATE IF NOT EXISTS — never drops existing data)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  matric_number text NOT NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  available boolean NOT NULL DEFAULT false,
  rating_avg numeric(3,2) NOT NULL DEFAULT 5.00,
  rating_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate applications: one rider row per auth user.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'riders_user_id_unique'
  ) THEN
    ALTER TABLE public.riders ADD CONSTRAINT riders_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

-- Index for looking up a rider's status quickly.
CREATE INDEX IF NOT EXISTS riders_user_id_idx ON public.riders(user_id);
CREATE INDEX IF NOT EXISTS riders_status_idx ON public.riders(status);

COMMENT ON TABLE public.riders IS 'Rider applications and profiles — one row per auth user (unique user_id).';

-- ============================================================
-- 2. rider_ratings table (CREATE IF NOT EXISTS)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rider_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES public.riders(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate ratings: one rating per order per reviewer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rider_ratings_one_per_order'
  ) THEN
    ALTER TABLE public.rider_ratings ADD CONSTRAINT rider_ratings_one_per_order UNIQUE (order_id, reviewer_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rider_ratings_rider_id_idx ON public.rider_ratings(rider_id);
CREATE INDEX IF NOT EXISTS rider_ratings_order_id_idx ON public.rider_ratings(order_id);

COMMENT ON TABLE public.rider_ratings IS 'Customer ratings and reviews for riders after a delivered order.';

-- ============================================================
-- 3. RLS: enable row level security
-- ============================================================
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_ratings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. Trigger: auto-update updated_at on riders
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_riders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_riders_set_updated_at ON public.riders;
CREATE TRIGGER trg_riders_set_updated_at
BEFORE UPDATE ON public.riders
FOR EACH ROW
EXECUTE FUNCTION public.set_riders_updated_at();

-- ============================================================
-- 5. Trigger: when a rider rating is inserted, update the rider aggregate
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_rider_rating_averages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.riders
  SET rating_avg = (
        SELECT COALESCE(AVG(rating), 0)::numeric(3,2)
        FROM public.rider_ratings
        WHERE rider_id = COALESCE(NEW.rider_id, OLD.rider_id)
      ),
      rating_count = (
        SELECT COUNT(*)
        FROM public.rider_ratings
        WHERE rider_id = COALESCE(NEW.rider_id, OLD.rider_id)
      )
  WHERE id = COALESCE(NEW.rider_id, OLD.rider_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_rider_rating_averages ON public.rider_ratings;
CREATE TRIGGER trg_update_rider_rating_averages
AFTER INSERT OR UPDATE OR DELETE ON public.rider_ratings
FOR EACH ROW
EXECUTE FUNCTION public.update_rider_rating_averages();

-- ============================================================
-- 6. riders RLS policies
-- ============================================================
-- SELECT: own rider row, admin sees all
DROP POLICY IF EXISTS "riders_select_own" ON public.riders;
CREATE POLICY "riders_select_own" ON public.riders
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "riders_select_admin" ON public.riders;
CREATE POLICY "riders_select_admin" ON public.riders
  FOR SELECT
  USING (public.is_admin());

-- INSERT: own application, must be pending, prevents duplicate via unique(user_id)
DROP POLICY IF EXISTS "riders_insert_own" ON public.riders;
CREATE POLICY "riders_insert_own" ON public.riders
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
  );

-- UPDATE: own rider can update phone/available while pending; admin can manage everything
DROP POLICY IF EXISTS "riders_update_own" ON public.riders;
CREATE POLICY "riders_update_own" ON public.riders
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND status IN ('pending','approved')
  );

DROP POLICY IF EXISTS "riders_update_admin" ON public.riders;
CREATE POLICY "riders_update_admin" ON public.riders
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE: admin only (never delete user data unless explicitly requested)
DROP POLICY IF EXISTS "riders_delete_admin" ON public.riders;
CREATE POLICY "riders_delete_admin" ON public.riders
  FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- 7. rider_ratings RLS policies
-- ============================================================
-- SELECT: a rider can read ratings for their own rider row; admins see all
DROP POLICY IF EXISTS "rider_ratings_select_own" ON public.rider_ratings;
CREATE POLICY "rider_ratings_select_own" ON public.rider_ratings
  FOR SELECT
  USING (
    rider_id IN (SELECT id FROM public.riders WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "rider_ratings_select_admin" ON public.rider_ratings;
CREATE POLICY "rider_ratings_select_admin" ON public.rider_ratings
  FOR SELECT
  USING (public.is_admin());

-- Customer can see ratings they left on their own orders (for the track page)
DROP POLICY IF EXISTS "rider_ratings_select_reviewer" ON public.rider_ratings;
CREATE POLICY "rider_ratings_select_reviewer" ON public.rider_ratings
  FOR SELECT
  USING (
    reviewer_id = auth.uid()
    OR order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
  );

-- INSERT: only the customer who owns a DELIVERED order can rate the assigned rider.
DROP POLICY IF EXISTS "rider_ratings_insert_own" ON public.rider_ratings;
CREATE POLICY "rider_ratings_insert_own" ON public.rider_ratings
  FOR INSERT
  WITH CHECK (
    reviewer_id = auth.uid()
    AND order_id IN (
      SELECT id FROM public.orders
      WHERE user_id = auth.uid()
        AND status = 'Delivered'
        AND rider_id IS NOT NULL
    )
    AND rider_id IN (
      SELECT rider_id FROM public.orders
      WHERE id = order_id
        AND rider_id IS NOT NULL
    )
  );

-- ============================================================
-- 8. Grants (authenticated users need these)
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.riders TO authenticated;
GRANT SELECT, INSERT ON public.rider_ratings TO authenticated;

-- ============================================================
-- END — Dropzyy Rider Hub Restore
-- ============================================================