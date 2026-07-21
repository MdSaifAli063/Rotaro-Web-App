import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarDays,
  Calculator,
  Clock4,
  CreditCard,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  LayoutTemplate,
  MessageSquare,
  Repeat,
  Settings,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/workspace")({
  component: WorkspacePage,
});

type MetricState = {
  staff: number;
  unreadMessages: number;
  pendingLeaves: number;
  todayAttendance: number;
  holidaysThisMonth: number;
};

const baseMetrics: MetricState = {
  staff: 0,
  unreadMessages: 0,
  pendingLeaves: 0,
  todayAttendance: 0,
  holidaysThisMonth: 0,
};

function WorkspacePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [metrics, setMetrics] = useState<MetricState>(baseMetrics);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
    })();
  }, []);

  useEffect(() => {
    if (!profile?.business_id) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const businessId = profile.business_id;
    const userId = profile.id;
    const load = async () => {
      setLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const monthStart = `${today.slice(0, 8)}01`;
      const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);

      const [staff, unreadMessages, pendingLeaves, attendance, holidays] = await Promise.all([
        supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("recipient_id", userId)
          .eq("is_read", false),
        supabase
          .from("leaves")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("status", "pending"),
        supabase
          .from("attendance_records")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("date", today),
        supabase
          .from("holidays")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .gte("holiday_date", monthStart)
          .lte("holiday_date", monthEnd),
      ]);

      if (!mounted) return;
      setMetrics({
        staff: staff.count ?? 0,
        unreadMessages: unreadMessages.count ?? 0,
        pendingLeaves: pendingLeaves.count ?? 0,
        todayAttendance: attendance.count ?? 0,
        holidaysThisMonth: holidays.count ?? 0,
      });
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`workspace:${profile.business_id}:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `business_id=eq.${profile.business_id}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leaves",
          filter: `business_id=eq.${profile.business_id}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `business_id=eq.${profile.business_id}`,
        },
        load,
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const manager = isManager(profile);

  const modules = useMemo(
    () =>
      manager
        ? [
            {
              to: "/dashboard",
              title: "Dashboard",
              desc: "Live overview, roster cost, leave, and attendance.",
              icon: LayoutDashboard,
              badge: "Overview",
            },
            {
              to: "/roster",
              title: "Rosters",
              desc: "Plan, edit, save, and publish weekly rosters.",
              icon: CalendarDays,
              badge: "Plan",
            },
            {
              to: "/organization",
              title: "Organization",
              desc: "Company profile, logo, locations, and roster defaults.",
              icon: Building2,
              badge: "Company",
            },
            {
              to: "/shifts",
              title: "Shift Templates",
              desc: "Reusable shift presets for faster scheduling.",
              icon: LayoutTemplate,
              badge: "Templates",
            },
            {
              to: "/staff",
              title: "Staff",
              desc: "Manage team records, departments, and pay details.",
              icon: Users,
              badge: `${metrics.staff} staff`,
            },
            {
              to: "/leaves",
              title: "Leave Requests",
              desc: "Approve, decline, and track leave balances.",
              icon: FileText,
              badge: `${metrics.pendingLeaves} pending`,
            },
            {
              to: "/attendance",
              title: "Attendance",
              desc: "Review check-ins, breaks, and working hours.",
              icon: Clock4,
              badge: `${metrics.todayAttendance} today`,
            },
            {
              to: "/messages",
              title: "Messages",
              desc: "Send and receive realtime workspace messages.",
              icon: MessageSquare,
              badge: `${metrics.unreadMessages} unread`,
            },
            {
              to: "/calendar",
              title: "Calendar",
              desc: "Live time, month view, and holiday calendar.",
              icon: CalendarCheck,
              badge: `${metrics.holidaysThisMonth} holidays`,
            },
            {
              to: "/calculator",
              title: "Calculator",
              desc: "Run calculations, memory actions, and shift pay estimates.",
              icon: Calculator,
              badge: "Utility",
            },
            {
              to: "/reports",
              title: "Reports",
              desc: "Analyze hours, wages, leave, and roster trends.",
              icon: BarChart3,
              badge: "Analytics",
            },
            {
              to: "/billing",
              title: "Billing",
              desc: "Manage plans, Razorpay subscriptions, and invoices.",
              icon: CreditCard,
              badge: "Finance",
            },
            {
              to: "/settings",
              title: "Settings",
              desc: "Company, notifications, security, and integrations.",
              icon: Settings,
              badge: "Control",
            },
          ]
        : [
            {
              to: "/dashboard",
              title: "Dashboard",
              desc: "Your next shift, leave summary, and quick actions.",
              icon: LayoutDashboard,
              badge: "Home",
            },
            {
              to: "/my-roster",
              title: "My Roster",
              desc: "See your upcoming shifts and weekly schedule.",
              icon: CalendarDays,
              badge: "Schedule",
            },
            {
              to: "/apply-leave",
              title: "Apply Leave",
              desc: "Submit leave requests and track decisions.",
              icon: FileText,
              badge: "Leave",
            },
            {
              to: "/attendance",
              title: "My Attendance",
              desc: "Check in, start breaks, and review time records.",
              icon: Clock4,
              badge: "Time",
            },
            {
              to: "/swaps",
              title: "Shift Swaps",
              desc: "Request or respond to shift swap activity.",
              icon: Repeat,
              badge: "Swap",
            },
            {
              to: "/messages",
              title: "Messages",
              desc: "Chat with managers and teammates in realtime.",
              icon: MessageSquare,
              badge: `${metrics.unreadMessages} unread`,
            },
            {
              to: "/calendar",
              title: "Calendar",
              desc: "View holidays and current local time.",
              icon: CalendarCheck,
              badge: `${metrics.holidaysThisMonth} holidays`,
            },
            {
              to: "/calculator",
              title: "Calculator",
              desc: "Quick calculations and shift pay estimates.",
              icon: Calculator,
              badge: "Utility",
            },
          ],
    [manager, metrics],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Workspace</h1>
          <p className="text-sm text-muted-foreground">
            Open every Rotaro module from one place and keep an eye on live activity.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4 shadow-sm lg:min-w-[260px]">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <LayoutGrid className="size-4 text-[var(--navy)]" />
            Workspace status
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--navy)]">
            {loading ? "Loading" : "Ready"}
          </div>
          <div className="text-sm text-muted-foreground">
            {profile?.name || profile?.email || "Rotaro workspace"}
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map(({ to, title, desc, icon: Icon, badge }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-[var(--navy)] hover:bg-secondary/30"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex size-11 items-center justify-center rounded-lg bg-secondary text-[var(--navy)] transition-colors group-hover:bg-[var(--navy)] group-hover:text-white">
                <Icon className="size-5" />
              </div>
              <Badge variant="outline">{badge}</Badge>
            </div>
            <div className="mt-5 text-lg font-semibold text-[var(--navy)]">{title}</div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
