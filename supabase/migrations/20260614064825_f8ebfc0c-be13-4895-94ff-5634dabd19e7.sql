
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS skills text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS auto_approve_by_type jsonb DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.is_manager_or_employer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text IN ('employer','manager') FROM public.profiles WHERE id = auth.uid()
$$;

CREATE TABLE IF NOT EXISTS public.shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  department text,
  color text DEFAULT '#1E2A45',
  min_staff_required integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_templates TO authenticated;
GRANT ALL ON public.shift_templates TO service_role;
ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_templates view" ON public.shift_templates FOR SELECT TO authenticated
  USING (business_id = public.current_business_id());
CREATE POLICY "shift_templates manage" ON public.shift_templates FOR ALL TO authenticated
  USING (business_id = public.current_business_id() AND public.is_manager_or_employer())
  WITH CHECK (business_id = public.current_business_id() AND public.is_manager_or_employer());

CREATE TABLE IF NOT EXISTS public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type text NOT NULL,
  total_days numeric NOT NULL DEFAULT 0,
  used_days numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leave_balances view" ON public.leave_balances FOR SELECT TO authenticated
  USING (business_id = public.current_business_id());
CREATE POLICY "leave_balances manage" ON public.leave_balances FOR ALL TO authenticated
  USING (business_id = public.current_business_id() AND public.is_manager_or_employer())
  WITH CHECK (business_id = public.current_business_id() AND public.is_manager_or_employer());

CREATE TABLE IF NOT EXISTS public.shift_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  requester_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  requester_shift_id uuid REFERENCES public.roster_shifts(id) ON DELETE CASCADE,
  target_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  target_shift_id uuid REFERENCES public.roster_shifts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_swaps TO authenticated;
GRANT ALL ON public.shift_swaps TO service_role;
ALTER TABLE public.shift_swaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_swaps view" ON public.shift_swaps FOR SELECT TO authenticated
  USING (business_id = public.current_business_id());
CREATE POLICY "shift_swaps insert" ON public.shift_swaps FOR INSERT TO authenticated
  WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "shift_swaps update" ON public.shift_swaps FOR UPDATE TO authenticated
  USING (business_id = public.current_business_id() AND public.is_manager_or_employer())
  WITH CHECK (business_id = public.current_business_id() AND public.is_manager_or_employer());
CREATE POLICY "shift_swaps delete" ON public.shift_swaps FOR DELETE TO authenticated
  USING (business_id = public.current_business_id() AND public.is_manager_or_employer());

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in_time timestamptz,
  check_out_time timestamptz,
  break_start timestamptz,
  break_end timestamptz,
  status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance view" ON public.attendance_records FOR SELECT TO authenticated
  USING (business_id = public.current_business_id());
CREATE POLICY "attendance insert" ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "attendance update" ON public.attendance_records FOR UPDATE TO authenticated
  USING (business_id = public.current_business_id())
  WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "attendance delete" ON public.attendance_records FOR DELETE TO authenticated
  USING (business_id = public.current_business_id() AND public.is_manager_or_employer());

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  related_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications view own" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "notifications update own" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications insert any" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "notifications delete own" ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_shift_templates_updated ON public.shift_templates;
CREATE TRIGGER trg_shift_templates_updated BEFORE UPDATE ON public.shift_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_leave_balances_updated ON public.leave_balances;
CREATE TRIGGER trg_leave_balances_updated BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_shift_swaps_updated ON public.shift_swaps;
CREATE TRIGGER trg_shift_swaps_updated BEFORE UPDATE ON public.shift_swaps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_attendance_updated ON public.attendance_records;
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
