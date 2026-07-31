import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

import { PAID_PLAN_META, normalizeBillingCycle, normalizePaidPlanKey } from "@/lib/billing/catalog";
import {
  fetchRazorpaySubscription,
  type RazorpayCredentials,
  type RazorpaySubscription,
} from "@/lib/billing/razorpay.server";
import { getServerConfig } from "@/lib/config.server";

type RazorpayPayment = {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  created_at?: number;
  invoice_id?: string | null;
};

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    subscription?: { entity?: RazorpaySubscription };
    payment?: { entity?: RazorpayPayment };
  };
};

const MAX_WEBHOOK_BYTES = 256 * 1024;
const SUPPORTED_EVENTS = new Set([
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.paused",
  "subscription.resumed",
]);

function webhookResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function signaturesMatch(body: string, received: string, secret: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  const receivedBytes = Buffer.from(received, "hex");
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function configuredPlanId(
  config: ReturnType<typeof getServerConfig>,
  planKey: "professional" | "business",
  cycle: "monthly" | "annual",
) {
  if (planKey === "professional") {
    return cycle === "annual"
      ? config.billing.razorpayProAnnualPlanId
      : config.billing.razorpayProMonthlyPlanId;
  }
  return cycle === "annual"
    ? config.billing.razorpayBusinessAnnualPlanId
    : config.billing.razorpayBusinessMonthlyPlanId;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

export const Route = createFileRoute("/api/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > MAX_WEBHOOK_BYTES) {
          return webhookResponse({ error: "Payload too large" }, 413);
        }

        const body = await request.text();
        if (Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BYTES) {
          return webhookResponse({ error: "Payload too large" }, 413);
        }

        const config = getServerConfig();
        const webhookSecret = config.billing.razorpayWebhookSecret;
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        if (!webhookSecret || !signaturesMatch(body, signature, webhookSecret)) {
          return webhookResponse({ error: "Invalid webhook signature" }, 401);
        }

        let webhook: RazorpayWebhookPayload;
        try {
          webhook = JSON.parse(body) as RazorpayWebhookPayload;
        } catch {
          return webhookResponse({ error: "Invalid JSON" }, 400);
        }

        const event = webhook.event ?? "";
        if (!SUPPORTED_EVENTS.has(event)) {
          return webhookResponse({ received: true, ignored: "unsupported event" });
        }

        const deliveredSubscription = webhook.payload?.subscription?.entity;
        if (!deliveredSubscription?.id) {
          return webhookResponse({ received: true, ignored: "missing subscription" });
        }

        const eventId =
          request.headers.get("x-razorpay-event-id")?.trim() ||
          `body_${createHash("sha256").update(body).digest("hex")}`;
        if (eventId.length > 255) {
          return webhookResponse({ error: "Invalid event ID" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date().toISOString();
        const { error: claimError } = await supabaseAdmin.from("billing_webhook_events").insert({
          event_id: eventId,
          provider: "razorpay",
          event_type: event,
          provider_subscription_id: deliveredSubscription.id,
          status: "processing",
          processing_started_at: now,
          updated_at: now,
        });

        if (claimError) {
          if (claimError.code !== "23505") {
            console.error("[Razorpay webhook] Unable to claim event", claimError);
            return webhookResponse({ error: "Webhook processing failed" }, 500);
          }
          const { data: prior, error: priorError } = await supabaseAdmin
            .from("billing_webhook_events")
            .select("status")
            .eq("event_id", eventId)
            .maybeSingle();
          if (priorError) {
            console.error("[Razorpay webhook] Unable to inspect duplicate event", priorError);
            return webhookResponse({ error: "Webhook processing failed" }, 500);
          }
          if (prior?.status === "processed" || prior?.status === "processing") {
            return webhookResponse({ received: true, duplicate: true });
          }
          const { error: retryError } = await supabaseAdmin
            .from("billing_webhook_events")
            .update({
              status: "processing",
              processing_started_at: now,
              processed_at: null,
              last_error: null,
              updated_at: now,
            })
            .eq("event_id", eventId)
            .eq("status", "failed");
          if (retryError) {
            console.error("[Razorpay webhook] Unable to retry failed event", retryError);
            return webhookResponse({ error: "Webhook processing failed" }, 500);
          }
        }

        try {
          const keyId = config.billing.razorpayKeyId;
          const keySecret = config.billing.razorpayKeySecret;
          if (!keyId || !keySecret) throw new Error("Razorpay API credentials are missing.");
          const credentials = { keyId, keySecret } satisfies RazorpayCredentials;

          // Fetch current provider state so delayed events cannot roll a subscription backward.
          const subscription = await fetchRazorpaySubscription(
            credentials,
            deliveredSubscription.id,
          );
          if (!subscription.id || subscription.id !== deliveredSubscription.id) {
            throw new Error("Razorpay returned an invalid subscription.");
          }

          const [
            { data: existing, error: existingError },
            { data: checkout, error: checkoutError },
          ] = await Promise.all([
            supabaseAdmin
              .from("billing_subscriptions")
              .select("id,business_id,plan_key,billing_interval,provider_subscription_id,status")
              .eq("provider", "razorpay")
              .eq("provider_subscription_id", subscription.id)
              .maybeSingle(),
            supabaseAdmin
              .from("billing_checkout_sessions")
              .select("id,business_id,plan_key,billing_cycle,expected_plan_id,status")
              .eq("provider", "razorpay")
              .eq("provider_subscription_id", subscription.id)
              .maybeSingle(),
          ]);
          if (existingError) throw existingError;
          if (checkoutError) throw checkoutError;

          const businessId = existing?.business_id ?? checkout?.business_id;
          if (!businessId) {
            await supabaseAdmin
              .from("billing_webhook_events")
              .update({ status: "processed", processed_at: now, updated_at: now })
              .eq("event_id", eventId);
            return webhookResponse({ received: true, ignored: "unknown subscription" });
          }
          if (subscription.notes?.business_id && subscription.notes.business_id !== businessId) {
            throw new Error("Subscription workspace metadata does not match.");
          }
          if (!existing && subscription.notes?.business_id !== businessId) {
            throw new Error("New subscription is missing valid workspace metadata.");
          }

          const planKey = normalizePaidPlanKey(existing?.plan_key ?? checkout?.plan_key);
          const cycle = normalizeBillingCycle(
            existing?.billing_interval ?? checkout?.billing_cycle,
          );
          const expectedPlanId =
            checkout?.expected_plan_id ?? configuredPlanId(config, planKey, cycle);
          if (
            !expectedPlanId ||
            subscription.plan_id !== expectedPlanId ||
            subscription.quantity !== 1
          ) {
            throw new Error("Subscription plan or quantity does not match the checkout.");
          }

          const providerStatus = subscription.status ?? "pending";
          const isPaidActive = providerStatus === "active" && (subscription.paid_count ?? 0) >= 1;
          let subscriptionRow: { id: string; business_id: string } | null = existing ?? null;

          if (isPaidActive) {
            const meta = PAID_PLAN_META[planKey][cycle];
            const { data: activated, error: activateError } = await supabaseAdmin
              .from("billing_subscriptions")
              .upsert(
                {
                  business_id: businessId,
                  provider: "razorpay",
                  plan_key: planKey,
                  plan_name: meta.planName,
                  status: "active",
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
                  cancel_at_period_end: Boolean(subscription.has_scheduled_changes),
                },
                { onConflict: "business_id" },
              )
              .select("id,business_id")
              .single();
            if (activateError) throw activateError;
            subscriptionRow = activated;
            if (checkout) {
              const { error: checkoutUpdateError } = await supabaseAdmin
                .from("billing_checkout_sessions")
                .update({ status: "completed", updated_at: now })
                .eq("id", checkout.id);
              if (checkoutUpdateError) throw checkoutUpdateError;
            }
          } else {
            if (existing) {
              const { error: statusError } = await supabaseAdmin
                .from("billing_subscriptions")
                .update({
                  status: providerStatus,
                  current_period_end: subscription.current_end
                    ? new Date(subscription.current_end * 1000).toISOString()
                    : null,
                  cancel_at_period_end: Boolean(subscription.has_scheduled_changes),
                  updated_at: now,
                })
                .eq("id", existing.id);
              if (statusError) throw statusError;
            }
            if (checkout) {
              const { error: checkoutStatusError } = await supabaseAdmin
                .from("billing_checkout_sessions")
                .update({ status: providerStatus, updated_at: now })
                .eq("id", checkout.id);
              if (checkoutStatusError) throw checkoutStatusError;
            }
          }

          const payment = webhook.payload?.payment?.entity;
          if (
            event === "subscription.charged" &&
            payment?.id &&
            payment.status === "captured" &&
            subscriptionRow
          ) {
            const { error: invoiceError } = await supabaseAdmin.from("billing_invoices").upsert(
              {
                business_id: subscriptionRow.business_id,
                subscription_id: subscriptionRow.id,
                provider: "razorpay",
                invoice_number: payment.invoice_id ?? payment.id,
                amount_cents: payment.amount ?? 0,
                currency: payment.currency ?? "INR",
                status: "paid",
                issued_at: payment.created_at
                  ? new Date(payment.created_at * 1000).toISOString()
                  : now,
              },
              { onConflict: "provider,invoice_number" },
            );
            if (invoiceError) throw invoiceError;
          }

          const { error: completeError } = await supabaseAdmin
            .from("billing_webhook_events")
            .update({
              status: "processed",
              processed_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("event_id", eventId);
          if (completeError) throw completeError;
          return webhookResponse({ received: true });
        } catch (error) {
          console.error("[Razorpay webhook] Processing failed", error);
          await supabaseAdmin
            .from("billing_webhook_events")
            .update({
              status: "failed",
              last_error: safeError(error),
              updated_at: new Date().toISOString(),
            })
            .eq("event_id", eventId);
          return webhookResponse({ error: "Webhook processing failed" }, 500);
        }
      },
    },
  },
});
