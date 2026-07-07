-- Harden onboarding access after schema drift: an authenticated user may create
-- exactly their own business, then attach their own profile to it.

ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

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
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role::text) IN ('employer', 'manager')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_business_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_employer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_employer() TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own business" ON public.businesses;
DROP POLICY IF EXISTS "Owner insert business" ON public.businesses;
DROP POLICY IF EXISTS "Owner update business" ON public.businesses;
DROP POLICY IF EXISTS "Owner delete business" ON public.businesses;
DROP POLICY IF EXISTS "Business members can view business" ON public.businesses;
DROP POLICY IF EXISTS "Business owners can create business" ON public.businesses;
DROP POLICY IF EXISTS "Business owners and managers can update business" ON public.businesses;
DROP POLICY IF EXISTS "Business owners can delete business" ON public.businesses;

CREATE POLICY "Business members can view business"
ON public.businesses
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR id = public.current_business_id()
);

CREATE POLICY "Business owners can create business"
ON public.businesses
FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Business owners and managers can update business"
ON public.businesses
FOR UPDATE
TO authenticated
USING (
  owner_id = auth.uid()
  OR (
    id = public.current_business_id()
    AND public.is_manager_or_employer()
  )
)
WITH CHECK (
  owner_id = auth.uid()
  OR (
    id = public.current_business_id()
    AND public.is_manager_or_employer()
  )
);

CREATE POLICY "Business owners can delete business"
ON public.businesses
FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Own profile read" ON public.profiles;
DROP POLICY IF EXISTS "Own profile insert" ON public.profiles;
DROP POLICY IF EXISTS "Own profile update" ON public.profiles;

CREATE POLICY "Own profile read"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR business_id = public.current_business_id()
);

CREATE POLICY "Own profile insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

CREATE POLICY "Own profile update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());
