-- Keep zero-value trials and future billing rows aligned with the Razorpay
-- account currency. Paid rows continue to use verified provider metadata.

ALTER TABLE public.billing_subscriptions
  ALTER COLUMN currency SET DEFAULT 'INR';

ALTER TABLE public.billing_invoices
  ALTER COLUMN currency SET DEFAULT 'INR';

UPDATE public.billing_subscriptions
SET currency = 'INR', updated_at = now()
WHERE plan_key = 'starter' AND amount_cents = 0;

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
    NEW.currency := 'INR';
    NEW.amount_cents := 0;
    NEW.trial_ends_at := COALESCE(NEW.trial_ends_at, now() + interval '60 days');
    NEW.current_period_end := COALESCE(NEW.current_period_end, NEW.trial_ends_at);
    NEW.cancel_at_period_end := true;
  END IF;
  RETURN NEW;
END;
$$;
