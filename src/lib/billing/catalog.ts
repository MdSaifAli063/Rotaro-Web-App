export type PaidBillingPlanKey = "professional" | "business";
export type BillingCycle = "monthly" | "annual";

export const PAID_PLAN_META = {
  professional: {
    monthly: {
      planName: "Professional",
      amountCents: 199900,
      currency: "INR",
      interval: "month",
      providerPeriod: "monthly",
    },
    annual: {
      planName: "Professional",
      amountCents: 1999000,
      currency: "INR",
      interval: "year",
      providerPeriod: "yearly",
    },
  },
  business: {
    monthly: {
      planName: "Business",
      amountCents: 649900,
      currency: "INR",
      interval: "month",
      providerPeriod: "monthly",
    },
    annual: {
      planName: "Business",
      amountCents: 6499000,
      currency: "INR",
      interval: "year",
      providerPeriod: "yearly",
    },
  },
} as const;

export function formatPaidPlanPrice(planKey: PaidBillingPlanKey, cycle: BillingCycle) {
  const plan = PAID_PLAN_META[planKey][cycle];
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: plan.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(plan.amountCents / 100);
}

export function normalizePaidPlanKey(value: unknown): PaidBillingPlanKey {
  return value === "business" ? "business" : "professional";
}

export function normalizeBillingCycle(value: unknown): BillingCycle {
  return value === "annual" || value === "year" ? "annual" : "monthly";
}
