import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SiteHeader, SiteFooter } from "./index";
import { Check, Minus, Users2 } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — Rotaro" },
      {
        name: "description",
        content:
          "Simple, transparent pricing for Rotaro workforce scheduling. Start free and scale as your team grows.",
      },
      { property: "og:title", content: "Pricing — Rotaro" },
      { property: "og:url", content: "/pricing" },
    ],
    links: [{ rel: "canonical", href: "/pricing" }],
  }),
  component: PricingPage,
});

const TIER_LABELS = ["1–9", "10–24", "25–49", "50–99", "100+"];

function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <PricingHero />
      <UserSlider />
      <PricingTiers />
      <Comparison />
      <FAQ />
      <BottomCTA />
      <SiteFooter />
    </div>
  );
}

function PricingHero() {
  return (
    <>
      <section className="relative bg-secondary overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 items-center gap-10 relative z-10">
          <h1 className="text-5xl md:text-6xl font-bold text-[var(--navy)]">Our Pricing</h1>
          <div className="hidden md:flex justify-end">
            <div className="size-56 rounded-2xl bg-white border border-border flex items-center justify-center">
              <Users2 className="size-24 text-[var(--navy)]" strokeWidth={1.4} />
            </div>
          </div>
        </div>
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-16 bg-background"
          style={{ clipPath: "polygon(0 100%, 100% 40%, 100% 100%)" }}
        />
      </section>
      <section className="bg-background">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--navy)]">
            Workforce management software that fits your business
          </h2>
          <p className="text-muted-foreground mt-5">
            Get everything you need to manage rosters, leave, attendance and reporting — all in one
            place. Start with a free trial and see how easy it is to get up and running.
          </p>
          <Link to="/auth" className="inline-block mt-8">
            <Button size="lg" className="rounded-full px-8">
              Start Free Trial
            </Button>
          </Link>
        </div>
      </section>
    </>
  );
}

function UserSlider() {
  const [val, setVal] = useState([0]);
  return (
    <section className="bg-secondary">
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-[var(--navy)]">What's included?</h2>
        <h3 className="text-lg font-semibold text-[var(--navy)] mt-8">How many employees do you have?</h3>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl mx-auto">
          An employee is anyone who will be rostered, have their attendance tracked, or whose leave
          is managed using Rotaro.
        </p>
        <div className="mt-10 max-w-2xl mx-auto">
          <div className="text-left mb-3 text-[var(--navy)] font-semibold">
            {TIER_LABELS[val[0]]}
          </div>
          <Slider value={val} onValueChange={setVal} max={4} step={1} />
          <div className="flex justify-between text-xs text-muted-foreground mt-3">
            {TIER_LABELS.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingTiers() {
  const plans = [
    {
      name: "Starter",
      subtitle: "Roster & Attendance",
      price: "$0",
      sub: "Free for up to 5 employees",
      cta: "Get Started Free",
      ctaVariant: "outline" as const,
      featured: false,
      features: [
        "Roster creation & publishing (weekly view)",
        "Employee management (basic)",
        "Leave requests & approval",
        "Attendance check-in/out",
        "1 location",
      ],
    },
    {
      name: "Professional",
      subtitle: "Roster, Leave & Shift Management",
      price: "$49",
      sub: "per month / per location",
      cta: "Start Free Trial",
      ctaVariant: "secondary" as const,
      featured: true,
      features: [
        "Everything in Starter",
        "Weekly + Monthly roster views",
        "Shift management & templates",
        "Shift swap requests & approvals",
        "Leave balances & auto-approve",
        "Notifications (late check-in, early check-out, long break)",
        "Up to 25 employees",
        "Up to 3 locations",
      ],
    },
    {
      name: "Business",
      subtitle: "Full Workforce Management + Reports",
      price: "$89",
      sub: "per month / per location",
      cta: "Contact Sales",
      ctaVariant: "outline" as const,
      featured: false,
      features: [
        "Everything in Professional",
        "Unlimited employees & locations",
        "Advanced reports (hours, wages, comparison)",
        "Holiday import (state & country specific)",
        "Staff shortage alerts & dashboards",
        "Multi-level permission roles",
        "Priority support",
      ],
    },
  ];

  return (
    <section className="bg-background">
      <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-6 items-stretch">
        {plans.map((p) => {
          const featured = p.featured;
          return (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-8 flex flex-col ${
                featured
                  ? "bg-[var(--navy)] text-white border-[var(--navy)] shadow-lg md:-translate-y-3"
                  : "bg-card border-border shadow-sm"
              }`}
            >
              {featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-[var(--navy)] text-xs font-bold px-3 py-1 rounded-full border border-[var(--navy)]">
                  MOST POPULAR
                </span>
              )}
              <h3 className={`text-2xl font-bold ${featured ? "text-white" : "text-[var(--navy)]"}`}>
                {p.name}
              </h3>
              <p className={`text-sm mt-1 ${featured ? "text-white/80" : "text-muted-foreground"}`}>
                {p.subtitle}
              </p>
              <div className="mt-6">
                <div className={`text-5xl font-bold ${featured ? "text-white" : "text-[var(--navy)]"}`}>
                  {p.price}
                </div>
                <div className={`text-xs mt-1 ${featured ? "text-white/80" : "text-muted-foreground"}`}>
                  {p.sub}
                </div>
              </div>
              <ul className="mt-6 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm">
                    <Check
                      className={`size-4 shrink-0 mt-0.5 ${featured ? "text-white" : "text-[var(--navy)]"}`}
                    />
                    <span className={featured ? "text-white/90" : "text-foreground"}>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link to="/auth">
                  <Button
                    className={`w-full rounded-full ${
                      featured ? "bg-white text-[var(--navy)] hover:bg-white/90" : ""
                    }`}
                    variant={featured ? "default" : "outline"}
                  >
                    {p.cta}
                  </Button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type Cell = boolean | string;
type Row = { label: string; cells: [Cell, Cell, Cell] };
type Category = { title: string; rows: Row[] };

const COMPARE: Category[] = [
  {
    title: "Roster & Scheduling",
    rows: [
      { label: "Weekly roster grid (15-min increments)", cells: [true, true, true] },
      { label: "Monthly calendar view", cells: [false, true, true] },
      { label: "Shift templates", cells: [false, true, true] },
      { label: "Create from previous roster", cells: [false, true, true] },
      { label: "Publish & send to employees", cells: [true, true, true] },
    ],
  },
  {
    title: "Leave & Attendance",
    rows: [
      { label: "Leave requests & approvals", cells: [true, true, true] },
      { label: "Auto-approve leave", cells: [false, true, true] },
      { label: "Leave balances", cells: [false, true, true] },
      { label: "Shift swap requests", cells: [false, true, true] },
      { label: "Check-in / check-out tracking", cells: [true, true, true] },
      { label: "Break tracking", cells: [true, true, true] },
    ],
  },
  {
    title: "Notifications & Alerts",
    rows: [
      { label: "Late check-in alerts", cells: [false, true, true] },
      { label: "Early check-out alerts", cells: [false, true, true] },
      { label: "Long break alerts", cells: [false, true, true] },
      { label: "Staff shortage alerts", cells: [false, false, true] },
    ],
  },
  {
    title: "Reports",
    rows: [
      { label: "Hours report", cells: [false, true, true] },
      { label: "Wages report", cells: [false, false, true] },
      { label: "Comparison reports", cells: [false, false, true] },
      { label: "Export to Excel/PDF", cells: [false, true, true] },
    ],
  },
  {
    title: "Holidays & Compliance",
    rows: [
      { label: "Country/state holiday import", cells: [false, true, true] },
      { label: "Paid/unpaid holiday marking", cells: [false, true, true] },
    ],
  },
  {
    title: "Support & Access",
    rows: [
      { label: "Email support", cells: [true, true, true] },
      { label: "Priority support", cells: [false, false, true] },
      { label: "Multi-level permissions", cells: [false, true, true] },
      { label: "Number of locations", cells: ["1", "Up to 3", "Unlimited"] },
      { label: "Number of employees", cells: ["Up to 5", "Up to 25", "Unlimited"] },
    ],
  },
];

function Comparison() {
  const defaultOpen = useMemo(() => COMPARE.map((c) => c.title), []);
  return (
    <section className="bg-secondary">
      <div className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-[var(--navy)] text-center">
          Compare plans
        </h2>
        <div className="mt-10 bg-card rounded-2xl border border-border overflow-hidden">
          <div className="grid grid-cols-4 bg-[var(--navy)] text-white text-sm font-semibold sticky top-16 z-10">
            <div className="p-4">Feature</div>
            <div className="p-4 text-center">Starter</div>
            <div className="p-4 text-center">Professional</div>
            <div className="p-4 text-center">Business</div>
          </div>
          <Accordion type="multiple" defaultValue={defaultOpen} className="w-full">
            {COMPARE.map((cat) => (
              <AccordionItem key={cat.title} value={cat.title} className="border-b border-border">
                <AccordionTrigger className="px-4 py-4 text-[var(--navy)] font-bold hover:no-underline">
                  {cat.title}
                </AccordionTrigger>
                <AccordionContent className="p-0">
                  <div className="divide-y divide-border">
                    {cat.rows.map((r) => (
                      <div key={r.label} className="grid grid-cols-4 items-center text-sm">
                        <div className="p-4 text-foreground">{r.label}</div>
                        {r.cells.map((c, i) => (
                          <div key={i} className="p-4 flex justify-center">
                            {typeof c === "string" ? (
                              <span className="text-[var(--navy)] font-medium">{c}</span>
                            ) : c ? (
                              <Check className="size-5 text-[var(--navy)]" />
                            ) : (
                              <Minus className="size-5 text-muted-foreground/50" />
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const items = [
    {
      q: "What happens if I exceed my employee limit?",
      a: "We'll notify you and help you upgrade to a plan that fits your team — no service interruption.",
    },
    {
      q: "Can I change plans at any time?",
      a: "Yes, you can upgrade or downgrade anytime. Changes take effect at the start of your next billing cycle.",
    },
    { q: "Is there a free trial?", a: "Yes — every paid plan includes a 14-day free trial." },
    { q: "Do I need a credit card to start?", a: "No credit card is required to start your trial." },
    {
      q: "What happens to my data if I cancel?",
      a: "Your data is retained for 30 days after cancellation so you can export it or reactivate without losing anything.",
    },
    {
      q: "Can I manage multiple locations on one plan?",
      a: "Yes. Professional supports up to 3 locations, and Business supports unlimited locations.",
    },
  ];
  return (
    <section className="bg-background">
      <div className="max-w-3xl mx-auto px-6 py-20">
        <h2 className="text-3xl md:text-4xl font-bold text-[var(--navy)] text-center">
          Frequently Asked Questions
        </h2>
        <Accordion type="single" collapsible className="mt-10">
          {items.map((it) => (
            <AccordionItem key={it.q} value={it.q} className="border-b border-border">
              <AccordionTrigger className="text-left text-[var(--navy)] font-semibold hover:no-underline">
                {it.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{it.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function BottomCTA() {
  return (
    <section className="bg-[var(--navy)] text-white">
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl md:text-4xl font-bold">
          Ready to simplify your workforce management?
        </h2>
        <p className="mt-4 text-white/80">
          Join Australian businesses using Rotaro to manage rosters, leave, and attendance with
          ease.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth">
            <Button size="lg" className="rounded-full bg-white text-[var(--navy)] hover:bg-white/90 px-8">
              Start Free Trial
            </Button>
          </Link>
          <Link to="/">
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-8 bg-transparent border-white text-white hover:bg-white hover:text-[var(--navy)]"
            >
              Request a Demo
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
