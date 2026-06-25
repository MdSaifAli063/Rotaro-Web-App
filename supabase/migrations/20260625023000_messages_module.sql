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
  SELECT COALESCE(
    (
      SELECT role::text IN ('employer', 'manager')
      FROM public.profiles
      WHERE id = auth.uid()
    ),
    false
  )
$$;

REVOKE EXECUTE ON FUNCTION public.current_business_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_employer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_employer() TO authenticated;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_business_id_idx ON public.messages(business_id);
CREATE INDEX IF NOT EXISTS messages_recipient_id_created_at_idx ON public.messages(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_id_created_at_idx ON public.messages(sender_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages REPLICA IDENTITY FULL;

REVOKE ALL ON public.messages FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.messages TO authenticated;
GRANT UPDATE (is_read) ON public.messages TO authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_messages_updated_at ON public.messages;
CREATE TRIGGER set_messages_updated_at
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "messages view participant" ON public.messages;
CREATE POLICY "messages view participant"
ON public.messages
FOR SELECT
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (sender_id = auth.uid() OR recipient_id = auth.uid() OR public.is_manager_or_employer())
);

DROP POLICY IF EXISTS "messages insert own business" ON public.messages;
CREATE POLICY "messages insert own business"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  business_id = public.current_business_id()
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.profiles recipient
    WHERE recipient.id = messages.recipient_id
      AND recipient.business_id = messages.business_id
  )
);

DROP POLICY IF EXISTS "messages update recipient read state" ON public.messages;
CREATE POLICY "messages update recipient read state"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND recipient_id = auth.uid()
)
WITH CHECK (
  business_id = public.current_business_id()
  AND recipient_id = auth.uid()
  AND sender_id = messages.sender_id
);

DROP POLICY IF EXISTS "messages delete participant" ON public.messages;
CREATE POLICY "messages delete participant"
ON public.messages
FOR DELETE
TO authenticated
USING (
  business_id = public.current_business_id()
  AND (sender_id = auth.uid() OR recipient_id = auth.uid())
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
