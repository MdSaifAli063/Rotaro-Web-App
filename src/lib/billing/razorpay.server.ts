import { createHmac, timingSafeEqual } from "node:crypto";

import { PAID_PLAN_META, type BillingCycle, type PaidBillingPlanKey } from "./catalog";

export type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
};

export type RazorpayPlan = {
  id?: string;
  interval?: number;
  period?: string;
  item?: {
    active?: boolean;
    amount?: number;
    currency?: string;
  };
};

export type RazorpaySubscription = {
  id?: string;
  plan_id?: string;
  customer_id?: string | null;
  status?: string;
  current_end?: number | null;
  paid_count?: number;
  quantity?: number;
  notes?: Record<string, string | undefined>;
  has_scheduled_changes?: boolean;
  change_scheduled_at?: string | null;
};

const PROVIDER_TIMEOUT_MS = 10_000;

function authorization({ keyId, keySecret }: RazorpayCredentials) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export async function razorpayRequest<T>(
  credentials: RazorpayCredentials,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: authorization(credentials),
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  const result = (await response.json().catch(() => null)) as
    | (T & { error?: { description?: string } })
    | null;
  if (!response.ok) {
    console.error("[Razorpay] Provider request failed", {
      path,
      status: response.status,
      description: result?.error?.description,
    });
    throw new Error("The payment provider could not complete the request. Please try again.");
  }
  if (!result) throw new Error("The payment provider returned an invalid response.");
  return result;
}

export async function fetchRazorpayPlan(
  credentials: RazorpayCredentials,
  planId: string,
): Promise<RazorpayPlan> {
  return razorpayRequest<RazorpayPlan>(credentials, `/plans/${encodeURIComponent(planId)}`);
}

export async function fetchRazorpaySubscription(
  credentials: RazorpayCredentials,
  subscriptionId: string,
): Promise<RazorpaySubscription> {
  return razorpayRequest<RazorpaySubscription>(
    credentials,
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

export async function verifyRazorpayPlan(
  credentials: RazorpayCredentials,
  planId: string,
  planKey: PaidBillingPlanKey,
  cycle: BillingCycle,
) {
  if (!/^plan_[A-Za-z0-9]+$/.test(planId)) {
    throw new Error("The configured Razorpay plan ID is invalid. Contact support.");
  }
  const plan = await fetchRazorpayPlan(credentials, planId);
  const expected = PAID_PLAN_META[planKey][cycle];
  const matches =
    plan.id === planId &&
    plan.interval === 1 &&
    plan.period === expected.providerPeriod &&
    plan.item?.active === true &&
    plan.item?.amount === expected.amountCents &&
    plan.item?.currency?.toUpperCase() === expected.currency;
  if (!matches) {
    console.error("[Razorpay] Plan configuration mismatch", {
      planId,
      planKey,
      cycle,
      providerAmount: plan.item?.amount,
      providerCurrency: plan.item?.currency,
      providerPeriod: plan.period,
    });
    throw new Error(
      "This billing plan is not configured with the advertised price. Contact support.",
    );
  }
}

export function verifyRazorpayCheckoutSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  keySecret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const receivedBytes = Buffer.from(signature, "hex");
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}
