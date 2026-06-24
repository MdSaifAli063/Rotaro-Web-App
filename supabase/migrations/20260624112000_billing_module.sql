CREATE OR REPLACE FUNCTION public.is_manager_or_employer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_role() IN ('employer', 'manager'), false)
$$;

REVOKE EXECUTE ON FUNCTION public.is_manager_or_employer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager_or_employer() TO authenticated;

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  plan_key TEXT NOT NULL DEFAULT 'starter',
  plan_name TEXT NOT NULL DEFAULT 'Starter',
  status TEXT NOT NULL DEFAULT 'active',
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  currency TEXT NOT NULL DEFAULT 'AUD',
  amount_cents INT NOT NULL DEFAULT 0,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_checkout_url TEXT,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'manual',
  invoice_number TEXT,
  amount_cents INT NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'AUD',
  status TEXT NOT NULL DEFAULT 'paid',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,
  hosted_invoice_url TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_invoices TO authenticated;
GRANT ALL ON public.billing_subscriptions TO service_role;
GRANT ALL ON public.billing_invoices TO service_role;

ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business read billing subscriptions"
ON public.billing_subscriptions
FOR SELECT
TO authenticated
USING (business_id = public.current_business_id());

CREATE POLICY "Employer manage billing subscriptions"
ON public.billing_subscriptions
FOR ALL
TO authenticated
USING (business_id = public.current_business_id() AND public.is_manager_or_employer())
WITH CHECK (business_id = public.current_business_id() AND public.is_manager_or_employer());

CREATE POLICY "Business read billing invoices"
ON public.billing_invoices
FOR SELECT
TO authenticated
USING (business_id = public.current_business_id());

CREATE POLICY "Employer manage billing invoices"
ON public.billing_invoices
FOR ALL
TO authenticated
USING (business_id = public.current_business_id() AND public.is_manager_or_employer())
WITH CHECK (business_id = public.current_business_id() AND public.is_manager_or_employer());

INSERT INTO public.billing_subscriptions (business_id, provider, plan_key, plan_name, status, billing_interval, currency, amount_cents)
SELECT id, 'manual', 'starter', 'Starter', 'active', 'monthly', 'AUD', 0
FROM public.businesses
ON CONFLICT (business_id) DO NOTHING;
