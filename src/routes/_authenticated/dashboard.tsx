import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock, FileText, CalendarCheck, Users, Repeat, AlertTriangle } from "lucide-react";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProfile();
        if (!p) {
          throw new Error("Unable to load your profile. Please sign in again.");
        }
        setProfile(p);
      } catch (err: any) {
        setError(err.message ?? "Unable to load your profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div className="max-w-sm bg-card border rounded-xl p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            If this persists, please sign out and sign in again.
          </p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return isManager(profile) ? <ManagerDashboard /> : <EmployeeDashboard profile={profile} />;
}

function ManagerDashboard() {
  const [stats, setStats] = useState({
    weekHours: 0,
    pendingLeaves: 0,
    pendingSwaps: 0,
    staff: 0,
    holidays: 0,
    presentToday: 0,
  });

  useEffect(() => {
    (async () => {
      const today = new Date();
      const weekEnd = new Date();
      weekEnd.setDate(today.getDate() + 7);
      const todayStr = today.toISOString().slice(0, 10);
      const weekEndStr = weekEnd.toISOString().slice(0, 10);

      const [
        { data: shifts },
        { count: leaves },
        { count: swaps },
        { count: emps },
        { count: holidays },
        { count: present },
      ] = await Promise.all([
        supabase
          .from("roster_shifts")
          .select("total_hours, day")
          .gte("day", todayStr)
          .lte("day", weekEndStr),
        supabase.from("leaves").select("*", { count: "exact", head: true }).eq("status", "Pending"),
        supabase
          .from("shift_swaps")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase.from("employees").select("*", { count: "exact", head: true }),
        supabase
          .from("holidays")
          .select("*", { count: "exact", head: true })
          .gte("holiday_date", todayStr)
          .lte("holiday_date", weekEndStr),
        supabase
          .from("attendance_records")
          .select("*", { count: "exact", head: true })
          .eq("date", todayStr)
          .not("check_in_time", "is", null),
      ]);

      setStats({
        weekHours: (shifts ?? []).reduce((s: number, x: any) => s + Number(x.total_hours ?? 0), 0),
        pendingLeaves: leaves ?? 0,
        pendingSwaps: swaps ?? 0,
        staff: emps ?? 0,
        holidays: holidays ?? 0,
        presentToday: present ?? 0,
      });
    })();
  }, []);

  const cards = [
    { label: "This week's hours", value: stats.weekHours.toFixed(1), icon: Clock, to: "/roster" },
    { label: "Total employees", value: stats.staff, icon: Users, to: "/staff" },
    { label: "Pending leave", value: stats.pendingLeaves, icon: FileText, to: "/leaves" },
    { label: "Pending swaps", value: stats.pendingSwaps, icon: Repeat, to: "/swaps" },
    { label: "Present today", value: stats.presentToday, icon: Clock, to: "/attendance" },
    { label: "Upcoming holidays", value: stats.holidays, icon: CalendarCheck, to: "/holidays" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">An overview of your operations.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, to }) => (
          <Link
            key={label}
            to={to}
            className="bg-card border rounded-xl p-5 shadow-sm hover:border-[var(--navy)] transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
              <div className="size-8 rounded-md bg-secondary flex items-center justify-center">
                <Icon className="size-4 text-[var(--navy)]" />
              </div>
            </div>
            <div className="text-3xl font-semibold text-[var(--navy)]">{value}</div>
          </Link>
        ))}
      </div>

      {stats.pendingLeaves + stats.pendingSwaps > 0 && (
        <div className="bg-card border rounded-xl p-5 shadow-sm flex items-start gap-3">
          <AlertTriangle className="size-5 text-[var(--navy)] mt-0.5" />
          <div className="text-sm">
            You have <strong>{stats.pendingLeaves}</strong> leave and{" "}
            <strong>{stats.pendingSwaps}</strong> swap requests waiting for review.
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeDashboard({ profile }: { profile: Profile }) {
  const [empId, setEmpId] = useState<string | null>(null);
  const [nextShift, setNextShift] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [weekHours, setWeekHours] = useState(0);
  const [weekDays, setWeekDays] = useState(0);
  const [today, setToday] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (!emp) return;
      setEmpId(emp.id);

      const todayStr = new Date().toISOString().slice(0, 10);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartStr = weekStart.toISOString().slice(0, 10);

      const [{ data: next }, { data: bal }, { data: att }, { data: todayAtt }] = await Promise.all([
        supabase
          .from("roster_shifts")
          .select("*")
          .eq("employee_id", emp.id)
          .gte("day", todayStr)
          .order("day")
          .limit(1)
          .maybeSingle(),
        supabase.from("leave_balances").select("*").eq("employee_id", emp.id),
        supabase
          .from("attendance_records")
          .select("check_in_time, check_out_time")
          .eq("employee_id", emp.id)
          .gte("date", weekStartStr),
        supabase
          .from("attendance_records")
          .select("*")
          .eq("employee_id", emp.id)
          .eq("date", todayStr)
          .maybeSingle(),
      ]);

      setNextShift(next ?? null);
      setBalances(bal ?? []);
      setToday(todayAtt ?? null);
      const hrs = (att ?? []).reduce((sum: number, a: any) => {
        if (a.check_in_time && a.check_out_time) {
          return (
            sum +
            (new Date(a.check_out_time).getTime() - new Date(a.check_in_time).getTime()) / 3600000
          );
        }
        return sum;
      }, 0);
      setWeekHours(hrs);
      setWeekDays((att ?? []).filter((a: any) => a.check_in_time).length);
    })();
  }, [profile.id]);

  const checkIn = async () => {
    if (!empId || !profile.business_id) return;
    await supabase.from("attendance_records").insert({
      business_id: profile.business_id,
      employee_id: empId,
      date: new Date().toISOString().slice(0, 10),
      check_in_time: new Date().toISOString(),
      status: "checked_in",
    });
    location.reload();
  };

  const checkOut = async () => {
    if (!today) return;
    await supabase
      .from("attendance_records")
      .update({
        check_out_time: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", today.id);
    location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground mt-1">{new Date().toDateString()}</p>
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Today</div>
          <div className="font-semibold mt-1">
            {today?.check_in_time
              ? `Checked in at ${new Date(today.check_in_time).toLocaleTimeString()}`
              : "Not checked in yet"}
            {today?.check_out_time &&
              ` · Out ${new Date(today.check_out_time).toLocaleTimeString()}`}
          </div>
        </div>
        <div className="flex gap-2">
          {!today?.check_in_time && (
            <button
              onClick={checkIn}
              className="px-4 py-2 rounded-md bg-[var(--navy)] text-white text-sm hover:bg-[var(--navy-light)]"
            >
              Check in
            </button>
          )}
          {today?.check_in_time && !today?.check_out_time && (
            <button
              onClick={checkOut}
              className="px-4 py-2 rounded-md bg-[var(--navy)] text-white text-sm hover:bg-[var(--navy-light)]"
            >
              Check out
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <div className="text-xs uppercase text-muted-foreground">My next shift</div>
          {nextShift ? (
            <>
              <div className="text-lg font-semibold text-[var(--navy)] mt-2">{nextShift.day}</div>
              <div className="text-sm text-muted-foreground">
                {nextShift.start_time?.slice(0, 5)} – {nextShift.end_time?.slice(0, 5)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground mt-2">No upcoming shifts.</div>
          )}
        </div>

        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <div className="text-xs uppercase text-muted-foreground">This week</div>
          <div className="text-3xl font-semibold text-[var(--navy)] mt-2">
            {weekHours.toFixed(1)}
          </div>
          <div className="text-sm text-muted-foreground">hours · {weekDays} days worked</div>
        </div>

        <div className="bg-card border rounded-xl p-5 shadow-sm">
          <div className="text-xs uppercase text-muted-foreground">Leave balance</div>
          <div className="mt-2 space-y-1">
            {balances.length === 0 ? (
              <div className="text-sm text-muted-foreground">No balances set.</div>
            ) : (
              balances.map((b: any) => (
                <div key={b.id} className="flex justify-between text-sm">
                  <span>{b.leave_type}</span>
                  <span className="font-medium">{Number(b.total_days) - Number(b.used_days)}d</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/apply-leave"
          className="px-4 py-2 rounded-md border bg-card text-sm hover:border-[var(--navy)]"
        >
          Apply Leave
        </Link>
        <Link
          to="/swaps"
          className="px-4 py-2 rounded-md border bg-card text-sm hover:border-[var(--navy)]"
        >
          Request Shift Swap
        </Link>
        <Link
          to="/my-roster"
          className="px-4 py-2 rounded-md border bg-card text-sm hover:border-[var(--navy)]"
        >
          View Full Roster
        </Link>
      </div>
    </div>
  );
}
