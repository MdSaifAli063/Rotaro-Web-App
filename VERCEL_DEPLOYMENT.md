# Vercel Deployment

This project is configured for Vercel through Nitro's Vercel preset.

## Build Settings

- Framework preset: Other
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: leave empty
- Node version: 22.x

The build creates `.vercel/output`, which Vercel deploys directly.

## Required Environment Variables

Add the values from your local `.env` to the Vercel project settings:

- `SUPABASE_PROJECT_ID`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Add billing variables when Stripe or Razorpay subscriptions should be live:

- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_MONTHLY_PRICE_ID`
- `STRIPE_PRO_ANNUAL_PRICE_ID`
- `STRIPE_BUSINESS_MONTHLY_PRICE_ID`
- `STRIPE_BUSINESS_ANNUAL_PRICE_ID`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_PRO_MONTHLY_PLAN_ID`
- `RAZORPAY_PRO_ANNUAL_PLAN_ID`
- `RAZORPAY_BUSINESS_MONTHLY_PLAN_ID`
- `RAZORPAY_BUSINESS_ANNUAL_PLAN_ID`

## Deploy

1. Push the repository to GitHub/GitLab/Bitbucket.
2. Import the repository in Vercel.
3. Add the environment variables above.
4. Deploy.

For CLI deployment after linking the project:

```bash
npx vercel deploy --prod
```
