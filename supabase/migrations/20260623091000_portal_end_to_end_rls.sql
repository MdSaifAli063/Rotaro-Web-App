DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT business_id
  FROM public.profiles
  WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_employer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT role::text IN ('employer', 'manager')
      FROM public.profiles
      WHERE id = auth.uid()
    ),
    false
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_business_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_employer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_employer() TO authenticated;

DROP POLICY IF EXISTS "Business read leaves" ON public.leaves;
CREATE POLICY "Business read leaves"
ON public.leaves
FOR SELECT
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = leaves.employee_id
        AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Employer update leaves" ON public.leaves;
DROP POLICY IF EXISTS "Managers update leaves" ON public.leaves;
CREATE POLICY "Managers update leaves"
ON public.leaves
FOR UPDATE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND public.is_manager_or_employer()
)
WITH CHECK (
  business_id = public.current_business_id()
  AND public.is_manager_or_employer()
);

DROP POLICY IF EXISTS "Employer delete leaves" ON public.leaves;
DROP POLICY IF EXISTS "Managers delete leaves" ON public.leaves;
CREATE POLICY "Managers delete leaves"
ON public.leaves
FOR DELETE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND public.is_manager_or_employer()
);

DROP POLICY IF EXISTS "attendance view" ON public.attendance_records;
CREATE POLICY "attendance view"
ON public.attendance_records
FOR SELECT
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_records.employee_id
        AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "attendance update" ON public.attendance_records;
CREATE POLICY "attendance update"
ON public.attendance_records
FOR UPDATE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_records.employee_id
        AND e.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_records.employee_id
        AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "shift_swaps view" ON public.shift_swaps;
CREATE POLICY "shift_swaps view"
ON public.shift_swaps
FOR SELECT
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.user_id = auth.uid()
        AND e.id IN (shift_swaps.requester_employee_id, shift_swaps.target_employee_id)
    )
  )
);
