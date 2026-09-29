-- Rate an assigned rider and mark the delivered order Rated in one transaction.
CREATE OR REPLACE FUNCTION public.submit_rider_rating(
  p_order_id uuid, p_rating integer, p_review text DEFAULT ''
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'rating must be between 1 and 5'; END IF;
  IF length(COALESCE(p_review, '')) > 500 THEN RAISE EXCEPTION 'review is too long'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.user_id IS DISTINCT FROM auth.uid()
     OR v_order.status <> 'Delivered' OR v_order.rider_id IS NULL THEN
    RAISE EXCEPTION 'this delivery cannot be rated';
  END IF;
  INSERT INTO public.rider_ratings(order_id, rider_id, reviewer_id, rating, review)
  VALUES(v_order.id, v_order.rider_id, auth.uid(), p_rating, COALESCE(p_review, ''));
  UPDATE public.orders SET status = 'Rated' WHERE id = v_order.id;
END; $$;
REVOKE ALL ON FUNCTION public.submit_rider_rating(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rider_rating(uuid,integer,text) TO authenticated;
