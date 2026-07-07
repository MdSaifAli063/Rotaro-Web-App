GRANT DELETE ON public.leaves TO authenticated;
GRANT DELETE ON public.shift_swaps TO authenticated;
GRANT DELETE ON public.attendance_records TO authenticated;

DROP POLICY IF EXISTS "Employer delete leaves" ON public.leaves;
DROP POLICY IF EXISTS "Managers delete leaves" ON public.leaves;
DROP POLICY IF EXISTS "leaves delete manager or owner" ON public.leaves;
CREATE POLICY "leaves delete manager or owner"
ON public.leaves
FOR DELETE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = leaves.employee_id
        AND e.business_id = leaves.business_id
        AND e.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "shift_swaps delete" ON public.shift_swaps;
DROP POLICY IF EXISTS "shift_swaps delete manager or participant" ON public.shift_swaps;
CREATE POLICY "shift_swaps delete manager or participant"
ON public.shift_swaps
FOR DELETE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.business_id = shift_swaps.business_id
        AND e.user_id = auth.uid()
        AND e.id IN (shift_swaps.requester_employee_id, shift_swaps.target_employee_id)
    )
  )
);

DROP POLICY IF EXISTS "attendance delete" ON public.attendance_records;
DROP POLICY IF EXISTS "attendance delete manager or owner" ON public.attendance_records;
CREATE POLICY "attendance delete manager or owner"
ON public.attendance_records
FOR DELETE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_records.employee_id
        AND e.business_id = attendance_records.business_id
        AND e.user_id = auth.uid()
    )
  )
);

NOTIFY pgrst, 'reload schema';
