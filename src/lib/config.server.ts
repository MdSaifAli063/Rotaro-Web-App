import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client — values here never reach the browser.
//
// On Cloudflare Workers, env binds at REQUEST time. Module-scope reads
// (e.g. `const x = process.env.X`) resolve to undefined — always read
// process.env INSIDE a function or handler.
//
// When to use which env-access pattern:
//   - .server.ts module (this file): server-only helpers reused across
//     handlers. Wrap reads in a function so they run per-request.
//   - inline process.env inside a createServerFn handler: one-off reads
//     not reused elsewhere.
//   - import.meta.env.VITE_FOO: PUBLIC config readable from both client
//     and server (analytics IDs, public URLs). Define in .env with the
//     VITE_ prefix. Never put secrets here — they ship to the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    billing: {
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
      razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
      razorpayProMonthlyPlanId: process.env.RAZORPAY_PRO_MONTHLY_PLAN_ID,
      razorpayProAnnualPlanId: process.env.RAZORPAY_PRO_ANNUAL_PLAN_ID,
      razorpayBusinessMonthlyPlanId: process.env.RAZORPAY_BUSINESS_MONTHLY_PLAN_ID,
      razorpayBusinessAnnualPlanId: process.env.RAZORPAY_BUSINESS_ANNUAL_PLAN_ID,
    },
    emailjs: {
      serviceId: process.env.VITE_EMAILJS_SERVICE_ID,
      publicKey: process.env.VITE_EMAILJS_PUBLIC_KEY,
      privateKey: process.env.EMAILJS_PRIVATE_KEY,
      appUrl: process.env.VITE_APP_URL || process.env.APP_URL || process.env.VERCEL_URL,
    },
  };
}
