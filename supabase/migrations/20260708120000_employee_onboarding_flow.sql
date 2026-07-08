-- Employee onboarding and invite flow hardening.
-- Safe to run on an existing Rotaro database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_login boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz DEFAULT now();

ALTER TABLE public.employees
  ALTER COLUMN employee_code DROP NOT NULL,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN role DROP NOT NULL,
  ALTER COLUMN employment_type DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_business_employee_code_unique
  ON public.employees (business_id, employee_code)
  WHERE employee_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_business_email_unique
  ON public.employees (business_id, lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leave_balances_employee_leave_type_unique
  ON public.leave_balances (employee_id, leave_type);

CREATE OR REPLACE FUNCTION public.get_next_employee_code(p_business_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(employee_code, '[^0-9]', '', 'g'), '')::integer), 0) + 1
    INTO next_num
  FROM public.employees
  WHERE business_id = p_business_id
    AND employee_code ~ '^EMP[0-9]+$';

  RETURN 'EMP' || lpad(next_num::text, 3, '0');
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_employees_updated_at ON public.employees;
CREATE TRIGGER trg_employees_updated_at
BEFORE UPDATE ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_leave_balances_updated_at ON public.leave_balances;
CREATE TRIGGER trg_leave_balances_updated_at
BEFORE UPDATE ON public.leave_balances
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers insert employees in business" ON public.employees;
CREATE POLICY "Managers insert employees in business"
ON public.employees
FOR INSERT
TO authenticated
WITH CHECK (
  business_id = public.current_business_id()
  AND public.current_role() IN ('employer', 'manager')
);

DROP POLICY IF EXISTS "Managers update employees in business" ON public.employees;
CREATE POLICY "Managers update employees in business"
ON public.employees
FOR UPDATE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND public.current_role() IN ('employer', 'manager')
)
WITH CHECK (
  business_id = public.current_business_id()
  AND public.current_role() IN ('employer', 'manager')
);

DROP POLICY IF EXISTS "Managers delete employees in business" ON public.employees;
CREATE POLICY "Managers delete employees in business"
ON public.employees
FOR DELETE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND public.current_role() IN ('employer', 'manager')
);

DROP POLICY IF EXISTS "Managers manage leave balances in business" ON public.leave_balances;
CREATE POLICY "Managers manage leave balances in business"
ON public.leave_balances
FOR ALL
TO authenticated
USING (
  business_id = public.current_business_id()
  AND public.current_role() IN ('employer', 'manager')
)
WITH CHECK (
  business_id = public.current_business_id()
  AND public.current_role() IN ('employer', 'manager')
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'employees'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.employees;
  END IF;
END $$;
