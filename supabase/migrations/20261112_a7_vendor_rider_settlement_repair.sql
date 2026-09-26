-- 20261112_a7_vendor_rider_settlement_repair.sql
-- A7 repair: restore the missing vendor-rider entry condition in
-- auto_settle_delivered_order().
--
-- Regression: 20261107 (carried forward by 20261109) required
--   NEW.status = 'Delivered' AND NEW.payment_status = 'success'
-- but vendor orders are created with payment_status = 'pending_vendor'
-- (create_vendor_order_request) and the vendor-paid delivery fee only writes
-- orders.delivery_payment_status (handle_vendor_delivery_payment_success).
-- payment_status never becomes 'success' for vendor orders, so completed
-- vendor-rider deliveries never entered the settlement path: no
-- delivery_settlements row, no rider share, no Phase 8A daily bonus.
--
-- Repair: restore the vendor-rider branch that existed in the 20261013
-- definition, gated on the same authoritative order fields that
-- _settle_order_core() itself enforces for vendor requests. Restaurant keeps
-- the product-payment gate; vendor-self has no branch (a vendor-self order
-- creates no Dropzyy rider settlement).
--
-- Append-only: only this trigger function is re-declared. _settle_order_core()
-- (row locks, idempotency, ON CONFLICT), settlement/transfer/withdrawal
-- reconciliation, and _award_rider_daily_bonus() are untouched. The trigger
-- still delegates to the existing settlement core and still awards the
-- existing daily bonus afterwards.
CREATE OR REPLACE FUNCTION public.auto_settle_delivered_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
BEGIN
  IF NEW.status = 'Delivered'
     AND (
       -- Restaurant order: settle once the product payment succeeded.
       (NEW.request_type = 'restaurant' AND NEW.payment_status = 'success')
       -- Vendor-rider order: product payment stays private ('pending_vendor').
       -- The vendor-paid delivery fee is the authoritative gate, matching the
       -- eligibility conditions _settle_order_core() enforces for vendor requests.
       OR (NEW.request_type = 'vendor_request'
           AND NEW.delivery_method = 'rider'
           AND NEW.vendor_delivery_requested IS TRUE
           AND NEW.delivery_payment_status = 'success')
       -- Vendor-self deliberately has no branch: no rider settlement exists.
     )
     AND (OLD.status IS DISTINCT FROM 'Delivered'
          OR OLD.payment_status IS DISTINCT FROM 'success'
          OR OLD.delivery_payment_status IS DISTINCT FROM 'success') THEN
    PERFORM public._settle_order_core(NEW.id);
    PERFORM public._award_rider_daily_bonus(ds.id)
    FROM public.delivery_settlements ds WHERE ds.order_id = NEW.id;
  END IF;
  RETURN NEW;
END; $func$;
