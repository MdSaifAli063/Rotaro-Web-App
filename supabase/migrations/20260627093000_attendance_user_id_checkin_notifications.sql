ALTER TABLE public.attendance_records
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.attendance_records ar
SET user_id = e.user_id
FROM public.employees e
WHERE ar.employee_id = e.id
  AND ar.user_id IS NULL
  AND e.user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_attendance_record_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT e.user_id INTO NEW.user_id
    FROM public.employees e
    WHERE e.id = NEW.employee_id;
  END IF;

  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_records_user_id ON public.attendance_records;
CREATE TRIGGER trg_attendance_records_user_id
BEFORE INSERT OR UPDATE OF employee_id, user_id
ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.set_attendance_record_user_id();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.attendance_records
    WHERE user_id IS NULL
  ) THEN
    ALTER TABLE public.attendance_records
    ALTER COLUMN user_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'attendance_records.user_id still has null rows; not setting NOT NULL yet.';
  END IF;
END $$;

DROP POLICY IF EXISTS "attendance insert" ON public.attendance_records;
CREATE POLICY "attendance insert"
ON public.attendance_records
FOR INSERT
TO authenticated
WITH CHECK (
  business_id = public.current_business_id()
  AND (
    public.is_manager_or_employer()
    OR user_id = auth.uid()
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
    OR user_id = auth.uid()
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
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.id = attendance_records.employee_id
        AND e.user_id = auth.uid()
    )
  )
);
