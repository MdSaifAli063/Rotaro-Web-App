
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('employer','employee');

-- Businesses
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  country TEXT DEFAULT '',
  state TEXT DEFAULT '',
  location TEXT DEFAULT '',
  open_days TEXT[] DEFAULT '{}',
  open_time TEXT DEFAULT '09:00',
  close_time TEXT DEFAULT '17:00',
  min_age INT DEFAULT 16,
  employment_types TEXT[] DEFAULT ARRAY['Full-time','Part-time','Casual'],
  break_options INT[] DEFAULT ARRAY[0,15,30,60],
  num_employees INT DEFAULT 0,
  is_onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'employer',
  business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's business
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Policies: profiles
CREATE POLICY "Own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR business_id = public.current_business_id());
CREATE POLICY "Own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Policies: businesses
CREATE POLICY "View own business" ON public.businesses FOR SELECT TO authenticated USING (id = public.current_business_id() OR owner_id = auth.uid());
CREATE POLICY "Owner insert business" ON public.businesses FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner update business" ON public.businesses FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owner delete business" ON public.businesses FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Employees
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT '',
  employment_type TEXT DEFAULT 'Full-time',
  pay_rate NUMERIC(10,2) DEFAULT 0,
  age INT,
  start_date DATE,
  status TEXT DEFAULT 'Active',
  leave_balance NUMERIC(6,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business members read employees" ON public.employees FOR SELECT TO authenticated USING (business_id = public.current_business_id());
CREATE POLICY "Employer manage employees" ON public.employees FOR ALL TO authenticated USING (business_id = public.current_business_id() AND public.current_role() = 'employer') WITH CHECK (business_id = public.current_business_id() AND public.current_role() = 'employer');

-- Rosters
CREATE TABLE public.rosters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rosters TO authenticated;
GRANT ALL ON public.rosters TO service_role;
ALTER TABLE public.rosters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business read rosters" ON public.rosters FOR SELECT TO authenticated USING (business_id = public.current_business_id());
CREATE POLICY "Employer manage rosters" ON public.rosters FOR ALL TO authenticated USING (business_id = public.current_business_id() AND public.current_role() = 'employer') WITH CHECK (business_id = public.current_business_id() AND public.current_role() = 'employer');

-- Roster shifts
CREATE TABLE public.roster_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roster_id UUID NOT NULL REFERENCES public.rosters(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  break_minutes INT DEFAULT 0,
  total_hours NUMERIC(6,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_shifts TO authenticated;
GRANT ALL ON public.roster_shifts TO service_role;
ALTER TABLE public.roster_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business read shifts" ON public.roster_shifts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.rosters r WHERE r.id = roster_id AND r.business_id = public.current_business_id())
);
CREATE POLICY "Employer manage shifts" ON public.roster_shifts FOR ALL TO authenticated USING (
  public.current_role() = 'employer' AND EXISTS (SELECT 1 FROM public.rosters r WHERE r.id = roster_id AND r.business_id = public.current_business_id())
) WITH CHECK (
  public.current_role() = 'employer' AND EXISTS (SELECT 1 FROM public.rosters r WHERE r.id = roster_id AND r.business_id = public.current_business_id())
);

-- Leaves
CREATE TABLE public.leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaves TO authenticated;
GRANT ALL ON public.leaves TO service_role;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business read leaves" ON public.leaves FOR SELECT TO authenticated USING (business_id = public.current_business_id());
CREATE POLICY "Employee create own leave" ON public.leaves FOR INSERT TO authenticated WITH CHECK (
  business_id = public.current_business_id() AND EXISTS (SELECT 1 FROM public.employees e WHERE e.id = employee_id AND (e.user_id = auth.uid() OR public.current_role() = 'employer'))
);
CREATE POLICY "Employer update leaves" ON public.leaves FOR UPDATE TO authenticated USING (business_id = public.current_business_id() AND public.current_role() = 'employer') WITH CHECK (business_id = public.current_business_id());
CREATE POLICY "Employer delete leaves" ON public.leaves FOR DELETE TO authenticated USING (business_id = public.current_business_id() AND public.current_role() = 'employer');

-- Holidays
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  holiday_name TEXT NOT NULL,
  country TEXT,
  state TEXT,
  is_paid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holidays TO authenticated;
GRANT ALL ON public.holidays TO service_role;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business read holidays" ON public.holidays FOR SELECT TO authenticated USING (business_id = public.current_business_id());
CREATE POLICY "Employer manage holidays" ON public.holidays FOR ALL TO authenticated USING (business_id = public.current_business_id() AND public.current_role() = 'employer') WITH CHECK (business_id = public.current_business_id() AND public.current_role() = 'employer');

-- Settings
CREATE TABLE public.settings (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  auto_approve_leave BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Business read settings" ON public.settings FOR SELECT TO authenticated USING (business_id = public.current_business_id());
CREATE POLICY "Employer manage settings" ON public.settings FOR ALL TO authenticated USING (business_id = public.current_business_id() AND public.current_role() = 'employer') WITH CHECK (business_id = public.current_business_id() AND public.current_role() = 'employer');

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'employer')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
