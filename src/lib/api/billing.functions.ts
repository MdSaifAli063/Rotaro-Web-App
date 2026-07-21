import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

export type BillingPlanKey = "starter" | "professional" | "business";
export type BillingCycle = "monthly" | "annual";

export type BillingProviderStatus = {
  razorpay: {
    keyIdConfigured: boolean;
    keySecretConfigured: boolean;
    webhookSecretConfigured: boolean;
    proMonthlyPlanConfigured: boolean;
    proAnnualPlanConfigured: boolean;
    businessMonthlyPlanConfigured: boolean;
    businessAnnualPlanConfigured: boolean;
  };
};

const authenticatedInput = z.object({ accessToken: z.string().min(1) });
const checkoutInputSchema = authenticatedInput.extend({
  planKey: z.enum(["professional", "business"]),
  billingCycle: z.enum(["monthly", "annual"]),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
});

const PLAN_META = {
  professional: {
    monthly: { planName: "Professional", amountCents: 2000, currency: "USD", interval: "month" },
    annual: { planName: "Professional", amountCents: 20000, currency: "USD", interval: "year" },
  },
  business: {
    monthly: { planName: "Business", amountCents: 7900, currency: "USD", interval: "month" },
    annual: { planName: "Business", amountCents: 79000, currency: "USD", interval: "year" },
  },
} as const;

async function requireBillingManager(accessToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !auth.user) throw new Error("Your session has expired. Please sign in again.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("business_id,role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || !profile?.business_id) throw new Error("Your workspace could not be found.");
  if (!["employer", "manager"].includes(String(profile.role))) {
    throw new Error("Only an employer or manager can manage billing.");
  }

  return { supabaseAdmin, businessId: profile.business_id, user: auth.user };
}

function razorpayAuthorization(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export const getBillingProviderStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<BillingProviderStatus> => {
    const config = getServerConfig();
    return {
      razorpay: {
        keyIdConfigured: !!config.billing.razorpayKeyId,
        keySecretConfigured: !!config.billing.razorpayKeySecret,
        webhookSecretConfigured: !!config.billing.razorpayWebhookSecret,
        proMonthlyPlanConfigured: !!config.billing.razorpayProMonthlyPlanId,
        proAnnualPlanConfigured: !!config.billing.razorpayProAnnualPlanId,
        businessMonthlyPlanConfigured: !!config.billing.razorpayBusinessMonthlyPlanId,
        businessAnnualPlanConfigured: !!config.billing.razorpayBusinessAnnualPlanId,
      },
    };
  },
);

export const createBillingCheckout = createServerFn({ method: "POST" })
  .validator(checkoutInputSchema)
  .handler(async ({ data }) => {
    const config = getServerConfig();
    const { supabaseAdmin, businessId, user } = await requireBillingManager(data.accessToken);
    if (!config.billing.razorpayKeyId || !config.billing.razorpayKeySecret) {
      throw new Error("Razorpay is not configured yet. Contact support.");
    }

    const planIds = {
      professional: {
        monthly: config.billing.razorpayProMonthlyPlanId,
        annual: config.billing.razorpayProAnnualPlanId,
      },
      business: {
        monthly: config.billing.razorpayBusinessMonthlyPlanId,
        annual: config.billing.razorpayBusinessAnnualPlanId,
      },
    } as const;
    const planId = planIds[data.planKey][data.billingCycle];
    if (!planId) {
      throw new Error(`The Razorpay ${data.planKey} ${data.billingCycle} plan is not configured.`);
    }

    const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        Authorization: razorpayAuthorization(
          config.billing.razorpayKeyId,
          config.billing.razorpayKeySecret,
        ),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: planId,
        total_count: data.billingCycle === "annual" ? 10 : 120,
        quantity: 1,
        customer_notify: true,
        notes: {
          business_id: businessId,
          plan_key: data.planKey,
          billing_cycle: data.billingCycle,
          customer_email: data.customerEmail ?? user.email ?? "",
          customer_name: data.customerName ?? "",
          source: "rotaro",
        },
      }),
    });

    const result = (await response.json().catch(() => null)) as {
      id?: string;
      short_url?: string;
      error?: { description?: string };
    } | null;
    if (!response.ok) {
      throw new Error(
        result?.error?.description || `Razorpay checkout failed (${response.status}).`,
      );
    }
    if (!result?.id || !result.short_url) {
      throw new Error("Razorpay did not return a valid subscription checkout link.");
    }

    const { error } = await supabaseAdmin.from("billing_checkout_sessions").upsert(
      {
        business_id: businessId,
        provider: "razorpay",
        provider_subscription_id: result.id,
        plan_key: data.planKey,
        billing_cycle: data.billingCycle,
        status: "pending",
        checkout_url: result.short_url,
      },
      { onConflict: "provider_subscription_id" },
    );
    if (error) throw new Error(error.message);

    return { provider: "razorpay" as const, url: result.short_url };
  });

export const activateStarterPlan = createServerFn({ method: "POST" })
  .validator(authenticatedInput)
  .handler(async ({ data }) => {
    const { supabaseAdmin, businessId } = await requireBillingManager(data.accessToken);
    const { data: existing, error: loadError } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("id,plan_key,status,trial_ends_at")
      .eq("business_id", businessId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);

    if (existing) {
      return {
        ok: true as const,
        existing: true,
        trialEndsAt: existing.trial_ends_at,
        status: existing.status,
      };
    }

    const trialEndsAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin.from("billing_subscriptions").insert({
      business_id: businessId,
      provider: "manual",
      plan_key: "starter",
      plan_name: "60-day free trial",
      status: "trialing",
      billing_interval: "trial",
      currency: "USD",
      amount_cents: 0,
      current_period_end: trialEndsAt,
      trial_ends_at: trialEndsAt,
      cancel_at_period_end: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, existing: false, trialEndsAt, status: "trialing" };
  });

export const finalizeRazorpayBillingCheckout = createServerFn({ method: "POST" })
  .validator(authenticatedInput)
  .handler(async ({ data }) => {
    const config = getServerConfig();
    const { supabaseAdmin, businessId } = await requireBillingManager(data.accessToken);
    if (!config.billing.razorpayKeyId || !config.billing.razorpayKeySecret) {
      throw new Error("Razorpay is not configured yet.");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("billing_checkout_sessions")
      .select("id,provider_subscription_id,plan_key,billing_cycle")
      .eq("business_id", businessId)
      .eq("provider", "razorpay")
      .in("status", ["pending", "authenticated", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing?.provider_subscription_id) {
      throw new Error("No pending Razorpay subscription was found for this workspace.");
    }

    const response = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(existing.provider_subscription_id)}`,
      {
        headers: {
          Authorization: razorpayAuthorization(
            config.billing.razorpayKeyId,
            config.billing.razorpayKeySecret,
          ),
        },
      },
    );
    const subscription = (await response.json().catch(() => null)) as {
      id?: string;
      status?: string;
      current_end?: number;
      error?: { description?: string };
    } | null;
    if (!response.ok) {
      throw new Error(
        subscription?.error?.description || `Razorpay verification failed (${response.status}).`,
      );
    }
    if (!subscription?.id || !["active", "authenticated"].includes(subscription.status ?? "")) {
      throw new Error(`Payment is not active yet (${subscription?.status ?? "pending"}).`);
    }

    const planKey = existing.plan_key === "business" ? "business" : "professional";
    const cycle = existing.billing_cycle === "annual" ? "annual" : "monthly";
    const meta = PLAN_META[planKey][cycle];
    const { error } = await supabaseAdmin.from("billing_subscriptions").upsert(
      {
        business_id: businessId,
        provider: "razorpay",
        plan_key: planKey,
        status: "active",
        plan_name: meta.planName,
        billing_interval: meta.interval,
        currency: meta.currency,
        amount_cents: meta.amountCents,
        provider_subscription_id: subscription.id,
        provider_checkout_url: null,
        current_period_end: subscription.current_end
          ? new Date(subscription.current_end * 1000).toISOString()
          : null,
        trial_ends_at: null,
      },
      { onConflict: "business_id" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("billing_checkout_sessions")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { ok: true as const };
  });
