import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";
import {
  PAID_PLAN_META,
  normalizeBillingCycle,
  normalizePaidPlanKey,
  type BillingCycle,
} from "../billing/catalog";
import {
  fetchRazorpaySubscription,
  razorpayRequest,
  verifyRazorpayCheckoutSignature,
  verifyRazorpayPlan,
  type RazorpayCredentials,
  type RazorpaySubscription,
} from "../billing/razorpay.server";

export type BillingPlanKey = "starter" | "professional" | "business";
export type { BillingCycle };

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
});
const finalizeCheckoutInput = authenticatedInput.extend({
  checkoutSessionId: z.string().uuid(),
  paymentId: z
    .string()
    .regex(/^pay_[A-Za-z0-9]+$/)
    .optional(),
  subscriptionId: z
    .string()
    .regex(/^sub_[A-Za-z0-9]+$/)
    .optional(),
  signature: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
});

async function requireBillingManager(accessToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !auth.user) throw new Error("Your session has expired. Please sign in again.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("business_id,role,name,email")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (profileError || !profile?.business_id) throw new Error("Your workspace could not be found.");
  if (!["employer", "manager"].includes(String(profile.role))) {
    throw new Error("Only an employer or manager can manage billing.");
  }

  return { supabaseAdmin, businessId: profile.business_id, user: auth.user };
}

function getRazorpayCredentials() {
  const config = getServerConfig();
  const keyId = config.billing.razorpayKeyId;
  const keySecret = config.billing.razorpayKeySecret;
  if (
    !keyId ||
    !keySecret ||
    keySecret.length < 16 ||
    !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)
  ) {
    throw new Error("Razorpay is not configured correctly. Contact support.");
  }
  return { config, credentials: { keyId, keySecret } satisfies RazorpayCredentials };
}

function configuredPlanId(
  config: ReturnType<typeof getServerConfig>,
  planKey: "professional" | "business",
  cycle: BillingCycle,
) {
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
  return planIds[planKey][cycle];
}

function periodIsCurrent(value?: string | null) {
  return !value || new Date(value).getTime() > Date.now();
}

export const getBillingProviderStatus = createServerFn({ method: "POST" })
  .validator(authenticatedInput)
  .handler(async ({ data }): Promise<BillingProviderStatus> => {
    await requireBillingManager(data.accessToken);
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
  });

export const createBillingCheckout = createServerFn({ method: "POST" })
  .validator(checkoutInputSchema)
  .handler(async ({ data }) => {
    const { config, credentials } = getRazorpayCredentials();
    const { supabaseAdmin, businessId, user } = await requireBillingManager(data.accessToken);
    const planId = configuredPlanId(config, data.planKey, data.billingCycle);
    if (!planId) {
      throw new Error(`The Razorpay ${data.planKey} ${data.billingCycle} plan is not configured.`);
    }

    // Verify the provider-owned amount before creating or reusing any checkout.
    // This prevents stale checkout links from surviving a plan ID or price change.
    await verifyRazorpayPlan(credentials, planId, data.planKey, data.billingCycle);

    const { data: currentSubscription, error: subscriptionError } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("provider,provider_subscription_id,plan_key,status,current_period_end")
      .eq("business_id", businessId)
      .maybeSingle();
    if (subscriptionError) throw new Error("Unable to verify the current subscription.");
    if (
      currentSubscription?.plan_key !== "starter" &&
      currentSubscription?.status === "active" &&
      periodIsCurrent(currentSubscription.current_period_end)
    ) {
      throw new Error("An active paid subscription already exists. Manage it from Billing.");
    }

    const { data: pendingCheckout, error: pendingError } = await supabaseAdmin
      .from("billing_checkout_sessions")
      .select(
        "id,provider_subscription_id,expected_plan_id,plan_key,billing_cycle,checkout_url,created_at",
      )
      .eq("business_id", businessId)
      .eq("provider", "razorpay")
      .in("status", ["pending", "created", "authenticated"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (pendingError) throw new Error("Unable to verify the pending checkout.");
    const pendingIsUsable =
      pendingCheckout &&
      pendingCheckout.provider_subscription_id &&
      pendingCheckout.checkout_url &&
      pendingCheckout.expected_plan_id === planId &&
      Date.now() - new Date(pendingCheckout.created_at).getTime() < 25 * 60 * 60 * 1000;
    if (pendingIsUsable) {
      if (
        pendingCheckout.plan_key !== data.planKey ||
        pendingCheckout.billing_cycle !== data.billingCycle
      ) {
        throw new Error(
          "Another checkout is already pending. Complete it or try a different plan after it expires.",
        );
      }
      return {
        provider: "razorpay" as const,
        keyId: credentials.keyId,
        checkoutSessionId: pendingCheckout.id,
        subscriptionId: pendingCheckout.provider_subscription_id,
        fallbackUrl: pendingCheckout.checkout_url,
        planName: PAID_PLAN_META[data.planKey][data.billingCycle].planName,
        customerName: String(user.user_metadata?.name ?? ""),
        customerEmail: user.email ?? "",
      };
    }

    const result = await razorpayRequest<{ id?: string; short_url?: string }>(
      credentials,
      "/subscriptions",
      {
        method: "POST",
        body: JSON.stringify({
          plan_id: planId,
          // Razorpay caps a subscription at 100 billing cycles. Five years is
          // long enough for an auto-renewing checkout without hitting that cap.
          total_count: data.billingCycle === "annual" ? 5 : 60,
          quantity: 1,
          customer_notify: true,
          expire_by: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
          notes: {
            business_id: businessId,
            plan_key: data.planKey,
            billing_cycle: data.billingCycle,
            customer_email: user.email ?? "",
            customer_name: String(user.user_metadata?.name ?? ""),
            source: "rotaro",
          },
        }),
      },
    );
    if (!result.id || !result.short_url) {
      throw new Error("Razorpay did not return a valid subscription checkout link.");
    }

    const { data: checkout, error } = await supabaseAdmin
      .from("billing_checkout_sessions")
      .upsert(
        {
          business_id: businessId,
          provider: "razorpay",
          provider_subscription_id: result.id,
          expected_plan_id: planId,
          plan_key: data.planKey,
          billing_cycle: data.billingCycle,
          status: "pending",
          checkout_url: result.short_url,
        },
        { onConflict: "provider_subscription_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return {
      provider: "razorpay" as const,
      keyId: credentials.keyId,
      checkoutSessionId: checkout.id,
      subscriptionId: result.id,
      fallbackUrl: result.short_url,
      planName: PAID_PLAN_META[data.planKey][data.billingCycle].planName,
      customerName: String(user.user_metadata?.name ?? ""),
      customerEmail: user.email ?? "",
    };
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
      currency: "INR",
      amount_cents: 0,
      current_period_end: trialEndsAt,
      trial_ends_at: trialEndsAt,
      cancel_at_period_end: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, existing: false, trialEndsAt, status: "trialing" };
  });

export const finalizeRazorpayBillingCheckout = createServerFn({ method: "POST" })
  .validator(finalizeCheckoutInput)
  .handler(async ({ data }) => {
    const { config, credentials } = getRazorpayCredentials();
    const { supabaseAdmin, businessId } = await requireBillingManager(data.accessToken);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("billing_checkout_sessions")
      .select("id,provider_subscription_id,expected_plan_id,plan_key,billing_cycle,status")
      .eq("id", data.checkoutSessionId)
      .eq("business_id", businessId)
      .eq("provider", "razorpay")
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing?.provider_subscription_id) {
      throw new Error("No pending Razorpay subscription was found for this workspace.");
    }

    const callbackValues = [data.paymentId, data.subscriptionId, data.signature];
    if (callbackValues.some(Boolean) && !callbackValues.every(Boolean)) {
      throw new Error("The payment confirmation is incomplete.");
    }
    if (data.paymentId && data.subscriptionId && data.signature) {
      if (data.subscriptionId !== existing.provider_subscription_id) {
        throw new Error("The payment confirmation does not match this checkout.");
      }
      if (
        !verifyRazorpayCheckoutSignature(
          data.paymentId,
          existing.provider_subscription_id,
          data.signature,
          credentials.keySecret,
        )
      ) {
        throw new Error("The payment confirmation signature is invalid.");
      }
      const { error: callbackError } = await supabaseAdmin
        .from("billing_checkout_sessions")
        .update({
          provider_payment_id: data.paymentId,
          status: "authenticated",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (callbackError) throw new Error("Unable to save the payment confirmation.");
    }

    const subscription = await fetchRazorpaySubscription(
      credentials,
      existing.provider_subscription_id,
    );
    if (!subscription.id || subscription.id !== existing.provider_subscription_id) {
      throw new Error("Razorpay returned an invalid subscription.");
    }

    const planKey = normalizePaidPlanKey(existing.plan_key);
    const cycle = normalizeBillingCycle(existing.billing_cycle);
    const expectedPlanId = existing.expected_plan_id ?? configuredPlanId(config, planKey, cycle);
    if (
      !expectedPlanId ||
      subscription.plan_id !== expectedPlanId ||
      subscription.quantity !== 1 ||
      (subscription.notes?.business_id && subscription.notes.business_id !== businessId)
    ) {
      throw new Error("The Razorpay subscription does not match this workspace billing plan.");
    }
    if (subscription.status !== "active" || (subscription.paid_count ?? 0) < 1) {
      await supabaseAdmin
        .from("billing_checkout_sessions")
        .update({
          status: subscription.status ?? "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return {
        ok: true as const,
        active: false as const,
        status: subscription.status ?? "pending",
      };
    }

    const meta = PAID_PLAN_META[planKey][cycle];
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
        provider_customer_id: subscription.customer_id ?? null,
        provider_checkout_url: null,
        current_period_end: subscription.current_end
          ? new Date(subscription.current_end * 1000).toISOString()
          : null,
        trial_ends_at: null,
        cancel_at_period_end: false,
      },
      { onConflict: "business_id" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("billing_checkout_sessions")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return { ok: true as const, active: true as const, status: "active" as const };
  });

export const cancelRazorpaySubscription = createServerFn({ method: "POST" })
  .validator(authenticatedInput)
  .handler(async ({ data }) => {
    const { credentials } = getRazorpayCredentials();
    const { supabaseAdmin, businessId } = await requireBillingManager(data.accessToken);
    const { data: current, error: loadError } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("id,provider,provider_subscription_id,status,current_period_end,cancel_at_period_end")
      .eq("business_id", businessId)
      .maybeSingle();
    if (loadError) throw new Error("Unable to load the current subscription.");
    if (
      !current ||
      current.provider !== "razorpay" ||
      !current.provider_subscription_id ||
      current.status !== "active"
    ) {
      throw new Error("There is no active Razorpay subscription to cancel.");
    }
    if (current.cancel_at_period_end) {
      return { ok: true as const, alreadyScheduled: true as const };
    }

    const providerSubscription = await fetchRazorpaySubscription(
      credentials,
      current.provider_subscription_id,
    );
    if (
      providerSubscription.id !== current.provider_subscription_id ||
      (providerSubscription.notes?.business_id &&
        providerSubscription.notes.business_id !== businessId)
    ) {
      throw new Error("The Razorpay subscription does not match this workspace.");
    }

    const cancelled = await razorpayRequest<RazorpaySubscription>(
      credentials,
      `/subscriptions/${encodeURIComponent(current.provider_subscription_id)}/cancel`,
      {
        method: "POST",
        body: JSON.stringify({ cancel_at_cycle_end: true }),
      },
    );
    const { error: updateError } = await supabaseAdmin
      .from("billing_subscriptions")
      .update({
        status: cancelled.status ?? current.status,
        cancel_at_period_end: true,
        current_period_end: cancelled.current_end
          ? new Date(cancelled.current_end * 1000).toISOString()
          : current.current_period_end,
        updated_at: new Date().toISOString(),
      })
      .eq("id", current.id);
    if (updateError) throw new Error("Cancellation was scheduled but could not be saved locally.");
    return { ok: true as const, alreadyScheduled: false as const };
  });
