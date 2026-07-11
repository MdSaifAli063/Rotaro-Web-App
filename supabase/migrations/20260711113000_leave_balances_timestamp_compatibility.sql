-- Older workspaces may have leave_balances without these audit columns.
-- The leave-decision transaction uses them when it locks a balance row.
ALTER TABLE public.leave_balances
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

NOTIFY pgrst, 'reload schema';
