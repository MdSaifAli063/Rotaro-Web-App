import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  CalendarDays,
  ClipboardList,
  Repeat,
  Clock4,
  BarChart3,
  Users,
  Settings2,
  UserPlus,
  CalendarCheck2,
  LayoutDashboard,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { RotaroBrand } from "@/components/RotaroMark";
import { useSession } from "@/lib/auth";
import { sendPublicInquiryEmail } from "@/lib/emailjs";
import { canonicalLink, publicPageMeta } from "@/lib/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: publicPageMeta({
      title: "Rotaro | Workforce Scheduling Made Simple",
      description:
        "Build employee rosters, manage leave, track attendance, and run workforce reports in one secure workspace.",
      path: "/",
    }),
    links: [canonicalLink("/")],
  }),
  component: Landing,
});

const NAV = [
  { label: "About", to: "/#about" },
  { label: "Features", to: "/#features" },
  { label: "Pricing", to: "/pricing" },
  { label: "Industries", to: "/#industries" },
  { label: "Support", to: "/support" },
  { label: "Contact", to: "/#contact" },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <Hero />
      <WhatWeDo />
      <HowItWorks />
      <Industries />
      <ContactSection />
      <SiteFooter />
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { user } = useSession();
  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex min-w-0 items-center">
          <RotaroBrand />
        </Link>
        <nav className="hidden md:flex items-center gap-5 lg:gap-7">
          {NAV.map((n) =>
            n.to.startsWith("/#") ? (
              <a
                key={n.label}
                href={n.to}
                className="text-sm font-medium text-[var(--navy)] hover:opacity-70"
              >
                {n.label}
              </a>
            ) : (
              <Link
                key={n.label}
                to={n.to}
                className="text-sm font-medium text-[var(--navy)] hover:opacity-70"
              >
                {n.label}
              </Link>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Link to="/dashboard" className="hidden sm:inline-block">
              <Button className="rounded-full px-5">Open workspace</Button>
            </Link>
          ) : (
            <>
              <Link
                to="/staff-login"
                className="hidden sm:inline-block text-sm font-medium text-[var(--navy)] hover:opacity-70 px-2"
              >
                Staff Login
              </Link>
              <Link to="/client-login" className="hidden sm:inline-block">
                <Button className="rounded-full px-5">Client Login</Button>
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            className="md:hidden p-2 -mr-2 rounded-md hover:bg-muted text-[var(--navy)]"
          >
            {open ? (
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t border-border bg-white">
          <div className="px-4 py-4 space-y-2">
            {NAV.map((n) =>
              n.to.startsWith("/#") ? (
                <a
                  key={n.label}
                  href={n.to}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm font-medium text-[var(--navy)]"
                >
                  {n.label}
                </a>
              ) : (
                <Link
                  key={n.label}
                  to={n.to}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm font-medium text-[var(--navy)]"
                >
                  {n.label}
                </Link>
              ),
            )}
            <div className="pt-3 border-t border-border flex flex-col gap-2">
              {user ? (
                <Link to="/dashboard">
                  <Button className="w-full rounded-full">Open workspace</Button>
                </Link>
              ) : (
                <>
                  <Link to="/staff-login" className="text-sm font-medium text-[var(--navy)] py-2">
                    Staff Login
                  </Link>
                  <Link to="/client-login">
                    <Button className="w-full rounded-full">Client Login</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-32 sm:pb-40 text-center relative z-10">
        <span className="inline-block px-3 py-1 rounded-full bg-secondary text-xs font-medium text-[var(--navy)] mb-6">
          Simple workforce scheduling
        </span>
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[var(--navy)]">
          Finish the week — with Rotaro.
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground mt-5 sm:mt-6 max-w-xl mx-auto">
          Build weekly rosters in 15-minute increments, manage leave and holidays, and run wage
          reports — all without the clutter.
        </p>
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <Link to="/pricing">
            <Button size="lg" className="h-12 px-8 text-base rounded-full w-full sm:w-auto">
              Get started
            </Button>
          </Link>
          <a href="#contact">
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-8 text-base rounded-full w-full sm:w-auto"
            >
              Request a demo
            </Button>
          </a>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {["Drag-free 15-min grid", "Leave & holiday tracking", "Hours & wage reports"].map(
            (f) => (
              <div key={f} className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-[var(--navy)]" />
                {f}
              </div>
            ),
          )}
        </div>
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-32 bg-[var(--navy)]"
        style={{ clipPath: "polygon(0 60%, 100% 0, 100% 100%, 0 100%)" }}
      />
    </section>
  );
}

function WhatWeDo() {
  const features = [
    "Roster Management",
    "Leave Management",
    "Shift Swaps",
    "Attendance Tracking",
    "Reports & Analytics",
    "Staff Management",
  ];
  return (
    <section id="features" className="bg-[var(--navy)] text-white">
      <div className="max-w-5xl mx-auto px-6 py-24">
        <div className="flex justify-center gap-2 mb-8">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === 0 ? "w-6 bg-white" : "w-2 bg-white/30"
              }`}
            />
          ))}
        </div>
        <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl">What we can do for you</h2>
        <div className="mt-8 space-y-5 text-white/85 max-w-3xl text-base leading-relaxed">
          <p>
            Looking for a simple, all-in-one platform that automates rostering, leave, attendance
            and reporting — your way?
          </p>
          <p>
            Onboard employees, build rosters, manage leave and shift swaps, track attendance, and
            generate reports — all in one place.
          </p>
          <p>
            Rotaro is your one-stop workforce management solution, designed for Australian
            businesses — simple, smart, and built to save you time.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
          {features.map((f) => (
            <button
              key={f}
              className="rounded-full border border-white/60 px-6 py-3 text-sm font-medium hover:bg-white hover:text-[var(--navy)] transition-colors"
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Settings2,
      title: "1. Setup",
      desc: "Set up your business profile, operating hours, departments, and employee details in one guided onboarding flow.",
    },
    {
      icon: UserPlus,
      title: "2. Add Your Team",
      desc: "Add employees with their roles, skills, employment type, and contact details — invite them to the platform instantly.",
    },
    {
      icon: CalendarCheck2,
      title: "3. Build & Publish",
      desc: "Create rosters in a simple 15-minute grid, add breaks, and publish — employees get notified automatically.",
    },
    {
      icon: LayoutDashboard,
      title: "4. Manage & Track",
      desc: "Track attendance, approve leave and shift swaps, and view real-time reports — all from one dashboard, anywhere.",
    },
  ];
  return (
    <section id="about" className="relative bg-white">
      <div
        aria-hidden
        className="absolute top-0 right-0 h-20 w-2/3 bg-[var(--navy)]"
        style={{ clipPath: "polygon(100% 0, 0 0, 100% 100%)" }}
      />
      <div className="max-w-7xl mx-auto px-6 py-24 relative">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-[var(--navy)] sm:text-4xl md:text-5xl">
            How it works
          </h2>
          <p className="text-muted-foreground mt-4">
            In four simple steps, get your team up and running with smart scheduling that makes
            managing your workforce effortless.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="text-center">
              <div className="mx-auto size-20 rounded-2xl bg-secondary flex items-center justify-center mb-5">
                <Icon className="size-9 text-[var(--navy)]" />
              </div>
              <h3 className="text-lg font-bold text-[var(--navy)]">{title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Industries() {
  const items = [
    {
      title: "Hospitality & Retail",
      desc: "Manage casual staff, rotating shifts, and weekend rosters with ease.",
      icon: Users,
    },
    {
      title: "Healthcare & Aged Care",
      desc: "Ensure shift coverage, track certifications, and manage leave seamlessly.",
      icon: ClipboardList,
    },
    {
      title: "Trades & Construction",
      desc: "Schedule crews across sites, track attendance, and manage swap requests.",
      icon: Repeat,
    },
    {
      title: "Office & Admin Teams",
      desc: "Simplify leave approvals, attendance tracking, and team scheduling.",
      icon: BarChart3,
    },
  ];
  return (
    <section id="industries" className="bg-background">
      <div className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-[var(--navy)] sm:text-4xl md:text-5xl">
            Built for every kind of team
          </h2>
          <p className="text-muted-foreground mt-4">
            Whichever industry you're in, Rotaro adapts to the way your team works.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map(({ title, desc, icon: Icon }) => (
            <div
              key={title}
              className="bg-card rounded-xl border border-border p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="aspect-[4/3] rounded-lg bg-secondary mb-5 flex items-center justify-center">
                <Icon className="size-12 text-[var(--navy)]" />
              </div>
              <h3 className="font-bold text-[var(--navy)] text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{desc}</p>
              <a
                href="#contact"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--navy)] hover:underline"
              >
                Learn more <ArrowRight className="size-3.5" />
              </a>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link to="/pricing">
            <Button variant="outline" className="rounded-full px-6">
              View all use cases
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function ContactSection() {
  const [submitting, setSubmitting] = useState(false);
  const [enquiryType, setEnquiryType] = useState("");
  const [country, setCountry] = useState("Australia");
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!enquiryType) {
      toast.error("Please select an enquiry type.");
      return;
    }
    setSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      await sendPublicInquiryEmail({
        data: {
          source: "contact",
          firstName: String(formData.get("first") || ""),
          lastName: String(formData.get("last") || ""),
          company: String(formData.get("company") || ""),
          phone: String(formData.get("phone") || ""),
          email: String(formData.get("email") || ""),
          enquiryType,
          country,
          message: String(formData.get("message") || ""),
        },
      });
      toast.success("Thanks! We'll be in touch shortly.");
      form.reset();
      setEnquiryType("");
      setCountry("Australia");
    } catch (error: any) {
      toast.error(error?.message || "Unable to send your message.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section id="contact" className="relative bg-background">
      <div className="max-w-5xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-[var(--navy)] sm:text-4xl md:text-5xl">
          Contact us
        </h2>
        <p className="text-muted-foreground mt-3 max-w-xl">
          Have a question? Get in touch with our team — we're here to help.
        </p>
        <form onSubmit={onSubmit} className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="First name" required>
            <Input required name="first" />
          </Field>
          <Field label="Last name" required>
            <Input required name="last" />
          </Field>
          <Field label="Company / Business name" required className="md:col-span-2">
            <Input required name="company" />
          </Field>
          <Field label="Phone" required>
            <Input required name="phone" type="tel" />
          </Field>
          <Field label="Email" required>
            <Input required name="email" type="email" />
          </Field>
          <Field label="Enquiry type" required>
            <Select value={enquiryType} onValueChange={setEnquiryType}>
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Enquiry</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Country" required>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Australia">Australia</SelectItem>
                <SelectItem value="India">India</SelectItem>
                <SelectItem value="New Zealand">New Zealand</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Message" className="md:col-span-2">
            <Textarea name="message" rows={5} />
          </Field>
          <div className="md:col-span-2">
            <Button
              type="submit"
              variant="outline"
              disabled={submitting}
              className="rounded-full px-8"
            >
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-sm font-medium text-[var(--navy)] mb-2 block">
        {label}
        {required && "*"}
      </Label>
      {children}
    </div>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const [productUpdates, setProductUpdates] = useState(true);
  const [tips, setTips] = useState(true);

  const subscribeNewsletter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setNewsletterSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      await sendPublicInquiryEmail({
        data: {
          source: "newsletter",
          firstName: String(formData.get("firstName") || ""),
          lastName: String(formData.get("lastName") || ""),
          email: String(formData.get("email") || ""),
          interests: [
            ...(productUpdates ? ["Product Updates"] : []),
            ...(tips ? ["Tips & Best Practices"] : []),
          ],
        },
      });
      toast.success("Subscribed!");
      form.reset();
      setProductUpdates(true);
      setTips(true);
    } catch (error: any) {
      toast.error(error?.message || "Unable to subscribe right now.");
    } finally {
      setNewsletterSubmitting(false);
    }
  };

  return (
    <footer className="bg-[var(--navy)] text-white">
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="sm:col-span-3 mb-2">
            <RotaroBrand variant="inverse" textClassName="text-xl" />
          </div>
          <FooterCol
            title="Product"
            links={[
              "Roster Management",
              "Leave Management",
              "Shift Swaps",
              "Attendance Tracking",
              "Reports",
              "Staff Management",
            ]}
          />
          <FooterCol
            title="Company"
            links={["About Us", "Pricing", "Industries", "Support", "Contact", "FAQs"]}
          />
          <div>
            <h4 className="font-bold mb-3">Account</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li>
                <Link to="/staff-login" className="hover:text-white">
                  Staff Login
                </Link>
              </li>
              <li>
                <Link to="/client-login" className="hover:text-white">
                  Employer Login
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-white">
                  Client Signup
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="lg:col-span-5">
          <h3 className="text-2xl font-bold">Subscribe to our newsletter</h3>
          <form onSubmit={subscribeNewsletter} className="mt-5 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                name="firstName"
                placeholder="First name*"
                required
                className="bg-white/10 border-white/30 text-white placeholder:text-white/60"
              />
              <Input
                name="lastName"
                placeholder="Last name*"
                required
                className="bg-white/10 border-white/30 text-white placeholder:text-white/60"
              />
            </div>
            <Input
              name="email"
              placeholder="Email address*"
              type="email"
              required
              className="bg-white/10 border-white/30 text-white placeholder:text-white/60"
            />
            <div className="flex flex-wrap gap-5 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={productUpdates}
                  onCheckedChange={(checked) => setProductUpdates(checked === true)}
                  className="border-white data-[state=checked]:bg-white data-[state=checked]:text-[var(--navy)]"
                />
                Product Updates
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={tips}
                  onCheckedChange={(checked) => setTips(checked === true)}
                  className="border-white data-[state=checked]:bg-white data-[state=checked]:text-[var(--navy)]"
                />
                Tips & Best Practices
              </label>
            </div>
            <Button
              type="submit"
              disabled={newsletterSubmitting}
              className="rounded-full bg-white text-[var(--navy)] hover:bg-white/90"
            >
              {newsletterSubmitting ? "Submitting..." : "Submit"}
            </Button>
          </form>
        </div>
      </div>
      <div className="border-t border-white/15">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/70">
          <div>© {year} Rotaro. All rights reserved.</div>
          <div className="flex gap-5">
            <a href="#" className="hover:text-white">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-white">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h4 className="font-bold mb-3">{title}</h4>
      <ul className="space-y-2 text-sm text-white/80">
        {links.map((l) => (
          <li key={l}>
            <a href="#" className="hover:text-white">
              {l}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
