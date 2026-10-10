-- Fix order-admission pgcrypto resolution.
-- Keep SECURITY DEFINER functions on search_path=public and explicitly qualify
-- trusted pgcrypto helpers from the extensions schema.

CREATE OR REPLACE FUNCTION public.create_order_admission(
  p_user_id uuid,
  p_operation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := p_user_id;
  v_allowed boolean;
  v_retry integer;
  v_token text;
  v_expires timestamptz;
BEGIN
  IF v_user IS NULL
     OR p_operation NOT IN ('place_order', 'create_vendor_order_request')
  THEN
    RAISE EXCEPTION 'invalid order admission request';
  END IF;

  SELECT r.allowed, r.retry_after_seconds
    INTO v_allowed, v_retry
  FROM public.consume_rate_limit(
    'order_creation',
    'user',
    v_user::text
  ) r;

  IF NOT COALESCE(v_allowed, false) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'retry_after_seconds', v_retry
    );
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := clock_timestamp() + interval '5 minutes';

  INSERT INTO public.rate_limit_admissions(
    user_id,
    action,
    operation,
    nonce,
    expires_at
  )
  VALUES (
    v_user,
    'order_creation',
    p_operation,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires
  );

  RETURN jsonb_build_object(
    'allowed', true,
    'admission_token', v_token,
    'expires_at', v_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_admission(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_order_admission(uuid, text)
TO service_role;


CREATE OR REPLACE FUNCTION public.consume_order_admission(
  p_user_id uuid,
  p_operation text,
  p_admission_token text,
  p_attempt_id uuid,
  p_request_key text,
  p_request_fingerprint text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := p_user_id;
  v_admission public.rate_limit_admissions%ROWTYPE;
  v_key_hash text;
BEGIN
  IF p_user_id IS NULL
     OR p_operation NOT IN ('place_order', 'create_vendor_order_request')
     OR p_admission_token IS NULL
     OR length(p_admission_token) <> 64
     OR p_attempt_id IS NULL
     OR p_request_key IS NULL
     OR length(p_request_key) < 16
     OR length(p_request_key) > 256
     OR p_request_fingerprint IS NULL
     OR length(p_request_fingerprint) <> 64
  THEN
    RETURN false;
  END IF;

  v_key_hash :=
    encode(extensions.digest(p_request_key, 'sha256'), 'hex');

  SELECT *
    INTO v_admission
  FROM public.rate_limit_admissions
  WHERE nonce =
          encode(
            extensions.digest(p_admission_token, 'sha256'),
            'hex'
          )
    AND action = 'order_creation'
    AND operation = p_operation
    AND user_id = v_user
    AND used_at IS NULL
  FOR UPDATE;

  IF NOT FOUND
     OR v_admission.expires_at <= clock_timestamp()
  THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_creation_attempts
    WHERE user_id = p_user_id
      AND operation = p_operation
      AND request_key_hash = v_key_hash
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.rate_limit_admissions
  SET
    used_at = clock_timestamp(),
    claimed_attempt_id = p_attempt_id,
    order_claimed_at = clock_timestamp()
  WHERE id = v_admission.id
    AND used_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO public.order_creation_attempts(
    id,
    user_id,
    operation,
    admission_id,
    request_key_hash,
    request_fingerprint
  )
  VALUES (
    p_attempt_id,
    p_user_id,
    p_operation,
    v_admission.id,
    v_key_hash,
    lower(p_request_fingerprint)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_order_admission(
  uuid, text, text, uuid, text, text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_order_admission(
  uuid, text, text, uuid, text, text
)
TO service_role;


CREATE OR REPLACE FUNCTION public.get_order_creation_attempt(
  p_user_id uuid,
  p_operation text,
  p_request_key text,
  p_request_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_fp text;
BEGIN
  IF p_user_id IS NULL
     OR p_operation NOT IN ('place_order', 'create_vendor_order_request')
     OR p_request_key IS NULL
     OR p_request_fingerprint IS NULL
  THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  SELECT id, request_fingerprint
    INTO v_id, v_fp
  FROM public.order_creation_attempts
  WHERE user_id = p_user_id
    AND operation = p_operation
    AND request_key_hash =
        encode(
          extensions.digest(p_request_key, 'sha256'),
          'hex'
        );

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('status', 'none');
  END IF;

  IF v_fp <> lower(p_request_fingerprint) THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  RETURN jsonb_build_object(
    'status', 'match',
    'attempt_id', v_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_order_creation_attempt(
  uuid, text, text, text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_order_creation_attempt(
  uuid, text, text, text
)
TO service_role;