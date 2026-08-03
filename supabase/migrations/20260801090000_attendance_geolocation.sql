ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS check_in_latitude double precision,
  ADD COLUMN IF NOT EXISTS check_in_longitude double precision,
  ADD COLUMN IF NOT EXISTS check_in_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS check_in_location_captured_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_latitude double precision,
  ADD COLUMN IF NOT EXISTS check_out_longitude double precision,
  ADD COLUMN IF NOT EXISTS check_out_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS check_out_location_captured_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_check_in_location_complete'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_check_in_location_complete CHECK (
        num_nonnulls(
          check_in_latitude,
          check_in_longitude,
          check_in_accuracy_m,
          check_in_location_captured_at
        ) IN (0, 4)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_check_out_location_complete'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_check_out_location_complete CHECK (
        num_nonnulls(
          check_out_latitude,
          check_out_longitude,
          check_out_accuracy_m,
          check_out_location_captured_at
        ) IN (0, 4)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_check_in_location_valid'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_check_in_location_valid CHECK (
        check_in_latitude IS NULL OR (
          check_in_latitude BETWEEN -90 AND 90
          AND check_in_longitude BETWEEN -180 AND 180
          AND check_in_accuracy_m >= 0
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_check_out_location_valid'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_check_out_location_valid CHECK (
        check_out_latitude IS NULL OR (
          check_out_latitude BETWEEN -90 AND 90
          AND check_out_longitude BETWEEN -180 AND 180
          AND check_out_accuracy_m >= 0
        )
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.protect_attendance_geolocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.check_in_latitude IS NOT NULL AND (
      NEW.check_in_latitude IS DISTINCT FROM OLD.check_in_latitude
      OR NEW.check_in_longitude IS DISTINCT FROM OLD.check_in_longitude
      OR NEW.check_in_accuracy_m IS DISTINCT FROM OLD.check_in_accuracy_m
      OR NEW.check_in_location_captured_at IS DISTINCT FROM OLD.check_in_location_captured_at
    ) THEN
      RAISE EXCEPTION 'The recorded check-in location cannot be changed';
    END IF;

    IF OLD.check_out_latitude IS NOT NULL AND (
      NEW.check_out_latitude IS DISTINCT FROM OLD.check_out_latitude
      OR NEW.check_out_longitude IS DISTINCT FROM OLD.check_out_longitude
      OR NEW.check_out_accuracy_m IS DISTINCT FROM OLD.check_out_accuracy_m
      OR NEW.check_out_location_captured_at IS DISTINCT FROM OLD.check_out_location_captured_at
    ) THEN
      RAISE EXCEPTION 'The recorded check-out location cannot be changed';
    END IF;
  END IF;

  IF NEW.check_in_latitude IS NULL THEN
    NEW.check_in_location_captured_at := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.check_in_latitude IS NULL THEN
    NEW.check_in_location_captured_at := now();
  END IF;

  IF NEW.check_out_latitude IS NULL THEN
    NEW.check_out_location_captured_at := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.check_out_latitude IS NULL THEN
    NEW.check_out_location_captured_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_geolocation ON public.attendance_records;
CREATE TRIGGER trg_attendance_geolocation
BEFORE INSERT OR UPDATE OF
  check_in_latitude,
  check_in_longitude,
  check_in_accuracy_m,
  check_in_location_captured_at,
  check_out_latitude,
  check_out_longitude,
  check_out_accuracy_m,
  check_out_location_captured_at
ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.protect_attendance_geolocation();

COMMENT ON COLUMN public.attendance_records.check_in_latitude IS
  'Device-reported latitude captured when the employee checks in.';
COMMENT ON COLUMN public.attendance_records.check_out_latitude IS
  'Device-reported latitude captured when the employee checks out.';

NOTIFY pgrst, 'reload schema';
