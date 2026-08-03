ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS check_in_address text,
  ADD COLUMN IF NOT EXISTS check_out_address text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attendance_location_address_length'
      AND conrelid = 'public.attendance_records'::regclass
  ) THEN
    ALTER TABLE public.attendance_records
      ADD CONSTRAINT attendance_location_address_length CHECK (
        char_length(check_in_address) <= 500
        AND char_length(check_out_address) <= 500
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
      OR NEW.check_in_address IS DISTINCT FROM OLD.check_in_address
    ) THEN
      RAISE EXCEPTION 'The recorded check-in location cannot be changed';
    END IF;

    IF OLD.check_out_latitude IS NOT NULL AND (
      NEW.check_out_latitude IS DISTINCT FROM OLD.check_out_latitude
      OR NEW.check_out_longitude IS DISTINCT FROM OLD.check_out_longitude
      OR NEW.check_out_accuracy_m IS DISTINCT FROM OLD.check_out_accuracy_m
      OR NEW.check_out_location_captured_at IS DISTINCT FROM OLD.check_out_location_captured_at
      OR NEW.check_out_address IS DISTINCT FROM OLD.check_out_address
    ) THEN
      RAISE EXCEPTION 'The recorded check-out location cannot be changed';
    END IF;
  END IF;

  IF NEW.check_in_latitude IS NULL THEN
    NEW.check_in_location_captured_at := NULL;
    NEW.check_in_address := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.check_in_latitude IS NULL THEN
    NEW.check_in_location_captured_at := now();
  END IF;

  IF NEW.check_out_latitude IS NULL THEN
    NEW.check_out_location_captured_at := NULL;
    NEW.check_out_address := NULL;
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
  check_in_address,
  check_out_latitude,
  check_out_longitude,
  check_out_accuracy_m,
  check_out_location_captured_at,
  check_out_address
ON public.attendance_records
FOR EACH ROW
EXECUTE FUNCTION public.protect_attendance_geolocation();

COMMENT ON COLUMN public.attendance_records.check_in_address IS
  'Human-readable address resolved from the device-reported check-in coordinates.';
COMMENT ON COLUMN public.attendance_records.check_out_address IS
  'Human-readable address resolved from the device-reported check-out coordinates.';

NOTIFY pgrst, 'reload schema';
