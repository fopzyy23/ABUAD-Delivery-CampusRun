-- Secure student rider-application submission.
-- Pending rows in public.riders are the existing application record; only the
-- audited admin RPC may move them to an approved/active rider.

REVOKE INSERT ON public.riders FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS "riders_insert_own" ON public.riders;

CREATE OR REPLACE FUNCTION public.submit_rider_application(
  p_full_name text,
  p_matric_number text,
  p_college text,
  p_department text,
  p_email text,
  p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_rider public.riders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user required';
  END IF;

  IF NULLIF(trim(p_full_name), '') IS NULL
     OR NULLIF(trim(p_matric_number), '') IS NULL
     OR NULLIF(trim(p_college), '') IS NULL
     OR NULLIF(trim(p_department), '') IS NULL
     OR NULLIF(trim(p_email), '') IS NULL
     OR NULLIF(trim(p_phone), '') IS NULL THEN
    RAISE EXCEPTION 'all rider application fields are required';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile is required before applying as a rider';
  END IF;

  SELECT * INTO v_rider
  FROM public.riders
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF FOUND AND v_rider.status IN ('pending','approved','suspended') THEN
    RAISE EXCEPTION 'rider application already exists';
  END IF;

  IF FOUND THEN
    -- Rejected applicants may resubmit, while retaining the same protected
    -- rider/application identity and all normal admin-review controls.
    UPDATE public.riders
    SET matric_number = trim(p_matric_number),
        phone = trim(p_phone),
        full_name = trim(p_full_name),
        college = trim(p_college),
        department = trim(p_department),
        email = trim(p_email),
        status = 'pending',
        available = false,
        updated_at = now()
    WHERE id = v_rider.id
    RETURNING * INTO v_rider;
  ELSE
    INSERT INTO public.riders(
      user_id, matric_number, phone, full_name, college, department, email,
      status, available
    ) VALUES (
      v_user_id, trim(p_matric_number), trim(p_phone), trim(p_full_name),
      trim(p_college), trim(p_department), trim(p_email), 'pending', false
    )
    RETURNING * INTO v_rider;
  END IF;

  RETURN to_jsonb(v_rider);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rider_application(text,text,text,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rider_application(text,text,text,text,text,text)
  TO authenticated;
