ALTER TABLE public.holidays
  ADD COLUMN IF NOT EXISTS holiday_name text,
  ADD COLUMN IF NOT EXISTS plant text,
  ADD COLUMN IF NOT EXISTS is_national boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'holidays'
      AND column_name = 'name'
  ) THEN
    UPDATE public.holidays
    SET holiday_name = COALESCE(holiday_name, name)
    WHERE holiday_name IS NULL;

    ALTER TABLE public.holidays ALTER COLUMN name DROP NOT NULL;
  END IF;
END $$;

UPDATE public.holidays
SET
  holiday_name = COALESCE(holiday_name, 'Holiday'),
  is_national = COALESCE(is_national, true),
  is_custom = COALESCE(is_custom, false),
  source = COALESCE(source, 'manual');

ALTER TABLE public.holidays ALTER COLUMN holiday_name SET NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_holiday_legacy_name()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.holiday_name IS NULL AND to_jsonb(NEW) ? 'name' THEN
    NEW.holiday_name := (to_jsonb(NEW)->>'name');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_holiday_legacy_name ON public.holidays;
CREATE TRIGGER trg_sync_holiday_legacy_name
BEFORE INSERT OR UPDATE ON public.holidays
FOR EACH ROW
EXECUTE FUNCTION public.sync_holiday_legacy_name();

DELETE FROM public.holidays h
USING public.holidays d
WHERE h.ctid < d.ctid
  AND h.business_id = d.business_id
  AND h.holiday_date = d.holiday_date
  AND lower(h.holiday_name) = lower(d.holiday_name);

CREATE UNIQUE INDEX IF NOT EXISTS holidays_business_date_name_unique
ON public.holidays (business_id, holiday_date, holiday_name);

CREATE INDEX IF NOT EXISTS idx_holidays_business_date
ON public.holidays (business_id, holiday_date);

CREATE INDEX IF NOT EXISTS idx_holidays_year
ON public.holidays (business_id, (EXTRACT(YEAR FROM holiday_date)));

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

DROP POLICY IF EXISTS "Business read holidays" ON public.holidays;
CREATE POLICY "Business read holidays"
ON public.holidays
FOR SELECT
TO authenticated
USING (business_id = public.current_business_id());

DROP POLICY IF EXISTS "Employer manage holidays" ON public.holidays;
DROP POLICY IF EXISTS "Managers manage holidays" ON public.holidays;
CREATE POLICY "Managers manage holidays"
ON public.holidays
FOR ALL
TO authenticated
USING (
  business_id = public.current_business_id()
  AND public.is_manager_or_employer()
)
WITH CHECK (
  business_id = public.current_business_id()
  AND public.is_manager_or_employer()
);
