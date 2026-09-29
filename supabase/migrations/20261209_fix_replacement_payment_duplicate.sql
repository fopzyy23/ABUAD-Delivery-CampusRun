-- ============================================================
-- 20261209_fix_replacement_payment_duplicate.sql
-- ============================================================
-- Fixes the duplicate pending payment creation issue.
--
-- The create_replacement_payment_obligation function already creates
-- the payment row. The store_replacement_payment_checkout function
-- was also inserting a new payment row, causing a unique constraint
-- violation on uq_replacement_payment_active.
--
-- This migration changes store_replacement_payment_checkout to UPDATE
-- the existing obligation payment row instead of INSERTing a new one.
-- ============================================================

-- Drop and recreate store_replacement_payment_checkout to UPDATE existing obligation
CREATE OR REPLACE FUNCTION public.store_replacement_payment_checkout(
  p_order_id uuid,
  p_reference text,
  p_amount numeric,
  p_authorization_url text,
  p_access_code text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  id uuid;
  o public.orders%ROWTYPE;
  p public.payments%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.additional_amount_due IS DISTINCT FROM p_amount THEN
    RAISE EXCEPTION 'replacement amount mismatch';
  END IF;

  -- Find the existing obligation payment row (created by create_replacement_payment_obligation)
  SELECT * INTO p
  FROM public.payments
  WHERE replacement_obligation_id = o.id
    AND status IN ('pending', 'success')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Update the existing obligation payment with checkout details
    UPDATE public.payments
    SET
      reference = p_reference,
      authorization_url = p_authorization_url,
      access_code = p_access_code,
      updated_at = now()
    WHERE id = p.id;
    RETURN p.id;
  ELSE
    -- Fallback: if no obligation exists yet (shouldn't happen in normal flow),
    -- create a new payment row. This maintains backward compatibility.
    INSERT INTO public.payments (
      order_id, reference, amount, currency, status, payment_type,
      replacement_obligation_id, authorization_url, access_code
    ) VALUES (
      p_order_id, p_reference, p_amount, 'NGN', 'pending', 'replacement',
      p_order_id, p_authorization_url, p_access_code
    ) RETURNING id INTO id;
    RETURN id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.store_replacement_payment_checkout(uuid, text, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_replacement_payment_checkout(uuid, text, numeric, text, text) TO service_role;