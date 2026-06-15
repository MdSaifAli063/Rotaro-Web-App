
DROP POLICY IF EXISTS "notifications insert any" ON public.notifications;
CREATE POLICY "notifications insert same business" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR business_id = public.current_business_id()
  );

REVOKE EXECUTE ON FUNCTION public.is_manager_or_employer() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_business_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_role() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_manager_or_employer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated;
