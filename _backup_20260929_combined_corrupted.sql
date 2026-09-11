-- ============================================================
-- 20260929_combined_vendor_fee_settlement.sql
-- Combined idempotent migration merging the useful parts of
-- 20260927 (vendor apps + fee columns) with the FIXED
-- 20260928 place_order RPC (native p.id + full result shape).
--
-- Safe to apply ONCE to the current live Supabase database.
-- ============================================================

-- ------------------------------------------------------------
-- 1. VENDOR APPLICATIONS TABLE
--    Mirrors the existing riders table structure. One row per
--    applicant (UNIQUE user_id). Admin-gated approval workflow.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  matric_number text NOT NULL,
  college text NOT NULL,
  department text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  what_they_want_to_sell text NOT NULL,
  expected_price_range text NOT NULL,
  additional_info text,
  status text NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  vendor_id text,
  admin_response text,
  admin_reviewed_at timestamptz,
  admin_reviewed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_applications_user_id UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS vendor_applications_status_idx
  ON public.vendor_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS vendor_applications_user_id_idx
  ON public.vendor_applications (user_id);

-- updated_at trigger (same pattern as existing migrations)
CREATE OR REPLACE FUNCTION public.touch_vendor_applications()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vendor_applications_updated_at
  ON public.vendor_applications;
CREATE TRIGGER trg_vendor_applications_updated_at
  BEFORE UPDATE ON public.vendor_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_vendor_applications();

-- ------------------------------------------------------------
-- 2. EXTEND RIDERS TABLE
--    Add student-identification fields to match the vendor
--    application intake. Existing rows keep NULL.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'full_name') THEN
    ALTER TABLE public.riders ADD COLUMN full_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'college') THEN
    ALTER TABLE public.riders ADD COLUMN college text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'department') THEN
    ALTER TABLE public.riders ADD COLUMN department text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'email') THEN
    ALTER TABLE public.riders ADD COLUMN email text;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 3. EXTEND ORDERS TABLE
--    Add columns to track the delivery-fee split per order.
--    fee = rider_delivery_share + company_delivery_share
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'rider_delivery_share') THEN
    ALTER TABLE public.orders ADD COLUMN rider_delivery_share numeric(12,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'company_delivery_share') THEN
    ALTER TABLE public.orders ADD COLUMN company_delivery_share numeric(12,2);
  END IF;
END;
$$;

-- The CHECK constraint must exist but must NOT block historical
-- orders that pre-date the split columns. We add it as NOT VALID
-- so existing rows are exempt, then validate only future rows.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_split_check') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_delivery_split_check
      CHECK (
        rider_delivery_share IS NULL
        OR company_delivery_share IS NULL
        OR rider_delivery_share + company_delivery_share = fee
      ) NOT VALID;
  END IF;
END;

-- ------------------------------------------------------------
-- 4. FIXED place_order RPC (from 20260928)
--    Restores the proven function body with NATIVE p.id for
--    order_items, full { order, items } result shape, and
--    collision-safe order numbers. Keeps the 1500/1000/500
--    delivery-fee business rules server-side.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_spot  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$$$
DECLARE
  v_user          uuid := auth.uid();
  v_item          jsonb;
  v_qty_text      text;
  v_qty           integer;
  v_expected      integer;
  v_matched       integer;
  v_subtotal      numeric(12,2);
  v_fee           numeric(12,2) := 1500;
  v_rider_share   numeric(12,2) := 1000;
  v_company_share numeric(12,2) := 500;
  v_total         numeric(12,2);
  v_order_number  text;
  v_attempt       integer := 0;
  v_order         public.orders%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;
  v_expected := jsonb_array_length(p_items);
  IF v_expected > 50 THEN
    RAISE EXCEPTION 'too many cart lines (max 50)';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF v_item->>'id' IS NULL OR btrim(v_item->>'id') = '' THEN
      RAISE EXCEPTION 'cart line is missing a product id';
    END IF;
    v_qty_text := v_item->>'qty';
    IF v_qty_text IS NULL OR v_qty_text !~ '^[0-9]+$$' THEN
      RAISE EXCEPTION 'invalid quantity for product %', v_item->>'id';
    END IF;
    v_qty := v_qty_text::integer;
    IF v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'quantity for product % must be between 1 and 99', v_item->>'id';
    END IF;
  END LOOP;

  IF p_spot IS NULL OR btrim(p_spot) = '' OR length(p_spot) > 200 THEN
    RAISE EXCEPTION 'a delivery location is required';
  END IF;

  SELECT count(*) INTO v_matched
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  IF v_matched IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'one or more products are unavailable or no longer exist';
  END IF;

  SELECT COALESCE(SUM(p.price * (li->>'qty')::integer), 0) INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  v_total := v_subtotal + v_fee;

  LOOP
    v_order_number := 'CR-' || upper(substr(md5(clock_timestamp()::text || random()::text || v_attempt::text), 1, 12));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.orders WHERE order_number = v_order_number
    );
    v_attempt := v_attempt + 1;
    IF v_attempt > 10 THEN
      RAISE EXCEPTION 'could not allocate a unique order number, please retry';
    END IF;
  END LOOP;

  INSERT INTO public.orders (
    order_number, user_id, subtotal, fee,
    rider_delivery_share, company_delivery_share,
    total, status, payment_status, spot, delivery_method, created_at
  ) VALUES (
    v_order_number, v_user, v_subtotal, v_fee,
    v_rider_share, v_company_share,
    v_total, 'Order confirmed', 'pending', p_spot, 'rider', now()
  )
  RETURNING * INTO v_order;

  INSERT INTO public.order_items (order_id, product_id, qty, price, name, icon, vendor_id)
  SELECT
    v_order.id,
    p.id,
    (li->>'qty')::integer,
    p.price,
    p.name,
    COALESCE(p.icon, li->>'icon', ''),
    p.vendor_id
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', (
      SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb)
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
    )
  );
END;
$$$$;

GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- 5. generate_settlement — use the stored split columns.
--    New orders carry rider 1000 / company 500; historical rows
--    carry their backfilled 80/20 split. Both honored exactly
--    as stored — no percentage calculation in active logic.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_settlement(
  p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$$$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_item record;
  v_count integer;
  v_vendor_settlement_id uuid;
  v_delivery_settlement_id uuid;
  v_recipient public.transfer_recipients%ROWTYPE;
  v_transfer_result jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  SELECT * INTO v_payment FROM public.payments
  WHERE order_id = p_order_id AND status = 'success' LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % has no successful payment - cannot settle', p_order_id;
  END IF;

  IF v_order.status != 'Delivered' THEN
    RAISE EXCEPTION 'Order % is not Delivered (status: %) - cannot settle', p_order_id, v_order.status;
  END IF;

  SELECT count(*) INTO v_count FROM public.vendor_settlements WHERE order_id = p_order_id;
  IF v_count > 0 THEN
    RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', true, 'vendor_settlements', v_count);
  END IF;

  FOR v_item IN
    SELECT oi.vendor_id, SUM(oi.price * oi.qty) AS total
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
    GROUP BY oi.vendor_id
  LOOP
    INSERT INTO public.vendor_settlements (order_id, vendor_id, amount, status)
    VALUES (p_order_id, v_item.vendor_id, v_item.total, 'pending')
    RETURNING id INTO v_vendor_settlement_id;

    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'vendor' AND vendor_id = v_item.vendor_id;

    IF FOUND THEN
      BEGIN
        v_transfer_result := public.create_pending_transfer(
          p_vendor_settlement_id := v_vendor_settlement_id,
          p_paystack_reference := gen_random_uuid()::text,
          p_recipient_code := v_recipient.recipient_code
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create pending transfer for vendor settlement %: %', v_vendor_settlement_id, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Use the authoritative stored split columns.
  INSERT INTO public.delivery_settlements (order_id, rider_id, delivery_fee, rider_amount, platform_amount, status)
  VALUES (
    p_order_id,
    v_order.rider_id,
    v_order.fee,
    v_order.rider_delivery_share,
    v_order.company_delivery_share,
    'pending'
  )
  RETURNING id INTO v_delivery_settlement_id;

  IF v_order.rider_id IS NOT NULL THEN
    SELECT * INTO v_recipient FROM public.transfer_recipients
    WHERE payee_type = 'rider' AND profile_id = v_order.rider_id;

    IF FOUND THEN
      BEGIN
        v_transfer_result := public.create_pending_transfer(
          p_delivery_settlement_id := v_delivery_settlement_id,
          p_paystack_reference := gen_random_uuid()::text,
          p_recipient_code := v_recipient.recipient_code
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to create pending transfer for delivery settlement %: %', v_delivery_settlement_id, SQLERRM;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object('settled', true, 'order_id', p_order_id, 'already_exists', false);
END;
$$$$;

GRANT EXECUTE ON FUNCTION public.generate_settlement(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_settlement(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_settlement(uuid) FROM PUBLIC;

-- ------------------------------------------------------------
-- 6. BACKFILL HISTORICAL ORDERS
--    Existing orders pre-date the split columns. Backfill them
--    with the OLD 80/20 split of their historical fee so the
--    stored columns are populated and financial history is
--    preserved exactly. New orders get the flat 1000/500 from
--    the place_order RPC above.
-- ------------------------------------------------------------
UPDATE public.orders
SET
  rider_delivery_share = round(fee * 0.8, 2),
  company_delivery_share = round(fee * 0.2, 2)
WHERE rider_delivery_share IS NULL
  AND fee IS NOT NULL;

-- ------------------------------------------------------------
-- 7. VENDOR APPLICATION RLS + GRANTS
--    Applicants manage only their own row; admins manage all.
-- ------------------------------------------------------------
ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_applications_insert_own
  ON public.vendor_applications;
CREATE POLICY vendor_applications_insert_own
  ON public.vendor_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Pending'
    AND admin_response IS NULL
    AND admin_reviewed_by IS NULL
  );

DROP POLICY IF EXISTS vendor_applications_select_own
  ON public.vendor_applications;
CREATE POLICY vendor_applications_select_own
  ON public.vendor_applications
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS vendor_applications_update_admin
  ON public.vendor_applications;
CREATE POLICY vendor_applications_update_admin
  ON public.vendor_applications
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

REVOKE ALL ON public.vendor_applications FROM PUBLIC;
REVOKE ALL ON public.vendor_applications FROM anon;
GRANT SELECT, INSERT ON public.vendor_applications TO authenticated;
GRANT UPDATE (status, admin_response, admin_reviewed_at, admin_reviewed_by, vendor_id)
  ON public.vendor_applications TO authenticated;

-- ------------------------------------------------------------
-- 8. EXISTING ORDER/ORDER_ITEMS GRANTS (preserved)
--    Keep the authenticated-only access model intact.
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT ON public.order_items TO authenticated;
