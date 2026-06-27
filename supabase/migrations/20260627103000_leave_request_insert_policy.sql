DROP POLICY IF EXISTS "Employee create own leave" ON public.leaves;
DROP POLICY IF EXISTS "leave insert own or managers" ON public.leaves;

GRANT INSERT ON public.leaves TO authenticated;

CREATE POLICY "leave insert own or managers"
ON public.leaves
FOR INSERT
TO authenticated
WITH CHECK (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = leaves.employee_id
        AND e.business_id = leaves.business_id
        AND e.user_id = leaves.user_id
        AND e.user_id = auth.uid()
    )
  )
);
