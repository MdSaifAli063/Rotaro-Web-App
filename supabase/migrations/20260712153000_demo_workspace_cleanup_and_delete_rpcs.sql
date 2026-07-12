-- Remove the original Rotaro demo records while preserving its employer,
-- business, settings, and active billing subscription. The auth cleanup is
-- intentionally limited to the known seeded staff accounts.
DO $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT profile.business_id
  INTO v_business_id
  FROM public.profiles profile
  WHERE lower(profile.email) = 'employer@rotaro.com'
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.messages WHERE business_id = v_business_id;
  DELETE FROM public.notifications WHERE business_id = v_business_id;
  DELETE FROM public.shift_swaps WHERE business_id = v_business_id;
  DELETE FROM public.attendance_records WHERE business_id = v_business_id;
  DELETE FROM public.leaves WHERE business_id = v_business_id;
  DELETE FROM public.leave_balances WHERE business_id = v_business_id;
  DELETE FROM public.roster_shifts
  WHERE roster_id IN (SELECT id FROM public.rosters WHERE business_id = v_business_id);
  DELETE FROM public.rosters WHERE business_id = v_business_id;
  DELETE FROM public.shift_templates WHERE business_id = v_business_id;
  DELETE FROM public.holidays WHERE business_id = v_business_id;
  DELETE FROM public.billing_invoices WHERE business_id = v_business_id;
  DELETE FROM public.employees WHERE business_id = v_business_id;

  INSERT INTO public.billing_subscriptions (
    business_id,
    provider,
    plan_key,
    plan_name,
    status,
    billing_interval,
    currency,
    amount_cents
  )
  VALUES (v_business_id, 'manual', 'professional', 'Professional', 'active', 'monthly', 'AUD', 0)
  ON CONFLICT (business_id) DO UPDATE SET
    plan_key = 'professional',
    plan_name = 'Professional',
    status = 'active',
    updated_at = now();

  DELETE FROM auth.users
  WHERE lower(email) IN (
    'manager@rotaro.com',
    'emily@rotaro.com',
    'liam@rotaro.com',
    'priya@rotaro.com',
    'tom@rotaro.com',
    'aisha@rotaro.com'
  );
END;
$$;

-- Delete a roster and every row that can depend on its shifts. This remains
-- reliable where legacy foreign keys or RLS policies differ from migrations.
CREATE OR REPLACE FUNCTION public.delete_roster(p_roster_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business_id
  INTO v_business_id
  FROM public.rosters
  WHERE id = p_roster_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Roster was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.business_id = v_business_id
      AND profile.role::text IN ('employer', 'manager')
  ) THEN
    RAISE EXCEPTION 'You are not allowed to delete this roster';
  END IF;

  DELETE FROM public.shift_swaps
  WHERE requester_shift_id IN (
    SELECT id FROM public.roster_shifts WHERE roster_id = p_roster_id
  )
  OR target_shift_id IN (
    SELECT id FROM public.roster_shifts WHERE roster_id = p_roster_id
  );
  DELETE FROM public.roster_shifts WHERE roster_id = p_roster_id;
  DELETE FROM public.rosters WHERE id = p_roster_id;
END;
$$;

-- Use a privileged, business-scoped delete path for shift templates so that
-- managers and employers see an explicit error instead of a silent RLS no-op.
CREATE OR REPLACE FUNCTION public.delete_shift_template(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business_id
  INTO v_business_id
  FROM public.shift_templates
  WHERE id = p_template_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift template was not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.business_id = v_business_id
      AND profile.role::text IN ('employer', 'manager')
  ) THEN
    RAISE EXCEPTION 'You are not allowed to delete this shift template';
  END IF;

  DELETE FROM public.shift_templates WHERE id = p_template_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_roster(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_shift_template(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_shift_template(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
