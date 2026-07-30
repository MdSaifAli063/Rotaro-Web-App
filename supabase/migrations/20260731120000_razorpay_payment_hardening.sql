-- Harden Razorpay billing against plan tampering, duplicate callbacks, and webhook replays.

BEGIN;

ALTER TABLE public.billing_checkout_sessions
  ADD COLUMN IF NOT EXISTS expected_plan_id text,
  ADD COLUMN IF NOT EXISTS provider_payment_id text;

CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_provider_payment_key
  ON public.billing_checkout_sessions (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_subscriptions_provider_subscription_key
  ON public.billing_subscriptions (provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS billing_checkout_business_status_idx
  ON public.billing_checkout_sessions (business_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.billing_webhook_events (
  event_id text PRIMARY KEY,
  provider text NOT NULL DEFAULT 'razorpay' CHECK (provider = 'razorpay'),
  event_type text NOT NULL,
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed')),
  processing_started_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_webhook_events FROM anon, authenticated;
GRANT ALL ON public.billing_webhook_events TO service_role;

COMMENT ON TABLE public.billing_webhook_events IS
  'Service-only idempotency ledger for signed Razorpay webhook deliveries.';
COMMENT ON COLUMN public.billing_checkout_sessions.expected_plan_id IS
  'Server-selected Razorpay plan ID checked again before granting access.';

COMMIT;
