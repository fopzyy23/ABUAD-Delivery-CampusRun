-- 20260915_drop_obsolete_pending_payment.sql
-- Fix: remove obsolete 4-parameter overload of create_pending_payment so
-- the 6-parameter version is unambiguous when the frontend calls it.

DO $$
BEGIN
  -- Drop the obsolete 4-parameter overload if it exists.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_pending_payment'
      AND pg_get_function_arguments(p.oid) = 'p_order_id uuid, p_reference text, p_amount numeric, p_currency text'
  ) THEN
    DROP FUNCTION public.create_pending_payment(p_order_id uuid, p_reference text, p_amount numeric, p_currency text);
    RAISE NOTICE 'Dropped obsolete 4-parameter create_pending_payment overload';
  END IF;
END $$;