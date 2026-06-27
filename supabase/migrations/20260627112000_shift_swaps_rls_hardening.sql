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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_swaps TO authenticated;
ALTER TABLE public.shift_swaps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shift_swaps view" ON public.shift_swaps;
DROP POLICY IF EXISTS "shift_swaps insert" ON public.shift_swaps;
DROP POLICY IF EXISTS "shift_swaps update" ON public.shift_swaps;
DROP POLICY IF EXISTS "shift_swaps delete" ON public.shift_swaps;

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
        AND e.business_id = shift_swaps.business_id
        AND e.id IN (shift_swaps.requester_employee_id, shift_swaps.target_employee_id)
    )
  )
);

CREATE POLICY "shift_swaps insert"
ON public.shift_swaps
FOR INSERT
TO authenticated
WITH CHECK (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = shift_swaps.requester_employee_id
        AND e.user_id = auth.uid()
        AND e.business_id = shift_swaps.business_id
    )
  )
);

CREATE POLICY "shift_swaps update"
ON public.shift_swaps
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

CREATE POLICY "shift_swaps delete"
ON public.shift_swaps
FOR DELETE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND public.is_manager_or_employer()
);

NOTIFY pgrst, 'reload schema';
