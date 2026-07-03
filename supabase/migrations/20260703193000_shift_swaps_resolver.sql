CREATE OR REPLACE FUNCTION public.respond_to_shift_swap(p_swap_id uuid, p_action text)
RETURNS public.shift_swaps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_swap public.shift_swaps%ROWTYPE;
  v_actor_employee_id uuid;
  v_request_shift public.roster_shifts%ROWTYPE;
  v_target_shift public.roster_shifts%ROWTYPE;
  v_action text := lower(trim(coalesce(p_action, '')));
BEGIN
  SELECT *
  INTO v_swap
  FROM public.shift_swaps
  WHERE id = p_swap_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift swap not found';
  END IF;

  IF v_swap.business_id <> public.current_business_id() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF public.is_manager_or_employer() THEN
    IF v_swap.status NOT IN ('pending', 'target_accepted') THEN
      RAISE EXCEPTION 'This swap is already closed';
    END IF;

    IF v_action = 'approved' THEN
      IF v_swap.requester_shift_id IS NULL OR v_swap.target_shift_id IS NULL THEN
        RAISE EXCEPTION 'Both shifts are required to approve a swap';
      END IF;

      SELECT *
      INTO v_request_shift
      FROM public.roster_shifts
      WHERE id = v_swap.requester_shift_id
      FOR UPDATE;

      SELECT *
      INTO v_target_shift
      FROM public.roster_shifts
      WHERE id = v_swap.target_shift_id
      FOR UPDATE;

      IF NOT FOUND OR v_request_shift.id IS NULL OR v_target_shift.id IS NULL THEN
        RAISE EXCEPTION 'Swap shifts are missing';
      END IF;

      IF v_request_shift.employee_id <> v_swap.requester_employee_id
        OR v_target_shift.employee_id <> v_swap.target_employee_id THEN
        RAISE EXCEPTION 'The underlying shifts changed. Refresh and try again';
      END IF;

      UPDATE public.roster_shifts
      SET employee_id = v_swap.target_employee_id
      WHERE id = v_swap.requester_shift_id;

      UPDATE public.roster_shifts
      SET employee_id = v_swap.requester_employee_id
      WHERE id = v_swap.target_shift_id;
    ELSIF v_action <> 'rejected' THEN
      RAISE EXCEPTION 'Unsupported manager action: %', p_action;
    END IF;
  ELSE
    SELECT e.id
    INTO v_actor_employee_id
    FROM public.employees e
    WHERE e.user_id = auth.uid()
      AND e.business_id = v_swap.business_id
    LIMIT 1;

    IF v_actor_employee_id IS NULL THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;

    IF v_actor_employee_id = v_swap.requester_employee_id THEN
      IF v_swap.status NOT IN ('pending', 'target_accepted') THEN
        RAISE EXCEPTION 'This swap is already closed';
      END IF;

      IF v_action <> 'cancelled' THEN
        RAISE EXCEPTION 'Requesters can only cancel their swap';
      END IF;
    ELSIF v_actor_employee_id = v_swap.target_employee_id THEN
      IF v_swap.status <> 'pending' THEN
        RAISE EXCEPTION 'This swap is already closed';
      END IF;

      IF v_action NOT IN ('target_accepted', 'target_declined') THEN
        RAISE EXCEPTION 'Target employee can only accept or decline';
      END IF;
    ELSE
      RAISE EXCEPTION 'Not allowed';
    END IF;
  END IF;

  UPDATE public.shift_swaps
  SET status = v_action,
      updated_at = now()
  WHERE id = v_swap.id
  RETURNING * INTO v_swap;

  RETURN v_swap;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.respond_to_shift_swap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_shift_swap(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
