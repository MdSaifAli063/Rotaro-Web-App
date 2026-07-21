import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Sparkles, Users2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "./index";
import { fetchProfile, useSession } from "@/lib/auth";
import {
  activateStarterPlan,
  createBillingCheckout,
  type BillingCycle,
  type BillingPlanKey,
} from "@/lib/api/billing.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing - Rotaro" },
      {
        name: "description",
        content:
          "Simple, transparent pricing for Rotaro workforce scheduling. Start free and scale as your team grows.",
      },
      { property: "og:title", content: "Pricing - Rotaro" },
      { property: "og:url", content: "/pricing" },
    ],
    links: [{ rel: "canonical", href: "/pricing" }],
  }),
  component: PricingPage,
});

function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [pendingPlan, setPendingPlan] = useState<BillingPlanKey | null>(null);
  const { user } = useSession();
  const navigate = useNavigate();

  const startCheckout = useCallback(
    async (planKey: BillingPlanKey, overrides?: { billingCycle?: BillingCycle }) => {
      const checkoutCycle = overrides?.billingCycle ?? billingCycle;

      if (!user) {
        window.localStorage.setItem(
          "rotaro.pendingCheckout",
          JSON.stringify({ planKey, billingCycle: checkoutCycle }),
        );
        navigate({
          to: "/client-login",
          search: { mode: "signup", next: "/pricing", plan: planKey },
        });
        return;
      }

      try {
        setPendingPlan(planKey);
        const profile = await fetchProfile();
        if (!profile?.business_id) {
          window.localStorage.setItem(
            "rotaro.pendingCheckout",
            JSON.stringify({ planKey, billingCycle: checkoutCycle }),
          );
          navigate({ to: "/onboarding" });
          return;
        }

        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Your session has expired. Please sign in again.");
        if (planKey === "starter") return;
        const result = await createBillingCheckout({
          data: {
            planKey,
            billingCycle: checkoutCycle,
            accessToken,
            customerEmail: user.email ?? undefined,
            customerName: user.user_metadata?.name ?? undefined,
          },
        });

        window.location.assign(result.url);
      } catch (error: any) {
        toast.error(error?.message ?? "Unable to start checkout.");
      } finally {
        setPendingPlan(null);
      }
    },
    [billingCycle, navigate, user],
  );

  const openStarter = () => {
    if (!user) {
      navigate({
        to: "/client-login",
        search: { mode: "signup", next: "/onboarding", plan: "starter" },
      });
      return;
    }

    (async () => {
      try {
        const profile = await fetchProfile();
        if (!profile?.business_id) {
          navigate({ to: "/onboarding" });
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Your session has expired. Please sign in again.");
        const result = await activateStarterPlan({ data: { accessToken } });
        toast.success(
          result.existing
            ? "Your workspace plan is already active."
            : "60-day free trial activated.",
        );
        navigate({ to: "/dashboard" });
      } catch (error: any) {
        toast.error(error?.message ?? "Unable to activate Starter plan.");
      }
    })();
  };

  useEffect(() => {
    if (!user) return;
    const raw = window.localStorage.getItem("rotaro.pendingCheckout");
    if (!raw) return;

    try {
      const pending = JSON.parse(raw) as {
        planKey?: BillingPlanKey;
        billingCycle?: BillingCycle;
      };
      if (
        pending.planKey &&
        pending.planKey !== "starter" &&
        (pending.billingCycle === "monthly" || pending.billingCycle === "annual")
      ) {
        window.localStorage.removeItem("rotaro.pendingCheckout");
        setBillingCycle(pending.billingCycle);
        startCheckout(pending.planKey, {
          billingCycle: pending.billingCycle,
        });
      }
    } catch {
      window.localStorage.removeItem("rotaro.pendingCheckout");
    }
  }, [startCheckout, user]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <PricingControls billingCycle={billingCycle} setBillingCycle={setBillingCycle} />
        <PricingCards
          billingCycle={billingCycle}
          pendingPlan={pendingPlan}
          onStarter={openStarter}
          onSubscribe={startCheckout}
        />
        <SupportStrip />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section className="bg-secondary border-b border-border">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_0.8fr] md:py-20">
        <div className="space-y-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-[var(--navy)] sm:text-5xl md:text-6xl">
            Simple, transparent pricing
          </h1>
          <p className="max-w-2xl text-base md:text-lg text-[var(--navy)]/75">
            Try every Rotaro feature free for 60 days, then choose the plan that fits your team.
          </p>
        </div>
        <div className="hidden md:flex justify-end">
          <div className="size-56 rounded-3xl bg-white border border-border shadow-sm flex items-center justify-center">
            <Users2 className="size-24 text-[var(--navy)]" strokeWidth={1.6} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingControls({
  billingCycle,
  setBillingCycle,
}: {
  billingCycle: BillingCycle;
  setBillingCycle: (value: BillingCycle) => void;
}) {
  return (
    <section className="bg-background">
      <div className="mx-auto max-w-7xl px-4 pt-10 text-center sm:px-6 sm:pt-12">
        <div className="inline-flex rounded-full border bg-card p-1 shadow-sm">
          {(["monthly", "annual"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              onClick={() => setBillingCycle(cycle)}
              className={`rounded-full px-6 py-2 text-sm font-semibold transition ${
                billingCycle === cycle
                  ? "bg-[var(--navy)] text-white shadow-sm"
                  : "text-[var(--navy)] hover:bg-secondary"
              }`}
            >
              {cycle === "monthly" ? "Monthly" : "Annual"}
              {cycle === "annual" && (
                <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  Save 17%
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 text-sm font-medium text-[var(--navy)]/75">
          Secure subscription payments powered by Razorpay
        </div>
      </div>
    </section>
  );
}

function PricingCards({
  billingCycle,
  pendingPlan,
  onStarter,
  onSubscribe,
}: {
  billingCycle: BillingCycle;
  pendingPlan: BillingPlanKey | null;
  onStarter: () => void;
  onSubscribe: (planKey: BillingPlanKey) => void;
}) {
  const plans = useMemo(
    () => [
      {
        key: "starter" as const,
        name: "Free trial",
        price: "$0",
        priceNote: "60 days, no payment required",
        features: [
          "Every Rotaro feature unlocked",
          "Up to 10 employees",
          "All roster, attendance, leave and report tools",
          "60 days of full access",
        ],
        cta: "Get started",
        featured: false,
      },
      {
        key: "professional" as const,
        name: "Professional",
        price: billingCycle === "monthly" ? "$20/mo" : "$200/yr",
        priceNote: billingCycle === "monthly" ? "per month" : "per year",
        features: [
          "Up to 1,000 employees",
          "5 locations",
          "Full roster (create, publish, send, download)",
          "All reports (hours, wages, comparison)",
          "Holiday import",
          "Leave management",
          "PDF extractor",
          "Priority email support",
        ],
        cta: "Subscribe",
        featured: true,
      },
      {
        key: "business" as const,
        name: "Business",
        price: billingCycle === "monthly" ? "$79/mo" : "$790/yr",
        priceNote: billingCycle === "monthly" ? "per month" : "per year",
        features: [
          "Unlimited employees and locations",
          "Everything in Professional",
          "Finance organiser",
          "Email-to-extract",
          "Roster -> Finance data feed",
          "Custom holiday setup",
          "Phone + priority support",
          "Early access to new features",
        ],
        cta: "Subscribe",
        featured: false,
      },
    ],
    [billingCycle],
  );

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const isFeatured = plan.featured;
            const isPending = pendingPlan === plan.key;
            return (
              <div
                key={plan.key}
                className={`relative flex flex-col rounded-3xl border p-5 sm:p-8 ${
                  isFeatured
                    ? "border-[var(--navy)] bg-white shadow-[0_10px_40px_rgba(28,39,72,0.10)]"
                    : "border-border bg-card shadow-sm"
                }`}
              >
                {isFeatured && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--navy)] px-3 py-1 text-xs font-bold text-white shadow-sm">
                    Most popular
                  </span>
                )}

                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-[var(--navy)]">{plan.name}</h2>
                  <p className="text-sm text-muted-foreground">Reusable presets for the roster.</p>
                </div>

                <div className="mt-6">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-extrabold tracking-tight text-[var(--navy)] sm:text-5xl">
                      {plan.price}
                    </span>
                    {plan.key !== "starter" && (
                      <span className="pb-1 text-base text-muted-foreground">{plan.priceNote}</span>
                    )}
                  </div>
                  {plan.key === "starter" && (
                    <p className="mt-2 text-sm text-muted-foreground">{plan.priceNote}</p>
                  )}
                </div>

                <ul className="mt-8 space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  {plan.key === "starter" ? (
                    <Button
                      type="button"
                      onClick={onStarter}
                      variant="outline"
                      className="h-12 w-full rounded-xl border-border text-[var(--navy)] hover:bg-secondary"
                    >
                      {plan.cta}
                      <ArrowRight className="ml-2 size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => onSubscribe(plan.key)}
                      disabled={isPending}
                      className={`h-12 w-full rounded-xl ${
                        isFeatured
                          ? "bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
                          : "bg-white text-[var(--navy)] border border-[var(--navy)] hover:bg-secondary"
                      }`}
                    >
                      {isPending ? "Opening..." : plan.cta}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border bg-secondary px-6 py-5 text-sm text-[var(--navy)]/75">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--navy)]" />
            <p>
              Paid subscriptions open in Razorpay's secure hosted checkout. Rotaro verifies the
              subscription before activating Professional or Business access.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SupportStrip() {
  return (
    <section className="bg-[var(--navy)] text-white">
      <div className="max-w-7xl mx-auto px-6 py-14 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Need help choosing a plan?</h2>
          <p className="mt-2 text-white/75">
            Your workspace can keep running while billing is connected and activated.
          </p>
        </div>
        <Link to="/settings" className="inline-flex">
          <Button
            variant="outline"
            className="rounded-xl border-white/20 bg-transparent text-white hover:bg-white hover:text-[var(--navy)]"
          >
            Open settings
          </Button>
        </Link>
      </div>
    </section>
  );
}
