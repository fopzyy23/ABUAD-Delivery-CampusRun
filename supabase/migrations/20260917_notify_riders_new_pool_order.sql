-- 20260917_notify_riders_new_pool_order.sql
-- Notify approved + available riders when a paid rider-delivery order
-- enters the eligible Rider Hub pool.

CREATE OR REPLACE FUNCTION public.notify_riders_new_pool_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.delivery_method = 'rider'
     AND NEW.payment_status = 'success'
     AND NEW.rider_id IS NULL
     AND NEW.status = 'Ready for pickup'
     AND OLD.status IS DISTINCT FROM 'Ready for pickup' THEN

    INSERT INTO public.notifications
      (user_id, title, message, type, related_order_id)
    SELECT
      r.user_id,
      'New order available',
      'Order ' || NEW.order_number ||
        ' is ready for pickup. Open the Rider Hub to accept it.',
      'rider',
      NEW.id
    FROM public.riders r
    WHERE r.status = 'approved'
      AND r.available = true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_riders_new_pool_order ON public.orders;

CREATE TRIGGER trg_notify_riders_new_pool_order
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_riders_new_pool_order();