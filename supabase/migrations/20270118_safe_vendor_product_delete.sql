-- Safe physical deletion of live vendor products.
-- Order-item snapshots (name, price, icon, qty, vendor_id) remain authoritative
-- for history; only the optional live product relationship is detached.

ALTER TABLE public.order_items ALTER COLUMN product_id DROP NOT NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, n.nspname, t.relname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.products'::regclass
      AND t.relname = 'order_items'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', r.nspname, r.relname, r.conname);
    EXECUTE format('ALTER TABLE public.order_items ADD CONSTRAINT %I FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.order_replacements
  ALTER COLUMN original_product_id DROP NOT NULL,
  ALTER COLUMN replacement_product_id DROP NOT NULL;
ALTER TABLE public.order_items ALTER COLUMN final_product_id DROP NOT NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, t.relname, a.attname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.products'::regclass
      AND NOT (t.relname = 'order_items' AND a.attname = 'product_id')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.relname, r.conname);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.products(id) ON DELETE SET NULL', r.relname, r.conname, r.attname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.delete_vendor_product(p_product_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_vendor text; v_active_refs integer; v_deleted integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT vendor_id INTO v_vendor FROM profiles WHERE id = auth.uid();
  IF v_vendor IS NULL THEN RAISE EXCEPTION 'no vendor storefront is assigned'; END IF;
  SELECT count(*) INTO v_active_refs
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
   WHERE oi.product_id = p_product_id
     AND o.status NOT IN ('Delivered','Rated','Cancelled');
  IF v_active_refs > 0 THEN RAISE EXCEPTION 'product cannot be deleted while active orders remain'; END IF;
  DELETE FROM products WHERE id = p_product_id AND vendor_id = v_vendor;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'product not found or not owned by this vendor'; END IF;
  RETURN jsonb_build_object('deleted', true, 'product_id', p_product_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_vendor_product(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_vendor_product(integer) TO authenticated;
