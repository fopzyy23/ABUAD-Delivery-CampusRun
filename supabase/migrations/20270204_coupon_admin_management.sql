-- AAL2-protected coupon editing and read-safe usage inspection.

CREATE OR REPLACE FUNCTION public.admin_update_coupon(p_coupon_id uuid,p_type text,p_value numeric,p_starts_at timestamptz,p_expires_at timestamptz,p_usage_limit integer,p_per_user_limit integer,p_first_order_only boolean,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.require_admin_aal2();
  IF p_type NOT IN ('fixed','percentage') OR p_value<=0 OR (p_type='fixed' AND p_value>400) OR (p_type='percentage' AND p_value>100) THEN RAISE EXCEPTION 'invalid coupon'; END IF;
  UPDATE public.coupons SET coupon_type=p_type,fixed_amount=CASE WHEN p_type='fixed' THEN p_value END,percentage=CASE WHEN p_type='percentage' THEN p_value END,starts_at=p_starts_at,expires_at=p_expires_at,usage_limit=p_usage_limit,per_user_limit=GREATEST(1,p_per_user_limit),first_order_only=p_first_order_only,active=p_active WHERE id=p_coupon_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'coupon not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_coupon_usage()
RETURNS TABLE(coupon_id uuid,code text,coupon_type text,value numeric,active boolean,starts_at timestamptz,expires_at timestamptz,usage_limit integer,per_user_limit integer,reserved_usage bigint,finalized_usage bigint,remaining_usage bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT c.id,c.code,c.coupon_type,COALESCE(c.fixed_amount,c.percentage),c.active,c.starts_at,c.expires_at,c.usage_limit,c.per_user_limit,
    count(*) FILTER (WHERE r.status='reserved'),count(*) FILTER (WHERE r.status='finalized'),
    CASE WHEN c.usage_limit IS NULL THEN NULL ELSE GREATEST(c.usage_limit-count(*) FILTER (WHERE r.status IN ('reserved','finalized')),0) END
  FROM public.coupons c LEFT JOIN public.coupon_redemptions r ON r.coupon_id=c.id
  WHERE public.is_admin() GROUP BY c.id;
$$;
REVOKE ALL ON FUNCTION public.admin_update_coupon(uuid,text,numeric,timestamptz,timestamptz,integer,integer,boolean,boolean),public.admin_coupon_usage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_coupon(uuid,text,numeric,timestamptz,timestamptz,integer,integer,boolean,boolean),public.admin_coupon_usage() TO authenticated;
