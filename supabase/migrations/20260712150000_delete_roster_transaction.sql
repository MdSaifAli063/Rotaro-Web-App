-- Delete a roster and its dependent shifts through one authorised transaction.
-- This avoids client-side partial deletes when legacy foreign keys or RLS differ
-- from the current schema.
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

  DELETE FROM public.roster_shifts WHERE roster_id = p_roster_id;
  DELETE FROM public.rosters WHERE id = p_roster_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_roster(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
