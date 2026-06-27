DROP POLICY IF EXISTS "notifications insert any" ON public.notifications;
DROP POLICY IF EXISTS "notifications insert same business" ON public.notifications;
DROP POLICY IF EXISTS "notifications insert own or managers" ON public.notifications;

GRANT INSERT ON public.notifications TO authenticated;

CREATE POLICY "notifications insert own or managers"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR (
    business_id = public.current_business_id()
    AND EXISTS (
      SELECT 1
      FROM public.profiles recipient
      WHERE recipient.id = notifications.user_id
        AND recipient.business_id = notifications.business_id
        AND recipient.role::text IN ('employer', 'manager')
    )
  )
);
