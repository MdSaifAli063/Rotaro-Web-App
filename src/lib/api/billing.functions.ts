import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

export type BillingPlanKey = "starter" | "professional" | "business";
export type BillingCycle = "monthly" | "annual";
export type BillingProvider = "stripe" | "razorpay";

export type BillingProviderStatus = {
  stripe: {
    secretKeyConfigured: boolean;
    publishableKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    proMonthlyPriceConfigured: boolean;
    proAnnualPriceConfigured: boolean;
    businessMonthlyPriceConfigured: boolean;
    businessAnnualPriceConfigured: boolean;
  };
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

const checkoutInputSchema = z.object({
  provider: z.enum(["stripe", "razorpay"]),
  planKey: z.enum(["starter", "professional", "business"]),
  billingCycle: z.enum(["monthly", "annual"]),
  origin: z.string().url(),
  businessId: z.string().min(1),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
});

const stripeFinalizeInputSchema = z.object({
  businessId: z.string().min(1),
  sessionId: z.string().min(1),
});

const razorpayFinalizeInputSchema = z.object({
  businessId: z.string().min(1),
});

const starterInputSchema = z.object({
  businessId: z.string().min(1),
});

const PLAN_META: Record<
  Exclude<BillingPlanKey, "starter">,
  Record<
    BillingCycle,
    {
      planName: string;
      amountCents: number;
      currency: string;
      interval: string;
    }
  >
> = {
  professional: {
    monthly: { planName: "Professional", amountCents: 2900, currency: "AUD", interval: "month" },
    annual: { planName: "Professional", amountCents: 29000, currency: "AUD", interval: "year" },
  },
  business: {
    monthly: { planName: "Business", amountCents: 7900, currency: "AUD", interval: "month" },
    annual: { planName: "Business", amountCents: 79000, currency: "AUD", interval: "year" },
  },
};

export const getBillingProviderStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<BillingProviderStatus> => {
    const config = getServerConfig();
    return {
      stripe: {
        secretKeyConfigured: !!config.billing.stripeSecretKey,
        publishableKeyConfigured: !!config.billing.stripePublishableKey,
        webhookSecretConfigured: !!config.billing.stripeWebhookSecret,
        proMonthlyPriceConfigured: !!config.billing.stripeProMonthlyPriceId,
        proAnnualPriceConfigured: !!config.billing.stripeProAnnualPriceId,
        businessMonthlyPriceConfigured: !!config.billing.stripeBusinessMonthlyPriceId,
        businessAnnualPriceConfigured: !!config.billing.stripeBusinessAnnualPriceId,
      },
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stripePriceMap: Record<BillingPlanKey, Record<BillingCycle, string | undefined>> = {
      starter: { monthly: undefined, annual: undefined },
      professional: {
        monthly: config.billing.stripeProMonthlyPriceId,
        annual: config.billing.stripeProAnnualPriceId,
      },
      business: {
        monthly: config.billing.stripeBusinessMonthlyPriceId,
        annual: config.billing.stripeBusinessAnnualPriceId,
      },
    };
    const razorpayPlanMap: Record<BillingPlanKey, Record<BillingCycle, string | undefined>> = {
      starter: { monthly: undefined, annual: undefined },
      professional: {
        monthly: config.billing.razorpayProMonthlyPlanId,
        annual: config.billing.razorpayProAnnualPlanId,
      },
      business: {
        monthly: config.billing.razorpayBusinessMonthlyPlanId,
        annual: config.billing.razorpayBusinessAnnualPlanId,
      },
    };
    const planMeta = data.planKey === "starter" ? null : PLAN_META[data.planKey][data.billingCycle];
    const successUrl =
      data.provider === "stripe"
        ? `${data.origin}/billing?success=1&provider=${data.provider}&plan=${data.planKey}&cycle=${data.billingCycle}&session_id={CHECKOUT_SESSION_ID}`
        : `${data.origin}/billing?success=1&provider=${data.provider}&plan=${data.planKey}&cycle=${data.billingCycle}`;
    const cancelUrl = `${data.origin}/pricing?cancelled=1`;

    if (data.provider === "stripe") {
      const priceId = stripePriceMap[data.planKey][data.billingCycle];
      if (!priceId) {
        throw new Error(
          `Stripe ${data.planKey} ${data.billingCycle} price ID is missing in STRIPE_*_PRICE_ID env vars.`,
        );
      }
      if (!config.billing.stripeSecretKey) {
        throw new Error("Stripe secret key is missing.");
      }

      const body = new URLSearchParams();
      body.set("mode", "subscription");
      body.set("success_url", successUrl);
      body.set("cancel_url", cancelUrl);
      body.set("line_items[0][price]", priceId);
      body.set("line_items[0][quantity]", "1");
      body.set("client_reference_id", data.businessId);
      body.set("metadata[business_id]", data.businessId);
      body.set("metadata[plan_key]", data.planKey);
      body.set("metadata[billing_cycle]", data.billingCycle);
      if (data.customerEmail) body.set("customer_email", data.customerEmail);
      if (data.customerName) body.set("customer_creation", "always");
      const bodyString = body
        .toString()
        .replace(/%7BCHECKOUT_SESSION_ID%7D/g, "{CHECKOUT_SESSION_ID}");

      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.billing.stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyString,
      });

      if (!response.ok) {
        throw new Error(`Stripe checkout failed (${response.status})`);
      }

      const session = (await response.json()) as { url?: string };
      if (!session.url) throw new Error("Stripe checkout did not return a session URL.");

      if (planMeta) {
        const { error } = await supabaseAdmin.from("billing_subscriptions" as any).upsert(
          {
            business_id: data.businessId,
            provider: "stripe",
            plan_key: data.planKey,
            plan_name: planMeta.planName,
            status: "pending",
            billing_interval: planMeta.interval,
            currency: planMeta.currency,
            amount_cents: planMeta.amountCents,
            provider_checkout_url: session.url,
          },
          { onConflict: "business_id" },
        );
        if (error) throw new Error(error.message);
      }

      return { provider: "stripe" as const, url: session.url };
    }

    const planId = razorpayPlanMap[data.planKey][data.billingCycle];
    if (!planId) {
      throw new Error(
        `Razorpay ${data.planKey} ${data.billingCycle} plan ID is missing in RAZORPAY_*_PLAN_ID env vars.`,
      );
    }
    if (!config.billing.razorpayKeyId || !config.billing.razorpayKeySecret) {
      throw new Error("Razorpay key ID or secret is missing.");
    }

    const totalCount = data.billingCycle === "annual" ? 12 : 120;
    const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${config.billing.razorpayKeyId}:${config.billing.razorpayKeySecret}`,
          ).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: planId,
        total_count: totalCount,
        quantity: 1,
        customer_notify: true,
        notes: {
          business_id: data.businessId,
          plan_key: data.planKey,
          billing_cycle: data.billingCycle,
          source: "rotaro",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Razorpay subscription creation failed (${response.status})`);
    }

    const subscription = (await response.json()) as { short_url?: string; id?: string };
    const url =
      subscription.short_url || (subscription.id ? `https://rzp.io/l/${subscription.id}` : "");
    if (!url) throw new Error("Razorpay subscription did not return a checkout URL.");

    if (planMeta) {
      const { error } = await supabaseAdmin.from("billing_subscriptions" as any).upsert(
        {
          business_id: data.businessId,
          provider: "razorpay",
          plan_key: data.planKey,
          plan_name: planMeta.planName,
          status: "pending",
          billing_interval: planMeta.interval,
          currency: planMeta.currency,
          amount_cents: planMeta.amountCents,
          provider_subscription_id: subscription.id ?? null,
          provider_checkout_url: url,
        },
        { onConflict: "business_id" },
      );
      if (error) throw new Error(error.message);
    }

    return { provider: "razorpay" as const, url };
  });

export const activateStarterPlan = createServerFn({ method: "POST" })
  .validator(starterInputSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("billing_subscriptions" as any).upsert(
      {
        business_id: data.businessId,
        provider: "manual",
        plan_key: "starter",
        plan_name: "Starter",
        status: "active",
        billing_interval: "monthly",
        currency: "AUD",
        amount_cents: 0,
        provider_customer_id: null,
        provider_subscription_id: null,
        provider_checkout_url: null,
        current_period_end: null,
        trial_ends_at: null,
        cancel_at_period_end: false,
      },
      { onConflict: "business_id" },
    );

    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const finalizeStripeBillingCheckout = createServerFn({ method: "POST" })
  .validator(stripeFinalizeInputSchema)
  .handler(async ({ data }) => {
    const config = getServerConfig();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!config.billing.stripeSecretKey) {
      throw new Error("Stripe secret key is missing.");
    }

    const sessionResponse = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(data.sessionId)}?expand[]=subscription&expand[]=customer`,
      {
        headers: {
          Authorization: `Bearer ${config.billing.stripeSecretKey}`,
        },
      },
    );

    if (!sessionResponse.ok) {
      throw new Error(`Stripe session lookup failed (${sessionResponse.status}).`);
    }

    const session = (await sessionResponse.json()) as {
      id: string;
      customer: string | null;
      subscription: {
        id: string;
        status?: string;
        current_period_end?: number;
        items?: { data?: Array<{ price?: { recurring?: { interval?: string } } }> };
      } | null;
      metadata?: { plan_key?: string; billing_cycle?: string };
    };

    if (!session.subscription?.id) {
      throw new Error("Stripe checkout session has no subscription attached.");
    }

    const billingCycle = session.metadata?.billing_cycle === "annual" ? "annual" : "monthly";
    const planKey = session.metadata?.plan_key === "business" ? "business" : "professional";
    const planMeta = PLAN_META[planKey][billingCycle];

    const { error } = await supabaseAdmin.from("billing_subscriptions" as any).upsert(
      {
        business_id: data.businessId,
        provider: "stripe",
        plan_key: planKey,
        plan_name: planMeta.planName,
        status: session.subscription.status ?? "active",
        billing_interval: planMeta.interval,
        currency: planMeta.currency,
        amount_cents: planMeta.amountCents,
        provider_customer_id: typeof session.customer === "string" ? session.customer : null,
        provider_subscription_id: session.subscription.id,
        provider_checkout_url: null,
        current_period_end: session.subscription.current_period_end
          ? new Date(session.subscription.current_period_end * 1000).toISOString()
          : null,
      },
      { onConflict: "business_id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true as const };
  });

export const finalizeRazorpayBillingCheckout = createServerFn({ method: "POST" })
  .validator(razorpayFinalizeInputSchema)
  .handler(async ({ data }) => {
    const config = getServerConfig();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!config.billing.razorpayKeyId || !config.billing.razorpayKeySecret) {
      throw new Error("Razorpay key ID or secret is missing.");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("billing_subscriptions" as any)
      .select("provider_subscription_id,plan_key,billing_interval")
      .eq("business_id", data.businessId)
      .eq("provider", "razorpay")
      .maybeSingle();

    if (existingError) throw new Error(existingError.message);

    const subscriptionId = (existing as { provider_subscription_id?: string | null } | null)
      ?.provider_subscription_id;
    if (!subscriptionId) {
      throw new Error("No pending Razorpay subscription was found for this business.");
    }

    const response = await fetch(
      `https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      {
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(
              `${config.billing.razorpayKeyId}:${config.billing.razorpayKeySecret}`,
            ).toString("base64"),
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Razorpay subscription lookup failed (${response.status}).`);
    }

    const subscription = (await response.json()) as {
      id: string;
      status?: string;
      current_end?: number;
    };
    const providerStatus = subscription.status ?? "pending";
    if (!["active", "authenticated"].includes(providerStatus)) {
      throw new Error(`Razorpay subscription is not active yet (${providerStatus}).`);
    }

    const existingRow = existing as {
      plan_key?: string | null;
      billing_interval?: string | null;
    } | null;
    const planKey = existingRow?.plan_key === "business" ? "business" : "professional";
    const billingCycle = existingRow?.billing_interval === "year" ? "annual" : "monthly";
    const planMeta = PLAN_META[planKey][billingCycle];

    const { error } = await supabaseAdmin.from("billing_subscriptions" as any).upsert(
      {
        business_id: data.businessId,
        provider: "razorpay",
        plan_key: planKey,
        plan_name: planMeta.planName,
        status: "active",
        billing_interval: planMeta.interval,
        currency: planMeta.currency,
        amount_cents: planMeta.amountCents,
        provider_subscription_id: subscription.id,
        provider_checkout_url: null,
        current_period_end: subscription.current_end
          ? new Date(subscription.current_end * 1000).toISOString()
          : null,
      },
      { onConflict: "business_id" },
    );

    if (error) throw new Error(error.message);

    return { ok: true as const };
  });
