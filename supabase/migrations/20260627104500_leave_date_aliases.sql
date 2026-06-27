ALTER TABLE public.leaves
ADD COLUMN IF NOT EXISTS from_date date;

ALTER TABLE public.leaves
ADD COLUMN IF NOT EXISTS to_date date;

ALTER TABLE public.leaves
ADD COLUMN IF NOT EXISTS start_date date;

ALTER TABLE public.leaves
ADD COLUMN IF NOT EXISTS end_date date;

UPDATE public.leaves
SET
  from_date = COALESCE(from_date, start_date),
  start_date = COALESCE(start_date, from_date),
  to_date = COALESCE(to_date, end_date),
  end_date = COALESCE(end_date, to_date)
WHERE from_date IS NULL
   OR start_date IS NULL
   OR to_date IS NULL
   OR end_date IS NULL;

CREATE OR REPLACE FUNCTION public.sync_leave_date_aliases()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.from_date IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.from_date := NEW.start_date;
  END IF;

  IF NEW.start_date IS NULL AND NEW.from_date IS NOT NULL THEN
    NEW.start_date := NEW.from_date;
  END IF;

  IF NEW.to_date IS NULL AND NEW.end_date IS NOT NULL THEN
    NEW.to_date := NEW.end_date;
  END IF;

  IF NEW.end_date IS NULL AND NEW.to_date IS NOT NULL THEN
    NEW.end_date := NEW.to_date;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leaves_date_aliases ON public.leaves;
CREATE TRIGGER trg_leaves_date_aliases
BEFORE INSERT OR UPDATE OF from_date, to_date, start_date, end_date
ON public.leaves
FOR EACH ROW
EXECUTE FUNCTION public.sync_leave_date_aliases();
