-- 20261016_rate_limiting_foundation.sql
-- Phase 1: durable, server-authoritative rate-limit buckets.
-- Consumers are added in later migrations. This migration does not alter
-- existing payment, order, refund, withdrawal, rider, or Edge Functions.

CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  bucket_key text PRIMARY KEY,
  action text NOT NULL,
  subject_type text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT security_rate_limits_action_chk CHECK (
    action IN (
      'paystack_initialize',
      'paystack_initialize_delivery',
      'refund_request',
      'refund_execution',
      'transfer_execution',
      'transfer_recipient',
      'withdrawal_request',
      'order_creation',
      'rider_claim',
      'order_cancellation'
    )
  ),
  CONSTRAINT security_rate_limits_subject_type_chk CHECK (
    subject_type IN ('user', 'ip', 'resource')
  ),
  CONSTRAINT security_rate_limits_subject_hash_chk CHECK (
    length(subject_hash) BETWEEN 1 AND 256
  ),
  CONSTRAINT security_rate_limits_attempt_count_chk CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS security_rate_limits_action_subject_idx
  ON public.security_rate_limits (action, subject_type, subject_hash);

CREATE INDEX IF NOT EXISTS security_rate_limits_updated_at_idx
  ON public.security_rate_limits (updated_at);

ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

-- The table is intentionally not directly readable or writable by clients.
REVOKE ALL ON TABLE public.security_rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_action text,
  p_subject_type text,
  p_subject_hash text
)
RETURNS TABLE (
  allowed boolean,
  retry_after_seconds integer,
  attempt_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_window_seconds integer;
  v_block_seconds integer;
  v_bucket_key text;
  v_now timestamptz := clock_timestamp();
  v_row public.security_rate_limits%ROWTYPE;
  v_retry integer;
BEGIN
  -- Limits and eligible subject types are server-authoritative. No caller
  -- can supply a role, amount, ownership value, window, or quota.
  IF p_subject_type NOT IN ('user', 'ip', 'resource') THEN
    RAISE EXCEPTION 'rate-limit subject type is not allowed';
  END IF;

  -- Both the action and subject type select the quota. Resource buckets are
  -- intentionally tighter because they protect one payment/order/refund or
  -- payout resource rather than a whole user or IP address.
  CASE p_action
    WHEN 'paystack_initialize', 'paystack_initialize_delivery' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 5;  v_window_seconds := 600;
        WHEN 'ip' THEN v_limit := 30;   v_window_seconds := 600;
        WHEN 'resource' THEN v_limit := 3; v_window_seconds := 1800;
      END CASE;
    WHEN 'refund_request' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 5;  v_window_seconds := 3600;
        WHEN 'ip' THEN v_limit := 20;   v_window_seconds := 3600;
        WHEN 'resource' THEN v_limit := 1; v_window_seconds := 3600;
      END CASE;
    WHEN 'refund_execution' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 10; v_window_seconds := 3600;
        WHEN 'ip' THEN v_limit := 30;   v_window_seconds := 3600;
        WHEN 'resource' THEN v_limit := 1; v_window_seconds := 3600;
      END CASE;
    WHEN 'transfer_execution' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 30; v_window_seconds := 3600;
        WHEN 'ip' THEN v_limit := 60;   v_window_seconds := 3600;
        WHEN 'resource' THEN v_limit := 1; v_window_seconds := 3600;
      END CASE;
    WHEN 'transfer_recipient' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 5;  v_window_seconds := 3600;
        WHEN 'ip' THEN v_limit := 20;   v_window_seconds := 3600;
        WHEN 'resource' THEN v_limit := 1; v_window_seconds := 3600;
      END CASE;
    WHEN 'withdrawal_request' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 3;  v_window_seconds := 3600;
        WHEN 'ip' THEN v_limit := 10;   v_window_seconds := 3600;
        WHEN 'resource' THEN v_limit := 1; v_window_seconds := 3600;
      END CASE;
    WHEN 'order_creation' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 10; v_window_seconds := 600;
        WHEN 'ip' THEN v_limit := 30;   v_window_seconds := 600;
        WHEN 'resource' THEN v_limit := 1; v_window_seconds := 600;
      END CASE;
    WHEN 'rider_claim' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 20; v_window_seconds := 600;
        WHEN 'ip' THEN v_limit := 60;   v_window_seconds := 600;
        WHEN 'resource' THEN v_limit := 1; v_window_seconds := 600;
      END CASE;
    WHEN 'order_cancellation' THEN
      CASE p_subject_type
        WHEN 'user' THEN v_limit := 10; v_window_seconds := 3600;
        WHEN 'ip' THEN v_limit := 30;   v_window_seconds := 3600;
        WHEN 'resource' THEN v_limit := 1; v_window_seconds := 3600;
      END CASE;
    ELSE
      RAISE EXCEPTION 'rate-limit action is not allowed';
  END CASE;

  -- Blocks last for the selected window and are never caller-controlled.
  v_block_seconds := v_window_seconds;

  IF p_subject_hash IS NULL OR length(p_subject_hash) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'rate-limit subject is invalid';
  END IF;

  v_bucket_key := p_action || ':' || p_subject_type || ':' || p_subject_hash;

  -- Insert first, then lock the one canonical bucket row. ON CONFLICT
  -- serializes concurrent creators for the same key; FOR UPDATE serializes
  -- all subsequent reads and increments for that key.
  INSERT INTO public.security_rate_limits (
    bucket_key, action, subject_type, subject_hash,
    window_started_at, attempt_count, updated_at
  )
  VALUES (
    v_bucket_key, p_action, p_subject_type, p_subject_hash,
    v_now, 0, v_now
  )
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT *
    INTO v_row
    FROM public.security_rate_limits
   WHERE bucket_key = v_bucket_key
   FOR UPDATE;

  IF v_row.window_started_at + make_interval(secs => v_window_seconds) <= v_now THEN
    v_row.window_started_at := v_now;
    v_row.attempt_count := 0;
    v_row.blocked_until := NULL;
  END IF;

  IF v_row.blocked_until IS NOT NULL AND v_row.blocked_until > v_now THEN
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.blocked_until - v_now)))::integer);
    UPDATE public.security_rate_limits
       SET updated_at = v_now
     WHERE bucket_key = v_bucket_key;
    RETURN QUERY SELECT false, v_retry, v_row.attempt_count;
    RETURN;
  END IF;

  v_row.attempt_count := v_row.attempt_count + 1;

  IF v_row.attempt_count > v_limit THEN
    v_row.blocked_until := v_now + make_interval(secs => v_block_seconds);
    v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.blocked_until - v_now)))::integer);
    UPDATE public.security_rate_limits
       SET window_started_at = v_row.window_started_at,
           attempt_count = v_row.attempt_count,
           blocked_until = v_row.blocked_until,
           updated_at = v_now
     WHERE bucket_key = v_bucket_key;
    RETURN QUERY SELECT false, v_retry, v_row.attempt_count;
    RETURN;
  END IF;

  UPDATE public.security_rate_limits
     SET window_started_at = v_row.window_started_at,
         attempt_count = v_row.attempt_count,
         blocked_until = v_row.blocked_until,
         updated_at = v_now
   WHERE bucket_key = v_bucket_key;

  v_retry := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
    v_row.window_started_at + make_interval(secs => v_window_seconds) - v_now
  )))::integer);
  RETURN QUERY SELECT true, v_retry, v_row.attempt_count;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_security_rate_limits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.security_rate_limits
   WHERE updated_at < clock_timestamp() - interval '48 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_security_rate_limits()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_security_rate_limits()
  TO service_role;
