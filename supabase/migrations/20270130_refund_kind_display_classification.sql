-- Explicitly classify refund rows for customer presentation.
-- This is additive and does not alter payment, RLS, cancellation, or provider logic.
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS refund_kind text NOT NULL DEFAULT 'full_order'
  CHECK (refund_kind IN ('full_order','replacement_adjustment','legacy_unknown'));

-- Existing replacement rows are the only historical rows with an authoritative
-- source marker. Leave all other rows as full_order under the existing refund
-- workflow; unknown future/legacy rows remain safely displayable as full-order.
UPDATE public.refunds
SET refund_kind='replacement_adjustment'
WHERE refund_kind='full_order'
  AND reason ILIKE 'Replacement partial refund:%';

-- Preserve compatibility with the existing replacement trigger until its
-- function is replaced in a later migration. New rows are explicitly marked
-- at insert time by this narrow classification trigger; the UI never parses
-- reason text for current rows.
CREATE OR REPLACE FUNCTION public.classify_refund_kind_on_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.refund_kind IS NULL OR NEW.refund_kind='full_order' THEN
    IF NEW.reason ILIKE 'Replacement partial refund:%' THEN
      NEW.refund_kind := 'replacement_adjustment';
    ELSE
      NEW.refund_kind := 'full_order';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_classify_refund_kind_on_insert ON public.refunds;
CREATE TRIGGER trg_classify_refund_kind_on_insert
BEFORE INSERT ON public.refunds
FOR EACH ROW EXECUTE FUNCTION public.classify_refund_kind_on_insert();
