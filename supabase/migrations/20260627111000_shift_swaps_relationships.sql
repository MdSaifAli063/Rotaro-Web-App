DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shift_swaps_requester_employee_id_fkey'
  ) THEN
    ALTER TABLE public.shift_swaps
    ADD CONSTRAINT shift_swaps_requester_employee_id_fkey
    FOREIGN KEY (requester_employee_id)
    REFERENCES public.employees(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shift_swaps_target_employee_id_fkey'
  ) THEN
    ALTER TABLE public.shift_swaps
    ADD CONSTRAINT shift_swaps_target_employee_id_fkey
    FOREIGN KEY (target_employee_id)
    REFERENCES public.employees(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shift_swaps_requester_shift_id_fkey'
  ) THEN
    ALTER TABLE public.shift_swaps
    ADD CONSTRAINT shift_swaps_requester_shift_id_fkey
    FOREIGN KEY (requester_shift_id)
    REFERENCES public.roster_shifts(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shift_swaps_target_shift_id_fkey'
  ) THEN
    ALTER TABLE public.shift_swaps
    ADD CONSTRAINT shift_swaps_target_shift_id_fkey
    FOREIGN KEY (target_shift_id)
    REFERENCES public.roster_shifts(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
