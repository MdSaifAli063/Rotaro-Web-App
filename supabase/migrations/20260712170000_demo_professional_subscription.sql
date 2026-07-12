-- Keep the preserved employer demo on Professional while the application
-- applies its dedicated 100-employee test allowance. Normal paid
-- Professional and Business workspaces are limited to 1,000 employees.
UPDATE public.billing_subscriptions subscription
SET plan_key = 'professional',
    plan_name = 'Professional',
    status = 'active',
    updated_at = now()
FROM public.profiles profile
WHERE lower(profile.email) = 'employer@rotaro.com'
  AND profile.business_id = subscription.business_id;

NOTIFY pgrst, 'reload schema';
