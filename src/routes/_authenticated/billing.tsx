import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { BadgeCheck, Banknote, CalendarX2, CreditCard, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import {
  activateStarterPlan,
  cancelRazorpaySubscription,
  finalizeRazorpayBillingCheckout,
} from "@/lib/api/billing.functions";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
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
  validateSearch: z.object({
    checkout: z.string().uuid().optional(),
  }),
  component: BillingPage,
});

type BillingSubscriptionRow = {
  id: string;
  business_id: string;
  provider: "razorpay" | "manual";
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

function BillingPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscriptionRow | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const { checkout: checkoutSessionId } = Route.useSearch();

  useEffect(() => {
    let active = true;
    (async () => {
      const nextProfile = await fetchProfile();
      if (!active) return;
      setProfile(nextProfile);

      if (!nextProfile?.business_id) {
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (checkoutSessionId) {
        try {
          if (!accessToken) throw new Error("Your session has expired. Please sign in again.");
          const result = await finalizeRazorpayBillingCheckout({
            data: { accessToken, checkoutSessionId },
          });
          if (result.active) {
            toast.success("Razorpay subscription verified.");
          } else {
            toast.info("Razorpay is still activating this subscription.");
          }
          window.history.replaceState({}, "", window.location.pathname);
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
        const seeded = accessToken
          ? await seedDefaultSubscription(nextProfile.business_id, accessToken)
          : null;
        if (!active) return;
        setSubscription(seeded);
      }

      setInvoices((invoicesResult.data ?? []) as unknown as BillingInvoiceRow[]);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [checkoutSessionId]);

  const cancelSubscription = async () => {
    try {
      setCancelling(true);
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Your session has expired. Please sign in again.");
      const result = await cancelRazorpaySubscription({ data: { accessToken } });
      setSubscription((current) =>
        current ? { ...current, cancel_at_period_end: true } : current,
      );
      toast.success(
        result.alreadyScheduled
          ? "Cancellation is already scheduled."
          : "Subscription will end after the current billing period.",
      );
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to schedule cancellation.");
    } finally {
      setCancelling(false);
    }
  };

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
    : (subscription?.plan_name ?? "Free trial");
  const currentStatus = demoFullAccess ? "active" : (subscription?.status ?? "inactive");
  const amount = demoFullAccess ? 0 : (subscription?.amount_cents ?? 0) / 100;
  const isTrial = !demoFullAccess && currentStatus === "trialing";
  const paymentMethod = demoFullAccess
    ? "Demo access"
    : subscription?.provider === "razorpay"
      ? "Razorpay"
      : "No payment method";
  const billingCycle = demoFullAccess
    ? "Demo access"
    : isTrial
      ? "60-day trial"
      : subscription?.billing_interval
        ? capitalize(subscription.billing_interval)
        : "Not scheduled";
  const renewal = demoFullAccess
    ? "No renewal required"
    : isTrial
      ? `Trial ends ${nextBillingDate}`
      : subscription?.cancel_at_period_end
        ? `Access ends ${nextBillingDate}`
        : currentStatus === "active"
          ? `Renews ${nextBillingDate}`
          : "Not scheduled";
  const statusStyle =
    currentStatus === "active"
      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
      : currentStatus === "trialing"
        ? "bg-blue-100 text-blue-700 hover:bg-blue-100"
        : "bg-slate-100 text-slate-700 hover:bg-slate-100";
  const canCancel =
    !demoFullAccess &&
    subscription?.provider === "razorpay" &&
    currentStatus === "active" &&
    !subscription.cancel_at_period_end;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-sm font-medium text-[var(--navy)]/70">Finance</div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your plan, subscriptions, and payment history.
        </p>
      </header>

      <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-[var(--navy)]/70">Current plan</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-[var(--navy)]">{currentPlan}</h2>
              <Badge className={statusStyle}>{currentStatus}</Badge>
            </div>
            <div className="mt-3 text-sm text-muted-foreground">
              {isTrial ? "Trial ends: " : "Next billing: "}
              <span className="font-medium text-foreground">{nextBillingDate}</span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {amount > 0
                ? `${subscription?.currency ?? "INR"} ${amount.toFixed(2)} / ${subscription?.billing_interval ?? "month"}`
                : isTrial
                  ? "No payment required during your trial"
                  : "No charge"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/pricing"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-[var(--navy)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--navy-light)]"
            >
              {isTrial ? "Choose a plan" : "Change plan"}
            </Link>
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline">
                    <CalendarX2 className="mr-2 size-4" />
                    Cancel renewal
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel subscription renewal?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your paid access will remain active until {nextBillingDate}. Future Razorpay
                      charges will stop after the current cycle.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void cancelSubscription()}
                      disabled={cancelling}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {cancelling ? "Scheduling..." : "Cancel renewal"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <SummaryTile label="Payment method" value={paymentMethod} icon={Banknote} />
          <SummaryTile label="Billing cycle" value={billingCycle} icon={CreditCard} />
          <SummaryTile label="Renewal" value={renewal} icon={BadgeCheck} />
        </div>

        <div className="mt-5 flex items-center gap-2 border-t pt-5 text-sm text-muted-foreground">
          <BadgeCheck className="size-4 shrink-0 text-emerald-600" />
          Payments are processed securely by Razorpay.
        </div>
      </section>

      <section className="rounded-2xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <div className="flex items-center gap-2 text-[var(--navy)]">
            <ReceiptText className="size-5" />
            <h3 className="text-xl font-semibold">Payment history</h3>
          </div>
        </div>
        <div className="overflow-x-auto p-4 sm:p-6">
          {invoices.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-[#F8FAFD] p-6 text-sm text-muted-foreground">
              No payments yet. Your Razorpay receipts will appear here after a successful payment.
            </div>
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
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

async function seedDefaultSubscription(businessId: string, accessToken: string) {
  await activateStarterPlan({ data: { accessToken } });
  const { data, error } = await supabase
    .from("billing_subscriptions")
    .select("*")
    .eq("business_id", businessId)
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

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
