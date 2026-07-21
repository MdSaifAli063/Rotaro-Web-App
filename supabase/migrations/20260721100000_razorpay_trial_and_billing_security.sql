-- Razorpay-only billing, one-time 60-day trial, and server-owned entitlements.

ALTER TABLE public.billing_subscriptions
  ALTER COLUMN currency SET DEFAULT 'USD';

CREATE TABLE IF NOT EXISTS public.billing_checkout_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_subscription_id text NOT NULL UNIQUE,
  plan_key text NOT NULL CHECK (plan_key IN ('professional', 'business')),
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  status text NOT NULL DEFAULT 'pending',
  checkout_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_checkout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_checkout_sessions FROM anon, authenticated;
GRANT ALL ON public.billing_checkout_sessions TO service_role;

UPDATE public.billing_subscriptions
SET
  plan_name = '60-day free trial',
  status = 'trialing',
  billing_interval = 'trial',
  currency = 'USD',
  amount_cents = 0,
  trial_ends_at = COALESCE(trial_ends_at, now() + interval '60 days'),
  current_period_end = COALESCE(current_period_end, now() + interval '60 days'),
  cancel_at_period_end = true,
  updated_at = now()
WHERE plan_key = 'starter'
  AND status IN ('active', 'manual', 'trialing');

CREATE OR REPLACE FUNCTION public.prepare_starter_trial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_key = 'starter' THEN
    NEW.provider := 'manual';
    NEW.plan_name := '60-day free trial';
    NEW.status := 'trialing';
    NEW.billing_interval := 'trial';
    NEW.currency := 'USD';
    NEW.amount_cents := 0;
    NEW.trial_ends_at := COALESCE(NEW.trial_ends_at, now() + interval '60 days');
    NEW.current_period_end := COALESCE(NEW.current_period_end, NEW.trial_ends_at);
    NEW.cancel_at_period_end := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_starter_trial_trigger ON public.billing_subscriptions;
CREATE TRIGGER prepare_starter_trial_trigger
BEFORE INSERT ON public.billing_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.prepare_starter_trial();

DROP POLICY IF EXISTS "Employer manage billing subscriptions" ON public.billing_subscriptions;
DROP POLICY IF EXISTS "Employer manage billing invoices" ON public.billing_invoices;

REVOKE INSERT, UPDATE, DELETE ON public.billing_subscriptions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_invoices FROM authenticated;
GRANT SELECT ON public.billing_subscriptions TO authenticated;
GRANT SELECT ON public.billing_invoices TO authenticated;
GRANT ALL ON public.billing_subscriptions TO service_role;
GRANT ALL ON public.billing_invoices TO service_role;

DELETE FROM public.billing_invoices duplicate
USING public.billing_invoices original
WHERE duplicate.provider = original.provider
  AND duplicate.invoice_number = original.invoice_number
  AND duplicate.invoice_number IS NOT NULL
  AND (duplicate.created_at, duplicate.id) > (original.created_at, original.id);

CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_provider_number_key
ON public.billing_invoices (provider, invoice_number)
WHERE invoice_number IS NOT NULL;

COMMENT ON TABLE public.billing_subscriptions IS
  'Server-owned subscription state. Paid access is synchronized from verified Razorpay API responses and webhooks.';
