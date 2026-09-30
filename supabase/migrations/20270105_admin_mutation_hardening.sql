-- Phase 1: secure admin mutation boundaries.
-- No historical order, payment, settlement, or transfer rows are deleted.

CREATE TABLE IF NOT EXISTS public.admin_action_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_action_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_action_audit FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS admin_action_audit_created_idx ON public.admin_action_audit(created_at DESC);

CREATE OR REPLACE FUNCTION public._admin_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb, p_after jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_action_audit(admin_id, action, entity_type, entity_id, before_state, after_state)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
END;
$$;
REVOKE ALL ON FUNCTION public._admin_audit(text,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_order_status(p_order_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.orders%ROWTYPE; v_new public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  IF p_status NOT IN ('Order confirmed','Preparing','Ready for pickup','Rider assigned','Picked up','On the Way','Delivered','Rated','Cancelled') THEN
    RAISE EXCEPTION 'unsupported order status';
  END IF;
  SELECT * INTO v_old FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF v_old.status = p_status THEN RETURN jsonb_build_object('id', p_order_id, 'status', p_status); END IF;
  UPDATE public.orders SET status = p_status WHERE id = p_order_id RETURNING * INTO v_new;
  PERFORM public._admin_audit('update_status','order',p_order_id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN jsonb_build_object('id', p_order_id, 'previous_status', v_old.status, 'status', v_new.status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_order_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_rider_status(p_rider_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.riders%ROWTYPE; v_new public.riders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  IF p_status NOT IN ('pending','approved','rejected','suspended') THEN RAISE EXCEPTION 'unsupported rider status'; END IF;
  SELECT * INTO v_old FROM public.riders WHERE id = p_rider_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rider not found'; END IF;
  IF v_old.status = p_status THEN RETURN jsonb_build_object('id',p_rider_id,'status',p_status); END IF;
  UPDATE public.riders SET status = p_status, available = (p_status = 'approved'), updated_at = now() WHERE id = p_rider_id RETURNING * INTO v_new;
  PERFORM public._admin_audit('set_status','rider',p_rider_id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN jsonb_build_object('id',p_rider_id,'previous_status',v_old.status,'status',v_new.status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_rider_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_rider_status(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_vendor(p_vendor jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.vendors%ROWTYPE; v_new public.vendors%ROWTYPE; v_id text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  v_id := NULLIF(p_vendor->>'id','');
  IF v_id IS NULL OR NULLIF(trim(p_vendor->>'name'),'') IS NULL THEN RAISE EXCEPTION 'vendor id and name are required'; END IF;
  SELECT * INTO v_old FROM public.vendors WHERE id=v_id FOR UPDATE;
  INSERT INTO public.vendors(id,name,icon,type,rating,time,cover,open,delivery_method,image,description,opening_hours)
  VALUES (v_id,trim(p_vendor->>'name'),p_vendor->>'icon',p_vendor->>'type',NULLIF(p_vendor->>'rating','')::numeric,p_vendor->>'time',p_vendor->>'cover',COALESCE((p_vendor->>'open')::boolean,true),COALESCE(NULLIF(p_vendor->>'delivery_method',''),'rider'),p_vendor->>'image',p_vendor->>'description',p_vendor->>'opening_hours')
  ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,icon=EXCLUDED.icon,type=EXCLUDED.type,rating=EXCLUDED.rating,time=EXCLUDED.time,cover=EXCLUDED.cover,open=EXCLUDED.open,delivery_method=EXCLUDED.delivery_method,image=EXCLUDED.image,description=EXCLUDED.description,opening_hours=EXCLUDED.opening_hours
  RETURNING * INTO v_new;
  PERFORM public._admin_audit(CASE WHEN v_old.id IS NULL THEN 'create' ELSE 'update' END,'vendor',v_id,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_vendor(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_vendor(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_product(p_product jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.products%ROWTYPE; v_new public.products%ROWTYPE; v_id integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  v_id := NULLIF(p_product->>'id','')::integer;
  IF NULLIF(trim(p_product->>'name'),'') IS NULL OR NULLIF(p_product->>'vendor_id','') IS NULL OR (p_product->>'price')::numeric < 0 THEN RAISE EXCEPTION 'invalid product fields'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id=p_product->>'vendor_id') THEN RAISE EXCEPTION 'vendor not found'; END IF;
  IF v_id IS NOT NULL THEN SELECT * INTO v_old FROM public.products WHERE id=v_id FOR UPDATE; END IF;
  INSERT INTO public.products(id,vendor_id,name,"desc",price,icon,category,active,image)
  VALUES (COALESCE(v_id,nextval('public.products_id_seq')),p_product->>'vendor_id',trim(p_product->>'name'),p_product->>'desc',(p_product->>'price')::numeric,p_product->>'icon',p_product->>'category',COALESCE((p_product->>'active')::boolean,true),p_product->>'image')
  ON CONFLICT (id) DO UPDATE SET vendor_id=EXCLUDED.vendor_id,name=EXCLUDED.name,"desc"=EXCLUDED."desc",price=EXCLUDED.price,icon=EXCLUDED.icon,category=EXCLUDED.category,active=EXCLUDED.active,image=EXCLUDED.image
  RETURNING * INTO v_new;
  PERFORM public._admin_audit(CASE WHEN v_old.id IS NULL THEN 'create' ELSE 'update' END,'product',v_new.id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_product(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_product(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_deactivate_product(p_product_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.products%ROWTYPE; v_new public.products%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF; PERFORM public.require_admin_aal2();
  SELECT * INTO v_old FROM public.products WHERE id=p_product_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;
  UPDATE public.products SET active=false WHERE id=p_product_id RETURNING * INTO v_new;
  PERFORM public._admin_audit('deactivate','product',p_product_id::text,to_jsonb(v_old),to_jsonb(v_new)); RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.admin_deactivate_product(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_deactivate_product(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(p_withdrawal_id bigint, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.withdrawal_requests%ROWTYPE; v_new public.withdrawal_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF; PERFORM public.require_admin_aal2();
  SELECT * INTO v_old FROM public.withdrawal_requests WHERE id=p_withdrawal_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal not found'; END IF;
  IF v_old.status NOT IN ('pending','approved') THEN RAISE EXCEPTION 'withdrawal cannot be rejected from status %',v_old.status; END IF;
  UPDATE public.withdrawal_requests SET status='rejected',reviewed_at=now(),reviewed_by=auth.uid(),admin_note=NULLIF(trim(p_note),'') WHERE id=p_withdrawal_id RETURNING * INTO v_new;
  PERFORM public._admin_audit('reject','withdrawal',p_withdrawal_id::text,to_jsonb(v_old),to_jsonb(v_new)); RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.admin_reject_withdrawal(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal(bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_maintenance_mode(p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  SELECT maintenance_mode INTO v_old FROM public.site_settings WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'site settings not found'; END IF;
  UPDATE public.site_settings SET maintenance_mode=COALESCE(p_enabled,false) WHERE id=1;
  PERFORM public._admin_audit('set_maintenance_mode','site_settings','1',jsonb_build_object('maintenance_mode',v_old),jsonb_build_object('maintenance_mode',COALESCE(p_enabled,false)));
  RETURN COALESCE(p_enabled,false);
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_maintenance_mode(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_maintenance_mode(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_vendor_application(
  p_application_id uuid, p_status text, p_response text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.vendor_applications%ROWTYPE; v_new public.vendor_applications%ROWTYPE;
DECLARE v_vendor_id text; v_vendor jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin authorization required'; END IF;
  PERFORM public.require_admin_aal2();
  IF p_status NOT IN ('Pending','Approved','Rejected') THEN RAISE EXCEPTION 'unsupported application status'; END IF;
  SELECT * INTO v_old FROM public.vendor_applications WHERE id=p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vendor application not found'; END IF;
  IF v_old.status='Pending' AND p_status NOT IN ('Approved','Rejected') THEN RAISE EXCEPTION 'pending applications must be approved or rejected'; END IF;
  IF v_old.status='Approved' AND p_status<>'Approved' THEN RAISE EXCEPTION 'approved applications cannot be reopened or rejected'; END IF;
  IF v_old.status='Rejected' AND p_status='Approved' AND v_old.vendor_id IS NULL THEN RAISE EXCEPTION 'rejected application must be reopened before approval'; END IF;
  v_vendor_id := v_old.vendor_id;
  IF p_status='Approved' THEN
    IF v_vendor_id IS NULL THEN
      v_vendor_id := left(regexp_replace(lower(coalesce(v_old.full_name,'vendor')),'[^a-z0-9]+','-','g'),40) || '-' || left(v_old.user_id::text,6);
      IF EXISTS (SELECT 1 FROM public.vendors WHERE id=v_vendor_id) THEN RAISE EXCEPTION 'generated vendor id already exists; resolve the application manually'; END IF;
      v_vendor := jsonb_build_object('id',v_vendor_id,'name',v_old.full_name,'icon','🛍️','type','Vendor','rating','4.5','time','15–25 min','cover','#d9f5e9','open',true,'delivery_method','rider','description',left(coalesce(v_old.what_they_want_to_sell,''),200));
      PERFORM public.admin_upsert_vendor(v_vendor);
    END IF;
    PERFORM public.assign_user_to_vendor(v_old.user_id,v_vendor_id);
  END IF;
  UPDATE public.vendor_applications SET status=p_status,vendor_id=CASE WHEN p_status='Approved' THEN v_vendor_id ELSE vendor_id END,admin_response=COALESCE(NULLIF(trim(p_response),''),admin_response),admin_reviewed_at=now(),admin_reviewed_by=auth.uid() WHERE id=p_application_id RETURNING * INTO v_new;
  PERFORM public._admin_audit('review','vendor_application',p_application_id::text,to_jsonb(v_old),to_jsonb(v_new));
  RETURN to_jsonb(v_new);
END; $$;
REVOKE ALL ON FUNCTION public.admin_review_vendor_application(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_vendor_application(uuid,text,text) TO authenticated;
