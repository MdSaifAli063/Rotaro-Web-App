import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Check, Sparkles, Users2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SiteFooter, SiteHeader } from "./index";
import { fetchProfile, useSession } from "@/lib/auth";
import {
  createBillingCheckout,
  type BillingCycle,
  type BillingPlanKey,
  type BillingProvider,
} from "@/lib/api/billing.functions";

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
  const [provider, setProvider] = useState<BillingProvider>("stripe");
  const [pendingPlan, setPendingPlan] = useState<BillingPlanKey | null>(null);
  const { user } = useSession();
  const navigate = useNavigate();

  const startCheckout = async (planKey: BillingPlanKey) => {
    if (!user) {
      navigate({ to: "/auth", search: { next: "/billing" } });
      return;
    }

    try {
      setPendingPlan(planKey);
      const profile = await fetchProfile();
      if (!profile?.business_id) throw new Error("We could not find your business account.");

      const result = await createBillingCheckout({
        data: {
          provider,
          planKey,
          billingCycle,
          origin: window.location.origin,
          businessId: profile.business_id,
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
  };

  const openStarter = () => {
    if (user) {
      navigate({ to: "/dashboard" });
      return;
    }
    navigate({ to: "/auth", search: { next: "/billing" } });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <PricingControls
          billingCycle={billingCycle}
          setBillingCycle={setBillingCycle}
          provider={provider}
          setProvider={setProvider}
        />
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
      <div className="max-w-7xl mx-auto px-6 py-16 md:py-20 grid gap-10 md:grid-cols-[1.4fr_0.8fr] items-center">
        <div className="space-y-5">
          <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-[var(--navy)]">
            Simple, transparent pricing
          </h1>
          <p className="max-w-2xl text-base md:text-lg text-[var(--navy)]/75">
            Start free. Upgrade when you need publish, reports, PDF extract, and finance tools.
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
  provider,
  setProvider,
}: {
  billingCycle: BillingCycle;
  setBillingCycle: (value: BillingCycle) => void;
  provider: BillingProvider;
  setProvider: (value: BillingProvider) => void;
}) {
  return (
    <section className="bg-background">
      <div className="max-w-7xl mx-auto px-6 pt-12 text-center">
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

        <div className="mt-8 flex items-center justify-center gap-3 text-sm text-[var(--navy)]/80">
          <span className="font-medium">Pay with:</span>
          {(["stripe", "razorpay"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setProvider(item)}
              className={`rounded-lg border px-5 py-2 font-medium transition ${
                provider === item
                  ? "border-[var(--navy)] bg-white text-[var(--navy)] shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:bg-secondary"
              }`}
            >
              {item === "stripe" ? "Stripe" : "Razorpay"}
            </button>
          ))}
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
        name: "Starter",
        price: "Free",
        priceNote: "Up to 5 employees",
        features: [
          "Up to 5 employees",
          "1 location",
          "Basic roster (create + view)",
          "Email support",
        ],
        cta: "Get started",
        featured: false,
      },
      {
        key: "professional" as const,
        name: "Professional",
        price: billingCycle === "monthly" ? "$29/mo" : "$290/yr",
        priceNote: billingCycle === "monthly" ? "per month" : "per year",
        features: [
          "Up to 25 employees",
          "3 locations",
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
          "Unlimited employees & locations",
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
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => {
            const isFeatured = plan.featured;
            const isPending = pendingPlan === plan.key;
            return (
              <div
                key={plan.key}
                className={`relative rounded-3xl border p-8 flex flex-col ${
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
                    <span className="text-5xl font-extrabold tracking-tight text-[var(--navy)]">
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
              Your subscription opens in the selected provider's hosted checkout, then Rotaro
              updates Billing after payment. Stripe returns straight back to Rotaro; Razorpay opens
              its hosted subscription flow.
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
