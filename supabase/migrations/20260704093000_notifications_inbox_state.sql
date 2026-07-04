ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_user_inbox_idx
  ON public.notifications (user_id, deleted_at, dismissed_at, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_history_idx
  ON public.notifications (user_id, deleted_at, created_at DESC);
