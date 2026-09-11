-- ============================================================
-- Dropzyy — Vendor Applications + Delivery Fee Update
-- ============================================================
-- Coordinated change set:
--   1. vendor_applications table (structured vendor intake,
--      mirrors the existing riders table architecture)
--   2. Extend riders with student-identification fields
--   3. Extend orders with delivery-fee split columns
--   4. Update place_order RPC: fee 1000 -> 1500, split 1000/500
--   5. Update generate_settlement to use the stored split
--   6. Backfill existing orders (preserve historical fee)
--   7. RLS policies + grants
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

-- ------------------------------------------------------------
-- 2. EXTEND RIDERS TABLE
--    Add student-identification fields to match the vendor
--    application intake. Existing rows keep NULL (backfilled
--    by the applicant on next submission).
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
END$$;

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
END$$;

-- Constraint: split must sum to fee (when both are set)
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
      );
  END IF;
END$$;

-- ------------------------------------------------------------
-- 4. BACKFILL EXISTING ORDERS
--    Preserve historical fee records: existing orders keep
--    their original fee, and the split is backfilled to match
--    the previous 80/20 model (rider = 80%, company = 20%).
--    Only touches rows where the split columns are still NULL.
-- ------------------------------------------------------------
UPDATE public.orders
SET
  rider_delivery_share = round(fee * 0.8, 2),
  company_delivery_share = fee - round(fee * 0.8, 2)
WHERE rider_delivery_share IS NULL
  AND company_delivery_share IS NULL
  AND fee IS NOT NULL;

-- ------------------------------------------------------------
-- 5. UPDATED_AT TRIGGER for vendor_applications
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_vendor_applications_updated_at
  ON public.vendor_applications;
CREATE TRIGGER trg_vendor_applications_updated_at
  BEFORE UPDATE ON public.vendor_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- 6. RLS — VENDOR APPLICATIONS
-- ------------------------------------------------------------
ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;

-- Applicants can submit their own application
DROP POLICY IF EXISTS "vendor_applications_insert_own"
  ON public.vendor_applications;
CREATE POLICY "vendor_applications_insert_own"
  ON public.vendor_applications
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'Pending'
    AND admin_response IS NULL
    AND admin_reviewed_by IS NULL
  );

-- Applicants can view only their own application
DROP POLICY IF EXISTS "vendor_applications_select_own"
  ON public.vendor_applications;
CREATE POLICY "vendor_applications_select_own"
  ON public.vendor_applications
  FOR SELECT
  USING (user_id = auth.uid());

-- Admins can view all applications
DROP POLICY IF EXISTS "vendor_applications_select_admin"
  ON public.vendor_applications;
CREATE POLICY "vendor_applications_select_admin"
  ON public.vendor_applications
  FOR SELECT
  USING (public.is_admin());

-- Admins can update (approve/reject/status/response)
DROP POLICY IF EXISTS "vendor_applications_update_admin"
  ON public.vendor_applications;
CREATE POLICY "vendor_applications_update_admin"
  ON public.vendor_applications
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE policy — application records are retained for audit

GRANT SELECT, INSERT ON public.vendor_applications TO authenticated;
GRANT UPDATE (status, vendor_id, admin_response, admin_reviewed_at, admin_reviewed_by)
  ON public.vendor_applications TO authenticated;
REVOKE ALL ON public.vendor_applications FROM anon;
REVOKE ALL ON public.vendor_applications FROM PUBLIC;

-- ------------------------------------------------------------
-- 7. RE-DECLARE place_order RPC
--    Fee: 1000 -> 1500. Split: rider 1000, company 500.
--    The server is authoritative — client cannot influence these.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_spot  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user                uuid := auth.uid();
  v_item                jsonb;
  v_qty_text            text;
  v_qty                 integer;
  v_expected            integer;
  v_matched             integer;
  v_subtotal            numeric(12,2);
  v_fee                 numeric(12,2) := 1500;
  v_rider_share         numeric(12,2) := 1000;
  v_company_share       numeric(12,2) := 500;
  v_total               numeric(12,2);
  v_order_number        text;
  v_order               public.orders%ROWTYPE;
  v_attempt             integer := 0;
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
    IF v_qty_text IS NULL OR v_qty_text !~ '^[0-9]+$' THEN
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
  JOIN public.products p ON p.id::text = li->>'id' AND p.active = true;
  IF v_matched IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'one or more products are unavailable or no longer exist';
  END IF;
  SELECT COALESCE(SUM(p.price * (li->>'qty')::integer), 0) INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p ON p.id::text = li->>'id' AND p.active = true;
  v_total := v_subtotal + v_fee;
  LOOP
    v_attempt := v_attempt + 1;
    v_order_number := 'CR-' || upper(substr(md5(random()::text), 1, 4)) || '-' || to_char(now(), 'MMDD');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = v_order_number);
    IF v_attempt > 10 THEN
      RAISE EXCEPTION 'could not generate a unique order number';
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
  INSERT INTO public.order_items (order_id, product_id, qty, price)
  SELECT v_order.id, (li->>'id')::text, (li->>'qty')::integer, p.price
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p ON p.id::text = li->>'id' AND p.active = true;
  RETURN jsonb_build_object('order', to_jsonb(v_order));
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM PUBLIC;

-- ------------------------------------------------------------
-- 8. RE-DECLARE generate_settlement RPC
--    Use the stored split columns (rider_delivery_share,
--    company_delivery_share) instead of computing 80/20 from fee.
--    New orders carry the 1000/500 split; historical orders
--    carry their backfilled 80/20 values — both are honored.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_settlement(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Use the authoritative stored split columns. New orders carry
  -- rider 1000 / company 500; historical rows carry their backfilled
  -- 80/20 split. Both are honored exactly as stored.
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
$$;

GRANT EXECUTE ON FUNCTION public.generate_settlement(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_settlement(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_settlement(uuid) FROM PUBLIC;