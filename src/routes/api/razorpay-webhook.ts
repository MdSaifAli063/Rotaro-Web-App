import { createHmac, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";

import { getServerConfig } from "@/lib/config.server";

type RazorpaySubscription = {
  id?: string;
  status?: string;
  current_end?: number;
  notes?: Record<string, string | undefined>;
};

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

function signaturesMatch(body: string, received: string, secret: string) {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length && timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function normalizeStatus(event: string, providerStatus?: string) {
  const eventStatus: Record<string, string> = {
    "subscription.authenticated": "authenticated",
    "subscription.activated": "active",
    "subscription.charged": "active",
    "subscription.pending": "pending",
    "subscription.halted": "halted",
    "subscription.cancelled": "cancelled",
    "subscription.completed": "completed",
    "subscription.paused": "paused",
    "subscription.resumed": "active",
  };
  return eventStatus[event] ?? providerStatus ?? "pending";
}

export const Route = createFileRoute("/api/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const secret = getServerConfig().billing.razorpayWebhookSecret;
        if (!secret || !signature || !signaturesMatch(body, signature, secret)) {
          return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
        }

        let webhook: RazorpayWebhookPayload;
        try {
          webhook = JSON.parse(body) as RazorpayWebhookPayload;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const event = webhook.event ?? "";
        const subscription = webhook.payload?.subscription?.entity;
        if (!subscription?.id) return Response.json({ received: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing, error: loadError } = await supabaseAdmin
          .from("billing_subscriptions")
          .select("id,business_id")
          .eq("provider", "razorpay")
          .eq("provider_subscription_id", subscription.id)
          .maybeSingle();
        if (loadError) return Response.json({ error: loadError.message }, { status: 500 });
        const status = normalizeStatus(event, subscription.status);
        let subscriptionRow = existing;

        if (existing) {
          const { error: updateError } = await supabaseAdmin
            .from("billing_subscriptions")
            .update({
              status,
              current_period_end: subscription.current_end
                ? new Date(subscription.current_end * 1000).toISOString()
                : null,
              provider_checkout_url: null,
              trial_ends_at: null,
            })
            .eq("id", existing.id);
          if (updateError) return Response.json({ error: updateError.message }, { status: 500 });
        } else {
          const { data: checkout, error: checkoutError } = await supabaseAdmin
            .from("billing_checkout_sessions")
            .select("id,business_id,plan_key,billing_cycle")
            .eq("provider_subscription_id", subscription.id)
            .maybeSingle();
          if (checkoutError)
            return Response.json({ error: checkoutError.message }, { status: 500 });
          if (!checkout) return Response.json({ received: true, ignored: "unknown subscription" });

          if (!["active", "authenticated"].includes(status)) {
            await supabaseAdmin
              .from("billing_checkout_sessions")
              .update({ status, updated_at: new Date().toISOString() })
              .eq("id", checkout.id);
            return Response.json({ received: true });
          }

          const planKey = checkout.plan_key === "business" ? "business" : "professional";
          const annual = checkout.billing_cycle === "annual";
          const amountCents =
            planKey === "professional" ? (annual ? 20000 : 2000) : annual ? 79000 : 7900;
          const { data: activated, error: activateError } = await supabaseAdmin
            .from("billing_subscriptions")
            .upsert(
              {
                business_id: checkout.business_id,
                provider: "razorpay",
                plan_key: planKey,
                plan_name: planKey === "business" ? "Business" : "Professional",
                status,
                billing_interval: annual ? "year" : "month",
                currency: "USD",
                amount_cents: amountCents,
                provider_subscription_id: subscription.id,
                provider_checkout_url: null,
                current_period_end: subscription.current_end
                  ? new Date(subscription.current_end * 1000).toISOString()
                  : null,
                trial_ends_at: null,
                cancel_at_period_end: false,
              },
              { onConflict: "business_id" },
            )
            .select("id,business_id")
            .single();
          if (activateError)
            return Response.json({ error: activateError.message }, { status: 500 });
          subscriptionRow = activated;
          await supabaseAdmin
            .from("billing_checkout_sessions")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("id", checkout.id);
        }

        const payment = webhook.payload?.payment?.entity;
        if (event === "subscription.charged" && payment?.id && subscriptionRow) {
          const { error: invoiceError } = await supabaseAdmin.from("billing_invoices").upsert(
            {
              business_id: subscriptionRow.business_id,
              subscription_id: subscriptionRow.id,
              provider: "razorpay",
              invoice_number: payment.invoice_id ?? payment.id,
              amount_cents: payment.amount ?? 0,
              currency: payment.currency ?? "USD",
              status: payment.status ?? "paid",
              issued_at: payment.created_at
                ? new Date(payment.created_at * 1000).toISOString()
                : new Date().toISOString(),
            },
            { onConflict: "provider,invoice_number" },
          );
          if (invoiceError) return Response.json({ error: invoiceError.message }, { status: 500 });
        }

        return Response.json({ received: true });
      },
    },
  },
});
