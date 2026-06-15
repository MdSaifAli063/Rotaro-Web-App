
-- 1) Prevent users from escalating their role / changing business_id on their own profile
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only applies when the row owner is updating their own row.
  -- Service role / admin contexts (where auth.uid() IS NULL) bypass this guard.
  IF auth.uid() IS NOT NULL AND NEW.id = auth.uid() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'You cannot change your own role';
    END IF;
    IF NEW.business_id IS DISTINCT FROM OLD.business_id AND OLD.business_id IS NOT NULL THEN
      RAISE EXCEPTION 'You cannot change your own business assignment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- 2) Realtime channel subscription protection
-- Restrict subscribers so a user can only join their own notification channel ("notif-<uid>").
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own realtime channel" ON realtime.messages;
CREATE POLICY "Users can read their own realtime channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (realtime.topic() = 'notif-' || auth.uid()::text);

DROP POLICY IF EXISTS "Users can write to their own realtime channel" ON realtime.messages;
CREATE POLICY "Users can write to their own realtime channel"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (realtime.topic() = 'notif-' || auth.uid()::text);

-- 3) leave_balances: restrict SELECT to own record or managers/employers
DROP POLICY IF EXISTS "leave_balances view" ON public.leave_balances;
CREATE POLICY "leave_balances view"
ON public.leave_balances
FOR SELECT
TO authenticated
USING (
  business_id = current_business_id()
  AND (
    is_manager_or_employer()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = leave_balances.employee_id AND e.user_id = auth.uid()
    )
  )
);

-- 4) employees: restrict SELECT to managers/employers or the employee's own record
DROP POLICY IF EXISTS "Business members read employees" ON public.employees;
CREATE POLICY "Business members read employees"
ON public.employees
FOR SELECT
TO authenticated
USING (
  business_id = current_business_id()
  AND (
    is_manager_or_employer()
    OR user_id = auth.uid()
  )
);

-- 5) attendance_records: INSERT must be the caller's own record OR done by a manager/employer
DROP POLICY IF EXISTS "attendance insert" ON public.attendance_records;
CREATE POLICY "attendance insert"
ON public.attendance_records
FOR INSERT
TO authenticated
WITH CHECK (
  business_id = current_business_id()
  AND (
    is_manager_or_employer()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_records.employee_id AND e.user_id = auth.uid()
    )
  )
);

-- 6) shift_swaps: INSERT requester must match caller's employee record OR be a manager/employer
DROP POLICY IF EXISTS "shift_swaps insert" ON public.shift_swaps;
CREATE POLICY "shift_swaps insert"
ON public.shift_swaps
FOR INSERT
TO authenticated
WITH CHECK (
  business_id = current_business_id()
  AND (
    is_manager_or_employer()
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = shift_swaps.requester_employee_id AND e.user_id = auth.uid()
    )
  )
);

-- 7) Lock down SECURITY DEFINER helpers: revoke from PUBLIC; keep authenticated since they are
-- used inside RLS policies and only return data about the calling user.
REVOKE EXECUTE ON FUNCTION public.current_business_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public."current_role"() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_employer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public."current_role"() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_employer() TO authenticated;
