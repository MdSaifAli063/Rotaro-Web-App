export type PaidBillingPlanKey = "professional" | "business";
export type BillingCycle = "monthly" | "annual";

export const PAID_PLAN_META = {
  professional: {
    monthly: {
      planName: "Professional",
      amountCents: 2000,
      currency: "USD",
      interval: "month",
      providerPeriod: "monthly",
    },
    annual: {
      planName: "Professional",
      amountCents: 20000,
      currency: "USD",
      interval: "year",
      providerPeriod: "yearly",
    },
  },
  business: {
    monthly: {
      planName: "Business",
      amountCents: 7900,
      currency: "USD",
      interval: "month",
      providerPeriod: "monthly",
    },
    annual: {
      planName: "Business",
      amountCents: 79000,
      currency: "USD",
      interval: "year",
      providerPeriod: "yearly",
    },
  },
} as const;

export function normalizePaidPlanKey(value: unknown): PaidBillingPlanKey {
  return value === "business" ? "business" : "professional";
}

export function normalizeBillingCycle(value: unknown): BillingCycle {
  return value === "annual" || value === "year" ? "annual" : "monthly";
}
