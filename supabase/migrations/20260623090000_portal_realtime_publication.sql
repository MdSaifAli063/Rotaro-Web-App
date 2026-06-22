ALTER TABLE public.attendance_records REPLICA IDENTITY FULL;
ALTER TABLE public.leaves REPLICA IDENTITY FULL;
ALTER TABLE public.leave_balances REPLICA IDENTITY FULL;
ALTER TABLE public.shift_swaps REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attendance_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_records;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leaves'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leaves;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'leave_balances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_balances;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'shift_swaps'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_swaps;
  END IF;
END $$;
