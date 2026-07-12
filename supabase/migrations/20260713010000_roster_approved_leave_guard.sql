-- Approved leave is authoritative for roster availability.
-- Existing conflicting shifts are removed when leave becomes approved, and
-- future direct inserts or updates are rejected at the database boundary.

CREATE INDEX IF NOT EXISTS leaves_business_status_dates_idx
  ON public.leaves (business_id, status, from_date, to_date);

CREATE INDEX IF NOT EXISTS roster_shifts_employee_day_idx
  ON public.roster_shifts (employee_id, day);

CREATE OR REPLACE FUNCTION public.reject_shift_during_approved_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.leaves leave_request
    WHERE leave_request.employee_id = NEW.employee_id
      AND lower(leave_request.status) = 'approved'
      AND NEW.day BETWEEN COALESCE(leave_request.start_date, leave_request.from_date)
                      AND COALESCE(leave_request.end_date, leave_request.to_date)
  ) THEN
    RAISE EXCEPTION 'Employee is on approved leave on % and cannot be rostered', NEW.day
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_shift_during_approved_leave ON public.roster_shifts;
CREATE TRIGGER trg_reject_shift_during_approved_leave
BEFORE INSERT OR UPDATE OF employee_id, day
ON public.roster_shifts
FOR EACH ROW
EXECUTE FUNCTION public.reject_shift_during_approved_leave();

CREATE OR REPLACE FUNCTION public.remove_shifts_for_approved_leave()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.status) = 'approved' THEN
    DELETE FROM public.roster_shifts shift
    WHERE shift.employee_id = NEW.employee_id
      AND shift.day BETWEEN COALESCE(NEW.start_date, NEW.from_date)
                        AND COALESCE(NEW.end_date, NEW.to_date);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_remove_shifts_for_approved_leave ON public.leaves;
CREATE TRIGGER trg_remove_shifts_for_approved_leave
AFTER INSERT OR UPDATE
ON public.leaves
FOR EACH ROW
EXECUTE FUNCTION public.remove_shifts_for_approved_leave();

-- Reconcile data that predates this rule.
DELETE FROM public.roster_shifts shift
USING public.leaves leave_request
WHERE shift.employee_id = leave_request.employee_id
  AND lower(leave_request.status) = 'approved'
  AND shift.day BETWEEN COALESCE(leave_request.start_date, leave_request.from_date)
                    AND COALESCE(leave_request.end_date, leave_request.to_date);

REVOKE ALL ON FUNCTION public.reject_shift_during_approved_leave() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_shifts_for_approved_leave() FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
