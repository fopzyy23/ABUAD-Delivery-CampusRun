-- Server-side reward notifications. Trigger fires only when a reward ledger
-- row is actually inserted, so idempotent retries do not duplicate notices.
CREATE OR REPLACE FUNCTION public.notify_reward_credit_issued()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.amount>0 AND NEW.source_type='signup_reward' THEN
    INSERT INTO public.notifications(user_id,title,message,type) VALUES(NEW.user_id,'Welcome to Dropzyy','₦200 Dropzyy credit has been added to your account.','info');
  ELSIF NEW.amount>0 AND NEW.source_type='referral_reward' THEN
    INSERT INTO public.notifications(user_id,title,message,type) VALUES(NEW.user_id,'Referral reward earned','₦100 Dropzyy credit has been added to your account.','info');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_reward_credit_issued ON public.customer_credit_ledger;
CREATE TRIGGER trg_notify_reward_credit_issued AFTER INSERT ON public.customer_credit_ledger FOR EACH ROW EXECUTE FUNCTION public.notify_reward_credit_issued();
