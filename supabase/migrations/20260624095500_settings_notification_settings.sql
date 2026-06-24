ALTER TABLE public.settings
ADD COLUMN IF NOT EXISTS notification_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.settings
SET notification_settings = '{}'::jsonb
WHERE notification_settings IS NULL;
