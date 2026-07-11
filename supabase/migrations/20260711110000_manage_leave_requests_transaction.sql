-- Keep leave decisions and leave-balance changes atomic. This function is the
-- only privileged path used by the employer leave-management screen.
CREATE OR REPLACE FUNCTION public.manage_leave_request(
  p_leave_id uuid,
  p_action text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leave public.leaves%ROWTYPE;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_is_manager boolean := false;
  v_is_owner boolean := false;
  v_delta numeric := 0;
  v_days numeric := 0;
  v_balance_id uuid;
BEGIN
  IF v_action NOT IN ('approved', 'rejected', 'delete') THEN
    RAISE EXCEPTION 'Unsupported leave action';
  END IF;

  SELECT *
  INTO v_leave
  FROM public.leaves
  WHERE id = p_leave_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Leave request was not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.business_id = v_leave.business_id
      AND profile.role::text IN ('employer', 'manager')
  )
  INTO v_is_manager;

  SELECT EXISTS (
    SELECT 1
    FROM public.employees employee
    WHERE employee.id = v_leave.employee_id
      AND employee.business_id = v_leave.business_id
      AND employee.user_id = auth.uid()
  )
  INTO v_is_owner;

  IF NOT v_is_manager AND NOT (v_action = 'delete' AND v_is_owner) THEN
    RAISE EXCEPTION 'You are not allowed to manage this leave request';
  END IF;

  IF NOT v_is_manager AND lower(v_leave.status) = 'approved' THEN
    RAISE EXCEPTION 'Approved leave can only be removed by a manager';
  END IF;

  v_days := GREATEST(
    COALESCE(v_leave.total_days, (v_leave.to_date - v_leave.from_date + 1)::numeric, 1),
    1
  );

  IF lower(v_leave.leave_type) <> 'unpaid' THEN
    IF v_action = 'approved' AND lower(v_leave.status) <> 'approved' THEN
      v_delta := v_days;
    ELSIF (v_action = 'rejected' OR v_action = 'delete') AND lower(v_leave.status) = 'approved' THEN
      v_delta := -v_days;
    END IF;
  END IF;

  IF v_delta <> 0 THEN
    SELECT id
    INTO v_balance_id
    FROM public.leave_balances
    WHERE employee_id = v_leave.employee_id
      AND lower(leave_type) = lower(v_leave.leave_type)
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.leave_balances
      SET used_days = GREATEST(used_days + v_delta, 0),
          updated_at = now()
      WHERE id = v_balance_id;
    ELSIF v_delta > 0 THEN
      INSERT INTO public.leave_balances (
        business_id,
        employee_id,
        leave_type,
        total_days,
        used_days
      )
      VALUES (
        v_leave.business_id,
        v_leave.employee_id,
        v_leave.leave_type,
        CASE
          WHEN lower(v_leave.leave_type) LIKE '%annual%' THEN 20
          WHEN lower(v_leave.leave_type) LIKE '%sick%' THEN 10
          WHEN lower(v_leave.leave_type) LIKE '%casual%' THEN 5
          ELSE 0
        END,
        v_delta
      )
      ON CONFLICT (employee_id, leave_type)
      DO UPDATE SET
        used_days = GREATEST(public.leave_balances.used_days + EXCLUDED.used_days, 0),
        updated_at = now();
    END IF;
  END IF;

  IF v_action = 'delete' THEN
    DELETE FROM public.leaves WHERE id = v_leave.id;
  ELSE
    UPDATE public.leaves
    SET status = v_action
    WHERE id = v_leave.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_leave_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_leave_request(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
