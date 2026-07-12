import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  CreditCard,
  Loader2,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  finalizeRazorpayBillingCheckout,
  finalizeStripeBillingCheckout,
  getBillingProviderStatus,
  type BillingProviderStatus,
} from "@/lib/api/billing.functions";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isDemoFullAccessEmail } from "@/lib/billing/plans";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/billing")({
  component: BillingPage,
});

type BillingSubscriptionRow = {
  id: string;
  business_id: string;
  provider: "stripe" | "razorpay" | "manual";
  plan_key: string;
  plan_name: string;
  status: string;
  billing_interval: string;
  currency: string;
  amount_cents: number;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  provider_checkout_url: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
};

type BillingInvoiceRow = {
  id: string;
  business_id: string;
  subscription_id: string | null;
  provider: string;
  invoice_number: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  hosted_invoice_url: string | null;
  pdf_url: string | null;
};

const plans = [
  {
    key: "starter",
    name: "Starter",
    price: "$0",
    interval: "Free forever",
    description: "For small teams getting started with basic roster planning.",
    features: ["Up to 5 employees", "1 location", "Basic roster (create + view)", "Email support"],
  },
  {
    key: "professional",
    name: "Professional",
    price: "$29",
    interval: "per month",
    description: "For growing teams that need the full workforce toolkit.",
    features: [
      "Up to 1,000 employees",
      "3 locations",
      "Full roster (create, publish, send, download)",
      "All reports (hours, wages, comparison)",
      "Holiday import",
      "Leave management",
      "PDF extractor",
      "Priority email support",
    ],
  },
  {
    key: "business",
    name: "Business",
    price: "$79",
    interval: "per month",
    description: "For larger teams that need finance, custom setup, and priority support.",
    features: [
      "Up to 1,000 employees & unlimited locations",
      "Everything in Professional",
      "Finance organiser",
      "Email-to-extract",
      "Roster -> Finance data feed",
      "Custom holiday setup",
      "Phone + priority support",
      "Early access to new features",
    ],
  },
] as const;

function BillingPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscriptionRow | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoiceRow[]>([]);
  const [providerStatus, setProviderStatus] = useState<BillingProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const billingStatus = await getBillingProviderStatus();
      if (!active) return;
      setProviderStatus(billingStatus);

      const nextProfile = await fetchProfile();
      if (!active) return;
      setProfile(nextProfile);

      if (!nextProfile?.business_id) {
        setLoading(false);
        return;
      }

      const searchParams = new URLSearchParams(window.location.search);
      if (
        searchParams.get("success") === "1" &&
        searchParams.get("provider") === "stripe" &&
        searchParams.get("session_id")
      ) {
        try {
          await finalizeStripeBillingCheckout({
            data: {
              businessId: nextProfile.business_id,
              sessionId: searchParams.get("session_id") ?? "",
            },
          });
          toast.success("Stripe subscription synced to Billing.");
          searchParams.delete("success");
          searchParams.delete("provider");
          searchParams.delete("plan");
          searchParams.delete("cycle");
          searchParams.delete("session_id");
          const nextUrl = `${window.location.pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
          window.history.replaceState({}, "", nextUrl);
        } catch (error: any) {
          toast.error(error?.message ?? "Could not sync your Stripe subscription yet.");
        }
      }
      if (searchParams.get("success") === "1" && searchParams.get("provider") === "razorpay") {
        try {
          await finalizeRazorpayBillingCheckout({
            data: {
              businessId: nextProfile.business_id,
            },
          });
          toast.success("Razorpay subscription synced to Billing.");
          searchParams.delete("success");
          searchParams.delete("provider");
          searchParams.delete("plan");
          searchParams.delete("cycle");
          const nextUrl = `${window.location.pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
          window.history.replaceState({}, "", nextUrl);
        } catch (error: any) {
          toast.error(error?.message ?? "Could not sync your Razorpay subscription yet.");
        }
      }

      const [subscriptionResult, invoicesResult] = await Promise.all([
        supabase
          .from("billing_subscriptions")
          .select("*")
          .eq("business_id", nextProfile.business_id)
          .maybeSingle(),
        supabase
          .from("billing_invoices" as any)
          .select("*")
          .eq("business_id", nextProfile.business_id)
          .order("issued_at", { ascending: false })
          .limit(12),
      ]);

      if (!active) return;

      if (subscriptionResult.error) toast.error(subscriptionResult.error.message);
      if (invoicesResult.error) toast.error(invoicesResult.error.message);

      const nextSubscription = subscriptionResult.data as BillingSubscriptionRow | null;
      if (nextSubscription) {
        setSubscription(nextSubscription);
      } else {
        const seeded = await seedDefaultSubscription(nextProfile.business_id);
        if (!active) return;
        setSubscription(seeded);
      }

      setInvoices((invoicesResult.data ?? []) as unknown as BillingInvoiceRow[]);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  const nextBillingDate = useMemo(() => {
    if (subscription?.current_period_end)
      return format(new Date(subscription.current_period_end), "dd MMM yyyy");
    if (subscription?.trial_ends_at)
      return format(new Date(subscription.trial_ends_at), "dd MMM yyyy");
    return "—";
  }, [subscription]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading billing...
      </div>
    );
  }

  if (!profile || !isManager(profile)) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to manage billing.
      </div>
    );
  }

  const demoFullAccess = isDemoFullAccessEmail(profile.email);
  const currentPlan = demoFullAccess
    ? "Professional (Demo)"
    : (subscription?.plan_name ?? "Starter");
  const currentStatus = demoFullAccess ? "active" : (subscription?.status ?? "active");
  const currentProvider = demoFullAccess ? "manual" : (subscription?.provider ?? "manual");
  const amount = demoFullAccess ? 0 : (subscription?.amount_cents ?? 0) / 100;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-sm font-medium text-[var(--navy)]/70">Finance</div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan, subscriptions, and payment history.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[var(--navy)]/70">Current plan</div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-[var(--navy)]">{currentPlan}</h2>
                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  {currentStatus}
                </Badge>
                <Badge variant="outline">{currentProvider}</Badge>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                Next billing: <span className="font-medium text-foreground">{nextBillingDate}</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {amount > 0
                  ? `${subscription?.currency ?? "AUD"} ${amount.toFixed(2)} / ${subscription?.billing_interval ?? "month"}`
                  : "Free plan"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-md bg-[var(--navy)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--navy-light)]"
              >
                Manage subscription
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                View pricing
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <SummaryTile label="Provider" value={currentProvider.toUpperCase()} icon={Banknote} />
            <SummaryTile
              label="Customer"
              value={subscription?.provider_customer_id ?? "—"}
              icon={CreditCard}
            />
            <SummaryTile
              label="Subscription"
              value={subscription?.provider_subscription_id ?? "—"}
              icon={BadgeCheck}
            />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <ProviderPanel
              label="Stripe"
              configured={
                !!providerStatus?.stripe.secretKeyConfigured &&
                !!providerStatus?.stripe.publishableKeyConfigured &&
                !!providerStatus?.stripe.proMonthlyPriceConfigured
              }
              details={[
                providerStatus?.stripe.secretKeyConfigured ? "Secret key" : "Secret key missing",
                providerStatus?.stripe.publishableKeyConfigured
                  ? "Publishable key"
                  : "Publishable key missing",
                providerStatus?.stripe.proMonthlyPriceConfigured
                  ? "Price IDs ready"
                  : "Price IDs missing",
              ]}
            />
            <ProviderPanel
              label="Razorpay"
              configured={
                !!providerStatus?.razorpay.keyIdConfigured &&
                !!providerStatus?.razorpay.keySecretConfigured &&
                !!providerStatus?.razorpay.proMonthlyPlanConfigured
              }
              details={[
                providerStatus?.razorpay.keyIdConfigured ? "Key ID" : "Key ID missing",
                providerStatus?.razorpay.keySecretConfigured ? "Key secret" : "Key secret missing",
                providerStatus?.razorpay.proMonthlyPlanConfigured
                  ? "Plan IDs ready"
                  : "Plan IDs missing",
              ]}
            />
          </div>

          <div className="mt-6 rounded-xl border bg-[#F8FAFD] p-4 text-sm text-muted-foreground">
            <div className="font-medium text-[var(--navy)]">Provider configured from env</div>
            <p className="mt-1">
              Rotaro uses your Stripe and Razorpay env keys and plan IDs to launch hosted checkout.
              No URL setup is needed in the UI.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--navy)]">
            <Sparkles className="size-4" />
            <h3 className="text-lg font-semibold">Quick setup</h3>
          </div>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>1. Set your Stripe and Razorpay secrets in .env.</p>
            <p>2. Add your price IDs and plan IDs in .env.</p>
            <p>3. Rotaro will open hosted checkout and sync the billing record back in app.</p>
          </div>
          <div className="mt-6 rounded-xl border bg-[#F8FAFD] p-4 text-sm text-muted-foreground">
            Billing is managed from the pricing page and your server env variables. No provider URL
            setup is required in the UI.
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <div className="flex items-center gap-2 text-[var(--navy)]">
            <CreditCard className="size-5" />
            <h3 className="text-xl font-semibold">Plans</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a plan and Rotaro will open hosted checkout for Stripe or Razorpay.
          </p>
        </div>
        <div className="grid gap-4 p-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const active = plan.key === subscription?.plan_key;
            return (
              <div
                key={plan.key}
                className={`rounded-2xl border p-5 ${active ? "border-[var(--navy)] bg-[#F8FAFD]" : "bg-white"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-[var(--navy)]">{plan.name}</div>
                    <div className="text-sm text-muted-foreground">{plan.description}</div>
                  </div>
                  {active && (
                    <Badge className="bg-[var(--navy)] text-white hover:bg-[var(--navy)]">
                      Current
                    </Badge>
                  )}
                </div>
                <div className="mt-4">
                  <div className="text-3xl font-bold text-[var(--navy)]">{plan.price}</div>
                  <div className="text-xs text-muted-foreground">{plan.interval}</div>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-foreground">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex gap-2">
                  <Link
                    to="/pricing"
                    className="inline-flex flex-1 items-center justify-center rounded-md bg-[var(--navy)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--navy-light)]"
                  >
                    Open pricing
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <div className="flex items-center gap-2 text-[var(--navy)]">
            <ReceiptText className="size-5" />
            <h3 className="text-xl font-semibold">Payment history</h3>
          </div>
        </div>
        <div className="p-6">
          {invoices.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-[#F8FAFD] p-6 text-sm text-muted-foreground">
              No invoices yet. Payments will appear here after your provider webhook syncs with
              Rotaro.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium text-[var(--navy)]">
                      {invoice.invoice_number ?? invoice.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="capitalize">{invoice.provider}</TableCell>
                    <TableCell>{format(new Date(invoice.issued_at), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      {invoice.currency} {(invoice.amount_cents / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {invoice.hosted_invoice_url ? (
                        <a
                          href={invoice.hosted_invoice_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}

async function seedDefaultSubscription(businessId: string) {
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .upsert(
      {
        business_id: businessId,
        provider: "manual",
        plan_key: "starter",
        plan_name: "Starter",
        status: "active",
        billing_interval: "monthly",
        currency: "AUD",
        amount_cents: 0,
      },
      { onConflict: "business_id" },
    )
    .select("*")
    .single();

  if (error) {
    toast.error(error.message);
    return null;
  }

  return data as unknown as BillingSubscriptionRow;
}

function SummaryTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Banknote;
}) {
  return (
    <div className="rounded-xl border bg-[#F8FAFD] p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-4 text-[var(--navy)]" />
        {label}
      </div>
      <div className="mt-3 break-all text-sm font-medium text-[var(--navy)]">{value}</div>
    </div>
  );
}

function ProviderPanel({
  label,
  configured,
  details,
}: {
  label: string;
  configured: boolean;
  details: string[];
}) {
  return (
    <div className="rounded-xl border bg-[#F8FAFD] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-[var(--navy)]">{label}</div>
        <Badge
          className={
            configured
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
              : "bg-amber-100 text-amber-800 hover:bg-amber-100"
          }
        >
          {configured ? "Ready" : "Not ready"}
        </Badge>
      </div>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
        {details.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
