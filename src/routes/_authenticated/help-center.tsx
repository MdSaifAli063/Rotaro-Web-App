import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  BookOpen,
  FileText,
  HelpCircle,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/help-center")({
  component: HelpCenterPage,
});

type TabKey = "faq" | "articles" | "guides" | "terms" | "privacy";

function HelpCenterPage() {
  const [tab, setTab] = useState<TabKey>("faq");
  const [query, setQuery] = useState("");

  const faqs = useMemo(
    () => [
      {
        q: "How do I reset my password?",
        a: "Go to Profile from the sidebar or user menu. If your account uses email sign-in, use the forgot-password flow on the login page.",
      },
      {
        q: "How do I add a new employee to Rotaro?",
        a: "Open Staff, choose Add employee, then enter the employee details, department, role, and contact information.",
      },
      {
        q: "How do I create and publish a weekly roster?",
        a: "Open Rosters, create a new roster, assign shifts, review the week, and publish when everything is ready.",
      },
      {
        q: "How does attendance tracking work?",
        a: "Employees check in and out from their portal. Managers can review live attendance, breaks, and total hours in Attendance.",
      },
      {
        q: "How do I approve or decline leave requests?",
        a: "Leave requests arrive in the employer portal. Open Leave Requests, review the details, and approve or reject the request.",
      },
      {
        q: "How do I manage my subscription?",
        a: "Open Billing to review your current plan, payment method, and subscription options.",
      },
      {
        q: "How do I control which alerts I receive?",
        a: "Open Settings, then Notifications. Turn the alerts on or off depending on what your team should be notified about.",
      },
      {
        q: "Who can I contact for help?",
        a: "Use the support page or contact the team from the Help Center if you need direct assistance.",
      },
    ],
    [],
  );

  const filteredFaqs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return faqs;
    return faqs.filter(
      (item) => item.q.toLowerCase().includes(needle) || item.a.toLowerCase().includes(needle),
    );
  }, [faqs, query]);

  const cards = [
    {
      title: "Articles",
      desc: "Browse short how-to guides for common workplace tasks.",
      icon: BookOpen,
      href: "#faq",
    },
    {
      title: "Guides & Tutorials",
      desc: "Step-by-step walkthroughs for setup, rosters, and attendance.",
      icon: MessageSquare,
      href: "#faq",
    },
    {
      title: "Terms & Conditions",
      desc: "Review the platform terms for plan and account usage.",
      icon: FileText,
      href: "/terms",
    },
    {
      title: "Privacy Policy",
      desc: "Read how Rotaro handles account and business data.",
      icon: HelpCircle,
      href: "/privacy",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)] sm:text-4xl">
          Help Center
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Find solutions and support for common Rotaro questions.
        </p>
      </header>

      <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <div className="bg-gradient-to-br from-[#1f61ff] via-[#1666ef] to-[#0f97c8] px-5 py-8 text-white sm:px-8 sm:py-10">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-bold sm:text-4xl">Find What You Need</h2>
            <p className="mt-3 text-sm text-white/85 sm:text-base">
              Search FAQs, guides, and articles for roster, attendance, leave, and billing help.
            </p>
            <div className="mx-auto mt-6 flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Quick search..."
                  className="h-12 rounded-2xl border-0 bg-white/95 pl-11 text-[var(--navy)] placeholder:text-slate-400"
                />
              </div>
              <Button className="h-12 rounded-2xl bg-white px-7 text-[var(--navy)] hover:bg-white/90">
                Search
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 pb-5 pt-4 sm:px-6">
          <Tabs value={tab} onValueChange={(value) => setTab(value as TabKey)}>
            <TabsList className="h-auto w-full justify-start gap-0 rounded-2xl bg-[#eef2f8] p-1">
              <TabsTrigger value="faq" className="rounded-xl px-4 py-2">
                FAQ
              </TabsTrigger>
              <TabsTrigger value="articles" className="rounded-xl px-4 py-2">
                Articles
              </TabsTrigger>
              <TabsTrigger value="guides" className="rounded-xl px-4 py-2">
                Guides & Tutorials
              </TabsTrigger>
              <TabsTrigger value="terms" className="rounded-xl px-4 py-2">
                Terms & Conditions
              </TabsTrigger>
              <TabsTrigger value="privacy" className="rounded-xl px-4 py-2">
                Privacy Policy
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mt-4 rounded-3xl border bg-background p-5 sm:p-6">
            <h3 className="text-xl font-semibold text-[var(--navy)]">
              {tab === "faq" && "Frequently Asked Questions"}
              {tab === "articles" && "Articles"}
              {tab === "guides" && "Guides & Tutorials"}
              {tab === "terms" && "Terms & Conditions"}
              {tab === "privacy" && "Privacy Policy"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Answers for employers and employees using Rotaro.
            </p>

            {tab === "faq" ? (
              <div className="mt-5">
                <Accordion type="single" collapsible className="space-y-2">
                  {filteredFaqs.length === 0 ? (
                    <div className="rounded-2xl border px-4 py-10 text-center text-sm text-muted-foreground">
                      No matching help topics found.
                    </div>
                  ) : (
                    filteredFaqs.map((item) => (
                      <AccordionItem
                        key={item.q}
                        value={item.q}
                        className="rounded-2xl border px-4 data-[state=open]:bg-secondary/30"
                      >
                        <AccordionTrigger className="py-4 text-left text-sm font-semibold text-[var(--navy)] hover:no-underline">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                          {item.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))
                  )}
                </Accordion>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {cards
                  .filter((item) =>
                    tab === "articles"
                      ? item.title === "Articles"
                      : tab === "guides"
                        ? item.title === "Guides & Tutorials"
                        : tab === "terms"
                          ? item.title === "Terms & Conditions"
                          : item.title === "Privacy Policy",
                  )
                  .map(({ icon: Icon, title, desc, href }) => (
                    <a
                      key={title}
                      href={href}
                      className="rounded-2xl border p-5 transition-colors hover:bg-secondary/40"
                    >
                      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-secondary">
                        <Icon className="size-5 text-[var(--navy)]" />
                      </div>
                      <div className="text-base font-semibold text-[var(--navy)]">{title}</div>
                      <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
                    </a>
                  ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { title: "Help Centre", desc: "Browse step-by-step guides for setup and daily tasks." },
          { title: "Contact Support", desc: "Send a direct message if you need help from the team." },
          { title: "Account and billing", desc: "Review plans, payment settings, and questions." },
        ].map((item) => (
          <div key={item.title} className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-secondary">
              <ChevronRight className="size-5 text-[var(--navy)]" />
            </div>
            <div className="text-base font-semibold text-[var(--navy)]">{item.title}</div>
            <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
