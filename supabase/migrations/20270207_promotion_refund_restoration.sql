-- Phase 5: restore finalized delivery promotions after a genuine full-order
-- refund or completed full cancellation reimbursement.
-- Forward-only. Payment success, refund execution, reimbursement execution,
-- settlement, RLS, and Paystack authority remain unchanged.

ALTER TABLE public.coupon_redemptions
  DROP CONSTRAINT IF EXISTS coupon_redemptions_status_check;
ALTER TABLE public.coupon_redemptions
  ADD CONSTRAINT coupon_redemptions_status_check
  CHECK (status IN ('reserved','finalized','released','reversed'));

CREATE TABLE IF NOT EXISTS public.promotion_restorations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  promotion_reservation_id uuid NOT NULL UNIQUE REFERENCES public.promotion_reservations(id),
  promotion_type text NOT NULL CHECK (promotion_type IN ('credit','coupon')),
  amount_restored numeric(12,2) NOT NULL CHECK (amount_restored > 0),
  source_type text NOT NULL CHECK (source_type IN ('refund','reimbursement')),
  source_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'restored' CHECK (status IN ('restored')),
  restored_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id)
);

ALTER TABLE public.promotion_restorations ENABLE ROW LEVEL SECURITY;
CREATE POLICY promotion_restorations_read_own ON public.promotion_restorations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id=order_id AND o.user_id=auth.uid()));
REVOKE ALL ON public.promotion_restorations FROM anon,authenticated;
GRANT SELECT ON public.promotion_restorations TO authenticated;

-- This is intentionally not executable by customers. Trusted refund and
-- reimbursement triggers call it after their authoritative terminal state.
CREATE OR REPLACE FUNCTION public.restore_order_promotion_after_full_refund(
  p_order_id uuid, p_source_type text, p_source_id uuid
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  o public.orders%ROWTYPE;
  r public.promotion_reservations%ROWTYPE;
  f public.refunds%ROWTYPE;
  p public.payments%ROWTYPE;
  c public.cancellations%ROWTYPE;
  t public.transfers%ROWTYPE;
  a record;
  expected numeric;
  restored numeric:=0;
  inserted_id uuid;
BEGIN
  IF p_source_type NOT IN ('refund','reimbursement') THEN
    RETURN json_build_object('restored',false,'reason','invalid_source');
  END IF;

  -- Serialize every source retry and every competing financial terminal event
  -- on the order before touching its finalized promotion allocations.
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('restored',false,'reason','order_not_found'); END IF;
  SELECT * INTO r FROM public.promotion_reservations
    WHERE order_id=o.id AND status='finalized'
    ORDER BY finalized_at DESC NULLS LAST, created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('restored',false,'reason','no_finalized_promotion'); END IF;

  IF p_source_type='refund' THEN
    SELECT * INTO f FROM public.refunds
     WHERE id=p_source_id AND order_id=o.id FOR UPDATE;
    IF NOT FOUND OR f.status<>'processed' OR f.refund_kind<>'full_order' THEN
      RETURN json_build_object('restored',false,'reason','refund_not_full_order');
    END IF;
    SELECT * INTO p FROM public.payments WHERE id=f.payment_id AND order_id=o.id FOR UPDATE;
    IF NOT FOUND OR p.payment_type NOT IN ('product','vendor_delivery')
       OR p.status NOT IN ('success','refunded') THEN
      RETURN json_build_object('restored',false,'reason','payment_not_authoritative');
    END IF;
    expected:=CASE WHEN p.payment_type='vendor_delivery'
      THEN COALESCE(o.customer_delivery_charge,o.base_delivery_fee,o.fee)
      ELSE COALESCE(o.final_order_total,o.total) END;
    IF expected IS NULL OR ABS(f.amount-expected)>0.01 OR ABS(p.amount-expected)>0.01 THEN
      RETURN json_build_object('restored',false,'reason','refund_not_full_amount');
    END IF;
  ELSE
    SELECT * INTO c FROM public.cancellations
     WHERE id=p_source_id AND order_id=o.id AND stage='reimbursed' FOR UPDATE;
    IF NOT FOUND THEN RETURN json_build_object('restored',false,'reason','reimbursement_not_complete'); END IF;
    SELECT * INTO t FROM public.transfers
     WHERE cancellation_id=c.id AND transfer_kind='customer_reimbursement' AND status='success'
     ORDER BY attempt_no DESC NULLS LAST, created_at DESC LIMIT 1 FOR UPDATE;
    expected:=COALESCE(o.final_order_total,o.total);
    IF NOT FOUND OR expected IS NULL OR c.reimbursement_amount IS NULL
       OR ABS(c.reimbursement_amount-expected)>0.01 OR ABS(t.amount-expected)>0.01 THEN
      RETURN json_build_object('restored',false,'reason','reimbursement_not_full_amount');
    END IF;
  END IF;

  -- The unique order/reservation/source keys make retries harmless. The row is
  -- inserted before balances are changed so only the winning transaction can
  -- perform the restoration.
  INSERT INTO public.promotion_restorations
    (order_id,promotion_reservation_id,promotion_type,amount_restored,source_type,source_id,reason)
  VALUES (o.id,r.id,r.promotion_type,r.discount_amount,p_source_type,p_source_id,
          CASE WHEN p_source_type='refund' THEN 'Full order refund completed' ELSE 'Full cancellation reimbursement completed' END)
  ON CONFLICT DO NOTHING
  RETURNING id INTO inserted_id;
  IF inserted_id IS NULL THEN
    RETURN json_build_object('restored',false,'already_restored',true);
  END IF;

  IF r.promotion_type='credit' THEN
    FOR a IN SELECT * FROM public.credit_reservation_allocations
      WHERE reservation_id=r.id ORDER BY ledger_id FOR UPDATE LOOP
      UPDATE public.customer_credit_ledger
      SET remaining_amount=COALESCE(remaining_amount,0)+a.amount,
          status=CASE WHEN expires_at IS NOT NULL AND expires_at<=now() THEN 'expired' ELSE 'available' END
      WHERE id=a.ledger_id;
      restored:=restored+a.amount;
    END LOOP;
    IF restored<=0 THEN RAISE EXCEPTION 'finalized credit promotion has no allocations'; END IF;
    INSERT INTO public.notifications(user_id,title,message,type)
    VALUES(o.user_id,'Dropzyy credit restored',
      '₦'||to_char(restored,'FM999999990.00')||' promotional credit from your refunded order has been restored. Expired portions remain unavailable.','info');
  ELSE
    UPDATE public.coupon_redemptions
       SET status='reversed'
     WHERE coupon_id=r.source_id AND order_id=o.id AND status='finalized';
    IF NOT FOUND THEN RAISE EXCEPTION 'finalized coupon promotion has no redemption'; END IF;
    INSERT INTO public.notifications(user_id,title,message,type)
    VALUES(o.user_id,'Coupon restored','Your coupon use on the refunded order has been reversed.','info');
    restored:=r.discount_amount;
  END IF;
  RETURN json_build_object('restored',true,'amount',restored,'promotion_type',r.promotion_type);
END; $$;

REVOKE ALL ON FUNCTION public.restore_order_promotion_after_full_refund(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_order_promotion_after_full_refund(uuid,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_restore_promotion_after_refund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='processed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.restore_order_promotion_after_full_refund(NEW.order_id,'refund',NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_restore_promotion_after_refund ON public.refunds;
CREATE TRIGGER trg_restore_promotion_after_refund
  AFTER UPDATE OF status ON public.refunds FOR EACH ROW
  EXECUTE FUNCTION public.trg_restore_promotion_after_refund();

CREATE OR REPLACE FUNCTION public.trg_restore_promotion_after_reimbursement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE oid uuid;
BEGIN
  IF NEW.transfer_kind='customer_reimbursement' AND NEW.status='success'
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT order_id INTO oid FROM public.cancellations WHERE id=NEW.cancellation_id;
    IF oid IS NOT NULL THEN
      PERFORM public.restore_order_promotion_after_full_refund(oid,'reimbursement',NEW.cancellation_id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_restore_promotion_after_reimbursement ON public.transfers;
CREATE TRIGGER trg_restore_promotion_after_reimbursement
  AFTER UPDATE OF status ON public.transfers FOR EACH ROW
  WHEN (NEW.transfer_kind='customer_reimbursement')
  EXECUTE FUNCTION public.trg_restore_promotion_after_reimbursement();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='customer_credit_ledger') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_credit_ledger;
  END IF;
END $$;
