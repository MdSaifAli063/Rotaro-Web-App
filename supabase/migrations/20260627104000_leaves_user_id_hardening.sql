ALTER TABLE public.leaves
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.leaves l
SET user_id = e.user_id
FROM public.employees e
WHERE l.employee_id = e.id
  AND l.user_id IS NULL
  AND e.user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_leave_user_id()
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

DROP TRIGGER IF EXISTS trg_leaves_user_id ON public.leaves;
CREATE TRIGGER trg_leaves_user_id
BEFORE INSERT OR UPDATE OF employee_id, user_id
ON public.leaves
FOR EACH ROW
EXECUTE FUNCTION public.set_leave_user_id();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.leaves
    WHERE user_id IS NULL
  ) THEN
    ALTER TABLE public.leaves
    ALTER COLUMN user_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'leaves.user_id still has null rows; not setting NOT NULL yet.';
  END IF;
END $$;
