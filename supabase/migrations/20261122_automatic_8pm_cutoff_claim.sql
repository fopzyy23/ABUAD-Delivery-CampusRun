-- Phase E1: scheduler-safe order claims for the configured 8 PM cutoff.
-- This migration does not execute cancellations, transfers, or refunds.
--
-- Rider acceptance is authoritative only when orders.rider_id is non-NULL.
-- The future cancellation worker must SELECT the claimed order FOR UPDATE and
-- re-check rider_id IS NULL in the same transaction immediately before calling
-- the existing cancellation/reimbursement flow.

CREATE TABLE IF NOT EXISTS public.automatic_cutoff_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  status text NOT NULL DEFAULT 'claimed'
    CHECK (status IN ('claimed','processing','completed','failed','expired')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_automatic_cutoff_claim_active_order
  ON public.automatic_cutoff_claims(order_id)
  WHERE status IN ('claimed','processing');

CREATE INDEX IF NOT EXISTS idx_automatic_cutoff_claims_lease
  ON public.automatic_cutoff_claims(status, lease_until);

CREATE OR REPLACE FUNCTION public.claim_automatic_8pm_cutoff_orders(p_batch_size integer DEFAULT 50)
RETURNS TABLE (claim_id uuid, order_id uuid, claimed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timezone text;
  v_now timestamp;
  v_cutoff time;
  v_batch_size integer := LEAST(GREATEST(COALESCE(p_batch_size, 50), 1), 250);
  v_order public.orders%ROWTYPE;
  v_claim public.automatic_cutoff_claims%ROWTYPE;
BEGIN
  -- EXECUTE is granted only to the server-side worker below. Keep this check
  -- explicit so a future grant cannot accidentally make this callable by users.
  IF session_user <> 'service_role' THEN
    RAISE EXCEPTION 'automatic cutoff claims require service_role';
  END IF;

  SELECT COALESCE(NULLIF(trim(s.timezone), ''), 'Africa/Lagos'),
         CASE
           WHEN EXTRACT(ISODOW FROM (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(trim(s.timezone), ''), 'Africa/Lagos'))) BETWEEN 1 AND 5
             THEN s.weekday_delivery_end
           ELSE s.weekend_delivery_end
         END
    INTO v_timezone, v_cutoff
    FROM public.site_settings s
   WHERE s.id = 1;

  v_timezone := COALESCE(v_timezone, 'Africa/Lagos');
  v_cutoff := COALESCE(v_cutoff, '20:00'::time);
  v_now := CURRENT_TIMESTAMP AT TIME ZONE v_timezone;

  IF v_now::time < v_cutoff THEN
    RETURN;
  END IF;

  -- Expire abandoned leases. This does not touch orders or financial state;
  -- an order is re-eligible only if it is still otherwise cancellable below.
  UPDATE public.automatic_cutoff_claims
     SET status = 'expired', updated_at = now()
   WHERE status IN ('claimed','processing')
     AND lease_until <= CURRENT_TIMESTAMP;

  FOR v_order IN
    SELECT o.*
     FROM public.orders o
     WHERE o.status IN ('Order confirmed','Preparing')
       AND o.rider_id IS NULL
       AND (
         (
           o.request_type = 'restaurant'
           AND o.delivery_method = 'rider'
           AND o.payment_status = 'success'
         )
         OR
         (
           o.request_type = 'vendor_request'
           AND o.delivery_method = 'rider'
           AND o.vendor_delivery_requested = true
           AND o.delivery_payment_status = 'success'
         )
       )
       AND o.cancellation_stage = 'none'
       AND o.cancellation_requested_at IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM public.cancellations c
          WHERE c.order_id = o.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.automatic_cutoff_claims ac
          WHERE ac.order_id = o.id
            AND ac.status IN ('claimed','processing')
            AND ac.lease_until > CURRENT_TIMESTAMP
       )
     ORDER BY o.created_at, o.id
     FOR UPDATE OF o SKIP LOCKED
     LIMIT v_batch_size
  LOOP
    INSERT INTO public.automatic_cutoff_claims(order_id)
    VALUES (v_order.id)
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_claim;

    IF FOUND THEN
      claim_id := v_claim.id;
      order_id := v_claim.order_id;
      claimed_at := v_claim.claimed_at;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_automatic_8pm_cutoff_orders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_automatic_8pm_cutoff_orders(integer) TO service_role;

REVOKE ALL ON TABLE public.automatic_cutoff_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.automatic_cutoff_claims TO service_role;
