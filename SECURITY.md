# Security Policy

Rotaro handles workforce data, employee profiles, attendance records, leave requests, roster assignments, messages, and billing metadata. Treat this repository and its deployed environments as production systems.

## Supported Version

Only the current `main` branch and the latest production deployment are supported with security updates.

## Reporting A Vulnerability

Report security issues privately to the project owner or the production support contact. Do not open a public issue for vulnerabilities, exposed secrets, authentication bypasses, or data access concerns.

Include:

- A short description of the issue
- Steps to reproduce
- The affected route, table, function, or API
- Any screenshots or request IDs that help verify the report

## Production Security Checklist

Before each production deployment:

- Run `npm run typecheck`
- Run `npm run lint`
- Run `npm run security:audit`
- Run `npm run build`
- Confirm Supabase Row Level Security is enabled for private tables
- Confirm service-role keys are stored only in server-side environment variables
- Confirm public client keys are limited to Supabase anon/publishable keys only
- Confirm payment and email webhook secrets are configured in Vercel environment variables
- Confirm Razorpay live keys and all four live plan IDs come from the same account
- Confirm the Razorpay webhook uses HTTPS and a dedicated secret
- Confirm the latest billing migration is applied and webhook replay protection is active
- Confirm no `RAZORPAY_*` secret is present in a `VITE_` environment variable
- Confirm Vercel security headers are active from `vercel.json`

## Secrets

Never commit `.env`, `.env.local`, payment secrets, webhook secrets, Supabase service-role keys, SMTP passwords, or provider API keys. Use `.env.example` only for placeholders.

Server-only secrets must not be exposed through `VITE_` variables or client bundles.

## Payments

Razorpay is the only supported payment provider. The server creates subscriptions, validates the provider plan and checkout signature, and grants paid access only after an authoritative provider fetch reports an active subscription with a captured payment. Signed webhooks are processed from the raw request body and recorded in a service-only idempotency ledger.

Never grant entitlements from browser-supplied plan, price, payment status, or redirect parameters. Do not weaken the service-only billing table permissions or expose the service-role key to the browser.

## Data Access

Supabase RLS policies must keep employee and employer data scoped to the correct business/workspace. Any new table that stores user, employee, attendance, leave, roster, notification, message, billing, or organization data needs an explicit RLS policy before production use.

## Dependencies

Production dependency health is checked with:

```bash
npm run security:audit
```

If a critical or high vulnerability is reported, patch or replace the dependency before deployment.
