import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
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
import { toast } from "sonner";
import { BookOpen, MessageSquare, HelpCircle, Headphones, LayoutDashboard } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/routes/index";
import { sendPublicInquiryEmail } from "@/lib/emailjs";
import { canonicalLink, publicPageMeta } from "@/lib/seo";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: publicPageMeta({
      title: "Support | Rotaro",
      description:
        "Get help with Rotaro setup, employee rosters, leave, attendance, billing, reports, and workforce management.",
      path: "/support",
    }),
    links: [canonicalLink("/support")],
  }),
  component: SupportPage,
});

function SupportPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <SupportHero />
      <SupportIntro />
      <SupportOptions />
      <GettingStarted />
      <SupportForm />
      <BottomCTA />
      <SiteFooter />
    </div>
  );
}

function SupportHero() {
  return (
    <section className="relative bg-[#EEF1F6] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid grid-cols-1 md:grid-cols-2 gap-10 items-center relative z-10">
        <div>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[var(--navy)] leading-tight">
            Real help,
            <br />
            when you need it.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-md">
            From setup to day-to-day questions, our team is here to make sure Rotaro works the way
            your business does.
          </p>
        </div>
        <div className="flex justify-center md:justify-end">
          <SupportIllustration />
        </div>
      </div>
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-12 bg-white"
        style={{ clipPath: "polygon(0 100%, 100% 40%, 100% 100%)" }}
      />
    </section>
  );
}

function SupportIllustration() {
  return (
    <svg
      viewBox="0 0 320 240"
      className="w-full max-w-sm h-auto"
      role="img"
      aria-label="Support illustration"
    >
      {/* laptop base */}
      <rect x="40" y="170" width="240" height="14" rx="4" fill="#1E2A45" />
      <rect x="60" y="80" width="200" height="100" rx="8" fill="#1E2A45" />
      <rect x="70" y="90" width="180" height="80" rx="4" fill="#FFFFFF" />
      {/* dashboard lines */}
      <rect x="80" y="100" width="60" height="8" rx="2" fill="#1E2A45" />
      <rect x="80" y="116" width="160" height="6" rx="2" fill="#EEF1F6" />
      <rect x="80" y="128" width="120" height="6" rx="2" fill="#EEF1F6" />
      <rect x="80" y="144" width="40" height="18" rx="3" fill="#1E2A45" />
      <rect x="128" y="144" width="40" height="18" rx="3" fill="#EEF1F6" />
      <rect x="176" y="144" width="40" height="18" rx="3" fill="#EEF1F6" />
      {/* chat bubble */}
      <circle cx="240" cy="60" r="40" fill="#1E2A45" />
      <path d="M220 88 L230 72 L240 80 Z" fill="#1E2A45" />
      <circle cx="226" cy="60" r="4" fill="#FFFFFF" />
      <circle cx="240" cy="60" r="4" fill="#FFFFFF" />
      <circle cx="254" cy="60" r="4" fill="#FFFFFF" />
      {/* headset person silhouette */}
      <circle cx="90" cy="50" r="22" fill="#1E2A45" />
      <path d="M68 50 Q68 32 90 32 Q112 32 112 50" stroke="#1E2A45" strokeWidth="4" fill="none" />
      <rect x="64" y="50" width="8" height="14" rx="3" fill="#1E2A45" />
      <rect x="108" y="50" width="8" height="14" rx="3" fill="#1E2A45" />
      <path d="M60 110 Q60 78 90 78 Q120 78 120 110 Z" fill="#1E2A45" />
    </svg>
  );
}

function SupportIntro() {
  return (
    <section className="bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
        <h2 className="text-3xl font-bold text-[var(--navy)] sm:text-4xl md:text-5xl">Support</h2>
        <p className="mt-6 text-lg sm:text-xl font-semibold text-[var(--navy)]">
          It isn't always easy getting started with new software. You need real help, when you need
          it.
        </p>
        <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
          <p>
            That's why our support team is here to help — from initial setup to day-to-day questions
            about rosters, leave, attendance, and reports.
          </p>
          <p>
            Whether you're an employer setting up your business or an employee using Rotaro for the
            first time, we're here to make sure you get the most out of the platform.
          </p>
        </div>
      </div>
    </section>
  );
}

function SupportOptions() {
  const cards = [
    {
      icon: BookOpen,
      title: "Help Centre",
      desc: "Browse step-by-step guides on setting up rosters, managing leave, tracking attendance, and generating reports.",
      cta: "Visit Help Centre",
      href: "#",
    },
    {
      icon: MessageSquare,
      title: "Contact Support",
      desc: "Have a specific question? Send us a message and our team will get back to you as soon as possible.",
      cta: "Go to Contact Form",
      href: "/#contact",
    },
    {
      icon: HelpCircle,
      title: "Frequently Asked Questions",
      desc: "Find quick answers to common questions about plans, features, and account setup.",
      cta: "View FAQs",
      href: "/pricing#faq",
    },
  ];
  return (
    <section className="bg-[#F8F9FB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <h2 className="text-3xl sm:text-4xl font-bold text-[var(--navy)] text-center">
          How can we help?
        </h2>
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map(({ icon: Icon, title, desc, cta, href }) => (
            <div
              key={title}
              className="bg-white border border-border rounded-xl p-7 shadow-sm hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="size-12 rounded-lg bg-[#EEF1F6] flex items-center justify-center mb-5">
                <Icon className="size-6 text-[var(--navy)]" />
              </div>
              <h3 className="text-lg font-bold text-[var(--navy)]">{title}</h3>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed flex-1">{desc}</p>
              <a
                href={href}
                className="mt-5 inline-flex items-center text-sm font-semibold text-[var(--navy)] hover:underline"
              >
                {cta} →
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GettingStarted() {
  const steps = [
    {
      n: 1,
      title: "Set up your business",
      desc: "Add your business details, operating hours, and locations.",
    },
    {
      n: 2,
      title: "Add your team",
      desc: "Invite employees with their roles, departments, and contact details.",
    },
    {
      n: 3,
      title: "Build your first roster",
      desc: "Create a roster from scratch or copy a previous one, then publish it.",
    },
    {
      n: 4,
      title: "Track and manage",
      desc: "Approve leave, manage swaps, track attendance, and view reports.",
    },
  ];
  return (
    <section className="bg-[#F8F9FB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 sm:py-24 border-t border-border">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--navy)]">
            Getting started checklist
          </h2>
          <p className="mt-4 text-muted-foreground">
            Our onboarding flow walks you through everything step by step — but here's a quick
            overview of what to expect.
          </p>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map(({ n, title, desc }) => (
            <div key={n} className="text-center">
              <div className="mx-auto size-14 rounded-full bg-[var(--navy)] text-white flex items-center justify-center text-xl font-bold mb-4">
                {n}
              </div>
              <h3 className="font-bold text-[var(--navy)]">{title}</h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SupportForm() {
  const [submitting, setSubmitting] = useState(false);
  const [issueType, setIssueType] = useState("");
  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!issueType) {
      toast.error("Please select an issue type.");
      return;
    }
    setSubmitting(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    try {
      await sendPublicInquiryEmail({
        data: {
          source: "support",
          firstName: String(formData.get("first") || ""),
          lastName: String(formData.get("last") || ""),
          email: String(formData.get("email") || ""),
          phone: String(formData.get("phone") || ""),
          issueType,
          message: String(formData.get("message") || ""),
        },
      });
      toast.success("Thanks! Our support team will get back to you shortly.");
      form.reset();
      setIssueType("");
    } catch (error: any) {
      toast.error(error?.message || "Unable to send your message.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section className="bg-[#EEF1F6]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-[var(--navy)]">Still need help?</h2>
          <p className="mt-3 text-muted-foreground">
            Send us a message and our support team will get back to you within 1 business day.
          </p>
        </div>
        <form onSubmit={onSubmit} className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="First name" required>
            <Input required name="first" className="bg-white" />
          </Field>
          <Field label="Last name" required>
            <Input required name="last" className="bg-white" />
          </Field>
          <Field label="Email" required>
            <Input required name="email" type="email" className="bg-white" />
          </Field>
          <Field label="Phone">
            <Input name="phone" type="tel" className="bg-white" />
          </Field>
          <Field label="Issue type" required className="md:col-span-2">
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Select an issue type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="account">Account & Login</SelectItem>
                <SelectItem value="roster">Roster & Scheduling</SelectItem>
                <SelectItem value="leave">Leave & Attendance</SelectItem>
                <SelectItem value="billing">Billing & Plans</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Message" className="md:col-span-2">
            <Textarea name="message" rows={6} className="bg-white" />
          </Field>
          <div className="md:col-span-2 text-center">
            <Button
              type="submit"
              variant="outline"
              disabled={submitting}
              className="rounded-full px-8 border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--navy)] hover:text-white"
            >
              {submitting ? "Sending…" : "Send Message"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

function BottomCTA() {
  return (
    <section className="bg-[var(--navy)] text-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
        <div className="mx-auto size-14 rounded-full bg-white/10 flex items-center justify-center mb-6">
          <Headphones className="size-7 text-white" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold">
          Need more help? We're just a message away.
        </h2>
        <p className="mt-4 text-white/80 max-w-xl mx-auto">
          Our support team is ready to assist with setup, troubleshooting, and any questions about
          Rotaro.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
          <a href="/#contact">
            <Button
              size="lg"
              className="h-12 px-8 rounded-full bg-white text-[var(--navy)] hover:bg-white/90 w-full sm:w-auto"
            >
              Contact Support
            </Button>
          </a>
          <a href="#">
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-8 rounded-full border-white text-white bg-transparent hover:bg-white hover:text-[var(--navy)] w-full sm:w-auto"
            >
              <LayoutDashboard className="size-4" />
              View Help Centre
            </Button>
          </a>
        </div>
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
