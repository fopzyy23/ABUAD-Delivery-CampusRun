-- ============================================================
-- 20260908_order_identifier_uniqueness.sql
-- PRE-PAYSTACK BLOCKER B2 — order/payment identifier uniqueness
-- ============================================================
-- 1. AUDIT (logged via NOTICE/WARNING, nothing destroyed):
--      * NULL / blank order_number rows
--      * duplicate order_number values
--      * duplicate non-null transaction_id values
-- 2. SAFE LEGACY RESOLUTION (only what the audit actually finds; every
--    row is PRESERVED — only the conflicting identifier value changes):
--      * NULL/blank order_number  -> deterministic 'CR-<md5(id:attempt)>'
--        replacement, collision-checked against the live table.
--      * duplicate order_number   -> the EARLIEST order (created_at, id)
--        keeps the number untouched; later duplicates get
--        '<original>-<md5(id:attempt)[:6]>' (collision-checked).
--      * blank transaction_id     -> NULL (a blank carries no payment
--        data; this stops blank-string duplicates).
--      * duplicate non-null transaction_id -> the earliest row keeps the
--        id; later duplicates are set to NULL with a WARNING (rows and
--        all other data kept).
--    The renames run with the B1 server-side GUC
--    (app.order_server_update) set transaction-locally, since the B1
--    trigger correctly blocks order_number/transaction_id changes from
--    every client role.
-- 3. CONSTRAINTS / INDEXES (added only after the audit is clean):
--      * orders_order_number_key  UNIQUE (order_number)  + NOT NULL
--      * orders_transaction_id_uniq  partial UNIQUE index on
--        (transaction_id) WHERE transaction_id IS NOT NULL
--      * orders_payment_reference_key  re-asserted (idempotent) — the
--        20260902 UNIQUE (payment_reference) constraint must stay.
-- 4. place_order(): order-number generation becomes collision-safe —
--    generate -> existence-check -> bounded retry, with the new UNIQUE
--    constraint as the atomic final guarantee.
--
-- NOT done here: no Paystack code, no settlement tables, no 80/20
-- changes, no frontend changes, no RLS changes, no row deletions, no
-- DROP COLUMN, no TRUNCATE.
-- ============================================================

-- ------------------------------------------------------------
-- 1 + 2. Audit and safe legacy resolution.
-- ------------------------------------------------------------
DO $$
DECLARE
  r               RECORD;
  v_null_blank    integer;
  v_dup_groups    integer;
  v_dup_txn_groups integer;
  v_new           text;
  v_attempt       integer;
BEGIN
  -- The B1 trigger protects order_number / payment columns from every
  -- client role. This is server-side maintenance code, so it opts in
  -- with the transaction-local GUC (clients can NOT set GUCs through
  -- PostgREST). The flag dies with this transaction.
  PERFORM set_config('app.order_server_update', 'on', true);

  -- ---------------- AUDIT ----------------
  SELECT count(*) INTO v_null_blank
  FROM public.orders
  WHERE order_number IS NULL OR btrim(order_number) = '';

  SELECT count(*) INTO v_dup_groups
  FROM (
    SELECT order_number
    FROM public.orders
    WHERE order_number IS NOT NULL
    GROUP BY order_number
    HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO v_dup_txn_groups
  FROM (
    SELECT transaction_id
    FROM public.orders
    WHERE transaction_id IS NOT NULL AND btrim(transaction_id) <> ''
    GROUP BY transaction_id
    HAVING count(*) > 1
  ) d;

  RAISE NOTICE 'B2 AUDIT: % NULL/blank order_number(s); % duplicate order_number group(s); % duplicate transaction_id group(s)',
    v_null_blank, v_dup_groups, v_dup_txn_groups;

  -- -------- Resolve NULL / blank order_number --------
  FOR r IN
    SELECT o.id
    FROM public.orders o
    WHERE o.order_number IS NULL OR btrim(o.order_number) = ''
    ORDER BY o.created_at, o.id
  LOOP
    v_attempt := 0;
    LOOP
      v_new := 'CR-' || upper(substr(md5('legacy:' || r.id::text || ':' || v_attempt::text), 1, 12));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders po WHERE po.order_number = v_new);
      v_attempt := v_attempt + 1;
    END LOOP;
    UPDATE public.orders SET order_number = v_new WHERE id = r.id;
    RAISE NOTICE 'B2: order % had a NULL/blank order_number; assigned %', r.id, v_new;
  END LOOP;

  -- -------- Resolve duplicate order_number --------
  -- Keep the EARLIEST row's number untouched; deterministically rename
  -- the later duplicates (never touching any other column).
  -- NOTE: created_at must be projected by the subquery (and every
  -- column qualified) — the outer ORDER BY can only see what the
  -- subquery selects, which is what caused the original
  -- 'column "created_at" does not exist' error.
  FOR r IN
    SELECT ranked.id, ranked.order_number
    FROM (
      SELECT o.id,
             o.order_number,
             o.created_at,
             row_number() OVER (PARTITION BY o.order_number ORDER BY o.created_at, o.id) AS rn
      FROM public.orders o
      WHERE o.order_number IS NOT NULL
    ) ranked
    WHERE ranked.rn > 1
    ORDER BY ranked.order_number, ranked.created_at, ranked.id
  LOOP
    v_attempt := 0;
    LOOP
      v_new := r.order_number || '-' || upper(substr(md5('dup:' || r.id::text || ':' || v_attempt::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders po WHERE po.order_number = v_new);
      v_attempt := v_attempt + 1;
    END LOOP;
    UPDATE public.orders SET order_number = v_new WHERE id = r.id;
    RAISE WARNING 'B2: duplicate order_number "%" on order % renamed to % (row preserved)',
      r.order_number, r.id, v_new;
  END LOOP;

  -- -------- Blank transaction_id -> NULL --------
  UPDATE public.orders
  SET transaction_id = NULL
  WHERE transaction_id IS NOT NULL AND btrim(transaction_id) = '';

  -- -------- Duplicate non-null transaction_id --------
  -- Keep the earliest row's id; clear later duplicates. Rows (and all
  -- other data, including payment_reference) are preserved.
  FOR r IN
    SELECT ranked.id, ranked.transaction_id
    FROM (
      SELECT o.id,
             o.transaction_id,
             row_number() OVER (PARTITION BY o.transaction_id ORDER BY o.created_at, o.id) AS rn
      FROM public.orders o
      WHERE o.transaction_id IS NOT NULL AND btrim(o.transaction_id) <> ''
    ) ranked
    WHERE ranked.rn > 1
  LOOP
    UPDATE public.orders SET transaction_id = NULL WHERE id = r.id;
    RAISE WARNING 'B2: duplicate transaction_id "%" on order % cleared (row preserved)',
      r.transaction_id, r.id;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Constraints / indexes (safe now: the audit is clean).
-- ------------------------------------------------------------

-- 3a. order_number: every row now has a real value -> make it UNIQUE
--     and NOT NULL so duplicate/NULL order numbers are impossible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE order_number IS NULL) THEN
    RAISE EXCEPTION 'orders.order_number still contains NULLs after B2 resolution';
  END IF;
END $$;

ALTER TABLE public.orders ALTER COLUMN order_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_number_key'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
END $$;

-- 3b. transaction_id: UNIQUE whenever present (NULLs still allowed —
--     an order with no payment attempt yet). A partial UNIQUE index is
--     the correct tool; it also covers the legacy '' case because
--     blanks were normalized to NULL above.
CREATE UNIQUE INDEX IF NOT EXISTS orders_transaction_id_uniq
  ON public.orders (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- 3c. payment_reference: re-assert the 20260902 UNIQUE constraint
--     remains in place (idempotent — adds it only if ever missing).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_reference_key'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_reference_key UNIQUE (payment_reference);
  END IF;
END $$;

-- ============================================================
-- SUMMARY
-- ============================================================
-- * Live data audited and preserved; only genuinely conflicting
--   identifier VALUES were deterministically rewritten (with NOTICE/
--   WARNING logs), never deleted.
-- * Duplicate / NULL order numbers are now impossible
--   (UNIQUE + NOT NULL), and place_order() below now generates
--   collision-safe order numbers.
-- * Duplicate non-null transaction_ids are impossible (partial UNIQUE
--   index); payment_reference uniqueness re-asserted.
-- ============================================================

-- ------------------------------------------------------------
-- 4. place_order() — collision-safe order numbers.
--    Identical to the 20260906 body except step 6: the generated
--    order number is now re-checked against the table with bounded
--    retries, and the new orders_order_number_key UNIQUE constraint
--    is the atomic final guarantee (a genuine race aborts the whole
--    RPC atomically — it can never persist a duplicate).
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
  v_user         uuid := auth.uid();
  v_item         jsonb;
  v_qty_text     text;
  v_qty          integer;
  v_expected     integer;
  v_matched      integer;
  v_subtotal     numeric(12,2);
  v_fee          numeric(12,2) := 1000;  -- flat campus delivery fee (unchanged)
  v_total        numeric(12,2);
  v_order_number text;
  v_attempt      integer := 0;
  v_order        public.orders%ROWTYPE;
BEGIN
  -- 0. Authenticated customers only.
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 1. The cart must be a non-empty JSON array (max 50 lines).
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'cart is empty';
  END IF;
  v_expected := jsonb_array_length(p_items);
  IF v_expected > 50 THEN
    RAISE EXCEPTION 'too many cart lines (max 50)';
  END IF;

  -- 2. Validate each line: an id and a whole-number quantity 1..99.
  --    NOTE: the client never sends prices — any such field is ignored.
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

  -- 3. A non-empty delivery spot is required (blocked from later edits by
  --    the existing prevent_order_unauthorized_changes trigger).
  IF p_spot IS NULL OR btrim(p_spot) = '' OR length(p_spot) > 200 THEN
    RAISE EXCEPTION 'a delivery location is required';
  END IF;

  -- 4. Verify EVERY product exists AND is active, using the authoritative
  --    products table. The id is compared as text so this works whatever
  --    the underlying products.id type is. If any product is missing or
  --    inactive the count below will not match and the RPC aborts.
  SELECT count(*) INTO v_matched
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  IF v_matched IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'one or more products are unavailable or no longer exist';
  END IF;

  -- 5. Compute the subtotal from the SAME authoritative join. Prices come
  --    exclusively from products.price — never from the client.
  SELECT COALESCE(SUM(p.price * (li->>'qty')::integer), 0) INTO v_subtotal
  FROM jsonb_array_elements(p_items) AS li
  JOIN public.products p
    ON p.id::text = li->>'id'
   AND p.active = true;

  v_total := v_subtotal + v_fee;

  -- 6. Insert the order (server-side money values + a COLLISION-SAFE
  --    server-generated order number): generate -> existence-check ->
  --    bounded retry, with the orders_order_number_key UNIQUE constraint
  --    as the atomic final guarantee. A genuine race would abort this
  --    whole RPC atomically — it can never persist a duplicate.
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
    order_number, user_id, subtotal, fee, total,
    status, payment_status, spot, delivery_method
  ) VALUES (
    v_order_number, v_user, v_subtotal, v_fee, v_total,
    'Order confirmed', 'pending', p_spot, 'rider'
  )
  RETURNING * INTO v_order;

  -- 7. Insert the order lines with authoritative prices/names/vendors.
  --    trg_enforce_order_item_pricing re-derives them again (defense in
  --    depth) and trg_order_items_notify_vendor notifies the vendor(s).
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

  -- 8. Return the authoritative order + items so the client can display
  --    exactly what was persisted.
  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', (
      SELECT COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb)
      FROM public.order_items oi
      WHERE oi.order_id = v_order.id
    )
  );
END;
$$;

-- Keep the 20260906 grant model exactly as-is: only authenticated
-- users may call the checkout RPC.
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text) FROM PUBLIC;
