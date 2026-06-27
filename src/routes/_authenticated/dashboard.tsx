import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  Coffee,
  FileText,
  LogIn,
  LogOut,
  Repeat,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { findEmployeeForUser } from "@/lib/employee";
import { notifyManagers } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const navy = "#1E2A45";
const palette = ["#1E2A45", "#2D3E5F", "#4A6080", "#6B85A0", "#8FA5BF", "#B0C4D8"];
const slots = [
  ["6A-7A", "06:00", "07:00"],
  ["7A-8A", "07:00", "08:00"],
  ["8A-9A", "08:00", "09:00"],
  ["9A-3P", "09:00", "15:00"],
  ["3P-4P", "15:00", "16:00"],
  ["4P-5P", "16:00", "17:00"],
  ["5P-6P", "17:00", "18:00"],
  ["6P-10P", "18:00", "22:00"],
];

type Emp = {
  id: string;
  name: string;
  department: string | null;
  employment_type: string | null;
  pay_rate: number | null;
  role?: string | null;
  status: string | null;
  user_id: string | null;
};
type Shift = {
  id: string;
  roster_id: string;
  employee_id: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  total_hours: number | null;
};
type Mode = "cost" | "staff" | "hours";

function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProfile();
        if (!p) throw new Error("Unable to load your profile.");
        setProfile(p);
      } catch (err: any) {
        setError(err.message ?? "Unable to load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Skeleton rows={8} />;
  if (error)
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{error}</div>
    );
  if (!profile) return null;
  return isManager(profile) ? (
    <EmployerDashboard profile={profile} />
  ) : (
    <EmployeeDashboard profile={profile} />
  );
}

function EmployerDashboard({ profile }: { profile: Profile }) {
  const [business, setBusiness] = useState<any>(null);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [rosters, setRosters] = useState<any[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leavesToday, setLeavesToday] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const [pendingSwaps, setPendingSwaps] = useState(0);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [staffDate, setStaffDate] = useState(key(startOfWeek(new Date())));
  const [mode, setMode] = useState<Mode>("cost");
  const [store, setStore] = useState("all");
  const [depts, setDepts] = useState<string[]>([]);
  const [deptMenuOpen, setDeptMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => key(new Date()), []);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekStartKey = useMemo(() => key(weekStart), [weekStart]);
  const weekEndKey = useMemo(() => key(weekEnd), [weekEnd]);
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const rosterMap = useMemo(() => new Map(rosters.map((r) => [r.id, r])), [rosters]);
  const allDepts = useMemo(
    () => uniq(employees.map((e) => e.department || "Unassigned")),
    [employees],
  );

  const load = useCallback(async () => {
    if (!profile.business_id) return;
    if (!employees.length) setLoading(true);
    const bid = profile.business_id;
    const [
      { data: biz },
      { data: emps },
      { data: ros },
      { data: att },
      { data: leaves },
      { data: swaps },
    ] = await Promise.all([
      supabase.from("businesses").select("*").eq("id", bid).maybeSingle(),
      supabase.from("employees").select("*").eq("business_id", bid).order("name"),
      supabase
        .from("rosters")
        .select("*")
        .eq("business_id", bid)
        .order("week_start", { ascending: false }),
      supabase
        .from("attendance_records")
        .select("*")
        .eq("business_id", bid)
        .eq("date", today)
        .order("check_in_time"),
      supabase
        .from("leaves")
        .select("*")
        .eq("business_id", bid)
        .lte("from_date", today)
        .gte("to_date", today),
      supabase.from("shift_swaps").select("id, status").eq("business_id", bid),
    ]);
    const rosterIds = (ros ?? []).map((r) => r.id);
    const { data: shiftRows } = rosterIds.length
      ? await supabase
          .from("roster_shifts")
          .select("*")
          .in("roster_id", rosterIds)
          .gte("day", weekStartKey)
          .lte("day", weekEndKey)
      : { data: [] };
    const employeeLookup = new Map((emps ?? []).map((emp) => [emp.id, emp]));
    const attendanceRows = (att ?? []).map((row) => {
      const employee = employeeLookup.get(row.employee_id);
      return {
        ...row,
        employees: employee ? { name: employee.name, department: employee.department } : null,
      };
    });
    const leaveRows = (leaves ?? []).map((row) => {
      const employee = employeeLookup.get(row.employee_id);
      return {
        ...row,
        employees: employee
          ? {
              name: employee.name,
              department: employee.department,
              user_id: employee.user_id,
            }
          : null,
      };
    });
    setBusiness(biz);
    setEmployees((emps ?? []) as Emp[]);
    setRosters(ros ?? []);
    setShifts((shiftRows ?? []) as Shift[]);
    setAttendance(attendanceRows);
    setLeavesToday(leaveRows.filter((l) => lower(l.status) === "approved"));
    setPendingLeaves(leaveRows.filter((l) => lower(l.status) === "pending").length);
    setPendingSwaps((swaps ?? []).filter((s) => lower(s.status) === "pending").length);
    setDepts((old) =>
      old.length ? old : uniq((emps ?? []).map((e) => e.department || "Unassigned")),
    );
    setLoading(false);
  }, [employees.length, profile.business_id, today, weekEndKey, weekStartKey]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    if (!profile.business_id) {
      return () => window.clearInterval(timer);
    }
    const channel = supabase
      .channel(`dashboard-employer:${profile.business_id}`)
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
          table: "shift_swaps",
          filter: `business_id=eq.${profile.business_id}`,
        },
        load,
      )
      .subscribe();
    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [load, profile.business_id]);

  const stores = useMemo(() => {
    const list = uniq([
      business?.location || business?.name || "Main location",
      ...rosters.map((r) => r.location).filter(Boolean),
    ]);
    return list.length ? list : ["Main location"];
  }, [business, rosters]);

  const filtered = useMemo(
    () =>
      shifts.filter((s) => {
        const emp = empMap.get(s.employee_id);
        const roster = rosterMap.get(s.roster_id);
        const dept = emp?.department || "Unassigned";
        const loc = roster?.location || business?.location || business?.name || "Main location";
        return (
          (depts.length ? depts : allDepts).includes(dept) && (store === "all" || loc === store)
        );
      }),
    [allDepts, business, depts, empMap, rosterMap, shifts, store],
  );

  const chartData = useMemo(
    () =>
      days(weekStart, weekEnd).map((date) => {
        const row: Record<string, any> = {
          day: date.toLocaleDateString("en-AU", {
            weekday: "short",
            day: "numeric",
            month: "numeric",
          }),
          total: 0,
        };
        allDepts.forEach((d) => (row[d] = 0));
        filtered
          .filter((s) => s.day === key(date))
          .forEach((s) => {
            const emp = empMap.get(s.employee_id);
            const dept = emp?.department || "Unassigned";
            const val =
              mode === "cost"
                ? Number(s.total_hours ?? 0) * Number(emp?.pay_rate ?? 0)
                : mode === "hours"
                  ? Number(s.total_hours ?? 0)
                  : 1;
            row[dept] += val;
            row.total += val;
          });
        return row;
      }),
    [allDepts, empMap, filtered, mode, weekEnd, weekStart],
  );

  const total = chartData.reduce((sum, r) => sum + Number(r.total), 0);
  const dayShifts = filtered.filter((s) => s.day === staffDate);
  const slotData = slots.map(([label, start, end]) => ({
    label,
    count: dayShifts.filter((s) => overlap(s.start_time, s.end_time, start, end)).length,
  }));
  const payData = Object.entries(
    dayShifts.reduce<Record<string, number>>((acc, s) => {
      const group = empMap.get(s.employee_id)?.employment_type || "Unassigned";
      acc[group] = (acc[group] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));
  const activeStaff = employees.filter((e) => lower(e.status || "active") === "active").length;
  const clockedIn = attendance.filter((a) => a.check_in_time && !a.check_out_time).length;
  const selectedDeptCount = (depts.length ? depts : allDepts).length;
  const selectedDeptLabel =
    selectedDeptCount === allDepts.length
      ? `All selected (${allDepts.length})`
      : `${selectedDeptCount} selected`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--navy)]">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Live overview of {business?.name || "your business"}.
        </p>
      </div>

      <div className="rounded-lg bg-[var(--navy)] px-4 py-3 text-white shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="flex w-full flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-white/75 sm:w-auto sm:flex-row sm:items-center">
            Store:
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="h-9 w-full min-w-0 rounded-md border-0 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-[var(--navy)] shadow-sm sm:min-w-[220px]"
            >
              <option value="all">{business?.name || "All stores"}</option>
              {stores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div className="relative flex w-full flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-white/75 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            Department:
            <div className="relative w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setDeptMenuOpen((open) => !open)}
                className="h-9 w-full min-w-0 rounded-md bg-white px-3 text-left text-sm font-semibold normal-case tracking-normal text-[var(--navy)] shadow-sm sm:min-w-[160px]"
              >
                {selectedDeptLabel}
              </button>
              {deptMenuOpen && (
                <div className="absolute left-0 top-11 z-40 w-full min-w-0 max-w-[calc(100vw-2rem)] rounded-md border bg-white p-3 text-[var(--navy)] shadow-lg sm:left-auto sm:right-0 sm:w-64 sm:min-w-[16rem]">
                  <button
                    type="button"
                    onClick={() => setDepts(allDepts)}
                    className="mb-2 text-xs underline underline-offset-2 hover:text-[var(--navy-light)]"
                  >
                    Select all
                  </button>
                  <div className="space-y-2">
                    {allDepts.map((dept) => (
                      <label key={dept} className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={(depts.length ? depts : allDepts).includes(dept)}
                          onChange={() =>
                            toggle(dept, depts.length ? depts : allDepts, setDepts, allDepts)
                          }
                          className="size-4 accent-[var(--navy)]"
                        />
                        <span>{dept}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
          <TodayPanel
            loading={loading}
            attendance={attendance}
            leaves={leavesToday}
            clockedIn={clockedIn}
          />
          <main className="min-w-0 space-y-6 p-4 lg:p-5">
            <section className="overflow-x-auto">
              <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-xl font-bold text-[var(--navy)]">Roster</h1>
                  <input
                    type="date"
                    value={key(weekStart)}
                    onChange={(e) => {
                      const d = new Date(e.target.value + "T00:00:00");
                      setWeekStart(d);
                      setStaffDate(key(d));
                    }}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  />
                  <span className="text-sm text-muted-foreground">
                    {weekStart.toLocaleDateString("en-AU")} - {weekEnd.toLocaleDateString("en-AU")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <strong className="text-lg text-[var(--navy)]">
                    Total: {fmtTotal(total, mode)}
                  </strong>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as Mode)}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="cost">Cost Projections</option>
                    <option value="staff">Staff Count - Roster</option>
                    <option value="hours">Hours - Roster</option>
                  </select>
                </div>
              </div>
              <div className="h-[260px] min-w-[760px]">
                {filtered.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v) => (mode === "cost" ? `$${v}` : String(v))}
                      />
                      <Tooltip formatter={(v: number) => fmtTotal(Number(v), mode)} />
                      <Legend />
                      {allDepts.map((dept, i) => (
                        <Bar
                          key={dept}
                          dataKey={dept}
                          stackId="dept"
                          fill={palette[i % palette.length]}
                        />
                      ))}
                      <Line type="monotone" dataKey="total" stroke={navy} strokeWidth={2} dot />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyRoster />
                )}
              </div>
            </section>
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold text-[var(--navy)]">Roster Staff Count</h2>
                <input
                  type="date"
                  value={staffDate}
                  min={key(weekStart)}
                  max={key(weekEnd)}
                  onChange={(e) => setStaffDate(e.target.value)}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <ChartCard title="By Time Period">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={slotData} layout="vertical" margin={{ left: 10, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis dataKey="label" type="category" width={70} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill={navy} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
                <ChartCard title="Per Pay Group">
                  <div className="grid items-center gap-3 sm:grid-cols-[1fr_160px]">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Tooltip />
                        <Pie data={payData} innerRadius={55} outerRadius={85} dataKey="value">
                          {payData.map((_, i) => (
                            <Cell key={i} fill={palette[i % palette.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 text-sm">
                      {payData.length ? (
                        payData.map((p, i) => (
                          <div key={p.name} className="flex justify-between gap-3">
                            <span className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full"
                                style={{ background: palette[i % palette.length] }}
                              />
                              {p.name}
                            </span>
                            <strong>{p.value}</strong>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground">No rostered staff.</p>
                      )}
                    </div>
                  </div>
                </ChartCard>
              </div>
            </section>
          </main>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Users}
          label="Total Employees"
          value={activeStaff}
          sub="Active staff members"
          to="/staff"
        />
        <Stat
          icon={CalendarCheck}
          label="Pending Leave Approvals"
          value={pendingLeaves}
          sub="Awaiting your approval"
          to="/leaves"
          badge={pendingLeaves > 0}
        />
        <Stat
          icon={Repeat}
          label="Pending Shift Swaps"
          value={pendingSwaps}
          sub="Swap requests pending"
          to="/swaps"
          badge={pendingSwaps > 0}
        />
        <Stat
          icon={AlertTriangle}
          label="Staff Shortage Alert"
          value={0}
          sub="Days understaffed this week"
          to="/roster"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Action to="/roster">Create Roster</Action>
        <Action to="/staff">Add Employee</Action>
        <Action to="/holidays">Import Holidays</Action>
        <Action to="/reports">View Reports</Action>
      </div>
    </div>
  );
}

function EmployeeDashboard({ profile }: { profile: Profile }) {
  const [employee, setEmployee] = useState<Emp | null>(null);
  const [nextShift, setNextShift] = useState<any>(null);
  const [today, setToday] = useState<any>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [weekShifts, setWeekShifts] = useState<any[]>([]);
  const [weekLeaves, setWeekLeaves] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const todayKey = useMemo(() => key(new Date()), []);
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const weekStartKey = useMemo(() => key(weekStart), [weekStart]);
  const weekEndKey = useMemo(() => key(weekEnd), [weekEnd]);

  const load = useCallback(async () => {
    const { employee: emp } = await findEmployeeForUser<Emp>(profile.id, "*");
    if (!emp) return;
    setEmployee(emp as Emp);
    const [
      { data: next },
      { data: att },
      { data: bal },
      { data: shifts },
      { data: leaveRows },
      { data: holidayRows },
      { data: unread },
    ] = await Promise.all([
      supabase
        .from("roster_shifts")
        .select("*, rosters(location)")
        .eq("employee_id", emp.id)
        .gte("day", todayKey)
        .order("day")
        .order("start_time")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("attendance_records")
        .select("*")
        .eq("employee_id", emp.id)
        .eq("date", todayKey)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("leave_balances").select("*").eq("employee_id", emp.id),
      supabase
        .from("roster_shifts")
        .select("*")
        .eq("employee_id", emp.id)
        .gte("day", weekStartKey)
        .lte("day", weekEndKey),
      supabase
        .from("leaves")
        .select("*")
        .eq("employee_id", emp.id)
        .lte("from_date", weekEndKey)
        .gte("to_date", weekStartKey),
      supabase
        .from("holidays")
        .select("*")
        .eq("business_id", profile.business_id ?? "")
        .gte("holiday_date", weekStartKey)
        .lte("holiday_date", weekEndKey),
      supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
    setNextShift(next);
    setToday(att);
    setBalances(bal ?? []);
    setWeekShifts(shifts ?? []);
    setWeekLeaves((leaveRows ?? []).filter((row) => lower(row.status) === "approved"));
    setHolidays(holidayRows ?? []);
    setNotes(unread ?? []);
  }, [profile.business_id, profile.id, todayKey, weekEndKey, weekStartKey]);

  useEffect(() => {
    load();
    if (!employee) return;
    const channel = supabase
      .channel(`dashboard-employee:${profile.id}:${employee.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          filter: `employee_id=eq.${employee.id}`,
        },
        load,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee, load, profile.id]);

  const updateAttendance = async (patch: Record<string, any>) => {
    if (!employee || !profile.business_id) return;
    setSaving(true);
    const payload = {
      ...patch,
      business_id: profile.business_id,
      employee_id: employee.id,
      user_id: employee.user_id ?? profile.id,
      date: todayKey,
    };
    const result = today?.id
      ? await supabase
          .from("attendance_records")
          .update({ ...patch, user_id: employee.user_id ?? profile.id } as any)
          .eq("id", today.id)
          .select("id")
          .single()
      : await supabase.from("attendance_records").insert(payload as any).select("id").single();
    setSaving(false);
    const { data: savedAttendance, error } = result;
    if (error) toast.error(error.message);
    else {
      if (profile.business_id) {
        const employeeName = employee.name || profile.name || "Employee";
        const notification = patch.check_in_time
          ? {
              type: "attendance_checked_in",
              message: `${employeeName} checked in at ${time(patch.check_in_time)}.`,
            }
          : patch.break_start
            ? {
                type: "attendance_break_started",
                message: `${employeeName} started a break at ${time(patch.break_start)}.`,
              }
            : patch.break_end
              ? {
                  type: "attendance_break_ended",
                  message: `${employeeName} ended a break at ${time(patch.break_end)}.`,
                }
              : patch.check_out_time
                ? {
                    type: "attendance_checked_out",
                    message: `${employeeName} checked out at ${time(patch.check_out_time)}.`,
                  }
                : null;
        if (notification) {
          await notifyManagers({
            businessId: profile.business_id,
            ...notification,
            relatedId: savedAttendance?.id ?? today?.id,
          }).catch((notifyError) => console.error(notifyError));
        }
      }
      load();
    }
  };
  const checkOut = async () => {
    if (!today?.check_in_time) return;
    const out = new Date();
    let hours = (out.getTime() - new Date(today.check_in_time).getTime()) / 3600000;
    if (today.break_start && today.break_end)
      hours -=
        (new Date(today.break_end).getTime() - new Date(today.break_start).getTime()) / 3600000;
    await updateAttendance({
      check_out_time: out.toISOString(),
      total_hours: Math.max(hours, 0),
      status: "completed",
    });
  };
  const displayName = employee?.name || profile.name || profile.email || "there";
  const firstName = displayName.split(" ")[0] || displayName;
  const todayLabel = new Date().toLocaleDateString("en-AU", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--navy)]">
          Welcome back, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{todayLabel}</p>
      </section>

      <section className="rounded-lg bg-[var(--navy)] p-5 text-white shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-white/70">
          Your Next Shift
        </div>
        {nextShift ? (
          <div className="mt-3">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-[var(--navy)]">
              {badge(nextShift.day)}
            </span>
            <div className="mt-3 text-2xl font-bold">
              {range(nextShift.start_time, nextShift.end_time)}
            </div>
            <div className="mt-1 text-sm text-white/80">
              {nextShift.rosters?.location || "Main location"}
              {employee?.role ? ` - ${employee.role}` : ""}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-white/80">No upcoming shifts. Contact your manager.</p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {!today?.check_in_time && (
            <button
              disabled={saving}
              onClick={() =>
                updateAttendance({ check_in_time: new Date().toISOString(), status: "checked_in" })
              }
              className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[var(--navy)] disabled:opacity-60"
            >
              <LogIn className="mr-2 inline size-4" /> Check In
            </button>
          )}
          {today?.check_in_time && !today?.check_out_time && (
            <>
              <button
                disabled={saving}
                onClick={checkOut}
                className="rounded-md bg-white px-4 py-2.5 text-sm font-semibold text-[var(--navy)] disabled:opacity-60"
              >
                <LogOut className="mr-2 inline size-4" /> Check Out
              </button>
              {!today.break_start || today.break_end ? (
                <button
                  disabled={saving || !!today.break_end}
                  onClick={() => updateAttendance({ break_start: new Date().toISOString() })}
                  className="rounded-md border border-white/40 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Coffee className="mr-2 inline size-4" /> Start Break
                </button>
              ) : (
                <button
                  disabled={saving}
                  onClick={() => updateAttendance({ break_end: new Date().toISOString() })}
                  className="rounded-md border border-white/40 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Coffee className="mr-2 inline size-4" /> End Break
                </button>
              )}
            </>
          )}
          {today?.check_in_time && (
            <span className="self-center text-sm text-white/75">
              Checked in at {time(today.check_in_time)}
              {today.check_out_time ? ` - Out ${time(today.check_out_time)}` : ""}
            </span>
          )}
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-3">
        {["Annual Leave", "Sick Leave", "Casual Leave"].map((type) => (
          <Balance
            key={type}
            type={type}
            row={balances.find((b) => lower(b.leave_type).includes(lower(type.split(" ")[0])))}
          />
        ))}
      </div>
      <section className="rounded-lg border bg-card p-4 shadow-sm">
        <h2 className="font-bold text-[var(--navy)]">My This Week</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {days(weekStart, weekEnd).map((d) => (
            <DayCell
              key={key(d)}
              day={d}
              shifts={weekShifts}
              leaves={weekLeaves}
              holidays={holidays}
            />
          ))}
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <Action solid to="/apply-leave">
          Apply Leave
        </Action>
        <Action to="/swaps">Request Shift Swap</Action>
        <Action to="/my-roster">View Full Roster</Action>
        <Action to="/attendance">My Attendance</Action>
      </div>
      {notes.length > 0 && (
        <section className="grid gap-2">
          {notes.map((n) => (
            <div key={n.id} className="rounded-lg border bg-card p-3 text-sm shadow-sm">
              <FileText className="mr-2 inline size-4 text-[var(--navy)]" />
              {n.message}
              <span className="ml-2 text-xs text-muted-foreground">{ago(n.created_at)}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function TodayPanel({
  loading,
  attendance,
  leaves,
  clockedIn,
}: {
  loading: boolean;
  attendance: any[];
  leaves: any[];
  clockedIn: number;
}) {
  return (
    <aside className="border-b bg-white p-4 lg:sticky lg:top-14 lg:h-[calc(100vh-7rem)] lg:border-b-0 lg:border-r">
      <div className="text-xl font-bold text-[var(--navy)]">
        {new Date()
          .toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "2-digit" })
          .replace(",", ".")}
      </div>
      <section className="mt-4">
        <h2 className="font-bold text-[var(--navy)] underline underline-offset-4">
          Clock Time Feed
        </h2>
        <p className="text-sm font-semibold text-[var(--navy)]">(Clocked In: {clockedIn})</p>
        <div className="mt-3 max-h-56 space-y-2 overflow-auto text-sm">
          {loading ? (
            <Skeleton rows={5} />
          ) : attendance.length === 0 ? (
            <p className="text-muted-foreground">No staff clocked in yet today.</p>
          ) : (
            attendance.slice(0, 8).map((a) => (
              <div key={a.id} className="flex justify-between gap-3">
                <span className="truncate font-medium">{a.employees?.name ?? "Staff member"}</span>
                <span className={a.check_out_time ? "text-red-600" : "text-emerald-700"}>
                  {a.check_out_time
                    ? "Out " + time(a.check_out_time)
                    : "In " + time(a.check_in_time)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
      {leaves.length > 0 && (
        <section className="mt-8">
          <h2 className="font-bold text-[var(--navy)] underline underline-offset-4">
            Staff On Leave
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {leaves.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{l.employees?.name ?? "Staff member"}</span>
                <span className={leaveClass(l.leave_type)}>{l.leave_type}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
function Stat({ icon: Icon, label, value, sub, to, badge }: any) {
  return (
    <Link
      to={to}
      className="relative rounded-lg border bg-card p-4 shadow-sm hover:border-[var(--navy)]"
    >
      {badge && <span className="absolute right-3 top-3 size-2 rounded-full bg-[var(--navy)]" />}
      <Icon className="size-5 text-[var(--navy)]" />
      <div className="mt-3 text-3xl font-bold text-[var(--navy)]">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </Link>
  );
}
function Action({
  to,
  children,
  solid = false,
}: {
  to: string;
  children: React.ReactNode;
  solid?: boolean;
}) {
  return (
    <Link
      to={to as any}
      className={`rounded-md border border-[var(--navy)] px-4 py-3 text-center text-sm font-semibold ${solid ? "bg-[var(--navy)] text-white" : "bg-card text-[var(--navy)] hover:bg-secondary"}`}
    >
      {children}
    </Link>
  );
}
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="mb-2 text-center text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
function Balance({ type, row }: { type: string; row?: any }) {
  const total = Number(row?.total_days ?? defaultLeaveTotal(type)),
    used = Number(row?.used_days ?? 0),
    remain = Math.max(total - used, 0),
    pct = total ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {type}
      </div>
      <div className="mt-1 flex items-baseline gap-2 text-[var(--navy)]">
        <span className="text-3xl font-bold">{remain}</span>
        <span className="text-sm font-medium">days</span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-secondary">
        <div className="h-2 rounded-full bg-[var(--navy)]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {used} used of {total} total
      </p>
    </div>
  );
}
function DayCell({ day, shifts, leaves, holidays }: any) {
  const k = key(day),
    s = shifts.find((x: any) => x.day === k),
    l = leaves.find((x: any) => x.from_date <= k && x.to_date >= k),
    h = holidays.find((x: any) => x.holiday_date === k);
  return (
    <div
      className={`min-h-[62px] rounded-md border p-2 text-center text-xs ${
        k === key(new Date()) ? "border-[var(--navy)] bg-[#EEF3F8]" : "bg-white"
      }`}
    >
      <div className="font-bold text-[var(--navy)]">
        {day.toLocaleDateString("en-AU", { weekday: "short" })}
      </div>
      <div className="text-xs text-muted-foreground">{day.getDate()}</div>
      <div className="mt-1 font-medium text-[var(--navy)]">
        {l ? "LEAVE" : h ? "PH" : s ? range(s.start_time, s.end_time) : "Off"}
      </div>
    </div>
  );
}
function EmptyRoster() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border bg-secondary/40 text-center">
      <p className="text-sm text-muted-foreground">
        No roster created for this week. Create a roster to see data here.
      </p>
      <Link
        to="/roster"
        className="mt-3 rounded-md bg-[var(--navy)] px-4 py-2 text-sm font-semibold text-white"
      >
        Create Roster
      </Link>
    </div>
  );
}
function Skeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-secondary" />
      ))}
    </div>
  );
}
function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function days(start: Date, end: Date) {
  const out: Date[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}
function key(date: Date) {
  return date.toISOString().slice(0, 10);
}
function time(v?: string | null) {
  if (!v) return "--";
  return new Date(v)
    .toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })
    .toLowerCase();
}
function clock(v?: string | null) {
  if (!v) return "--";
  const [h, m] = v.split(":");
  const d = new Date();
  d.setHours(Number(h), Number(m ?? 0), 0, 0);
  return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}
function range(a?: string | null, b?: string | null) {
  return `${clock(a)} - ${clock(b)}`;
}
function lower(v?: string | null) {
  return String(v ?? "").toLowerCase();
}
function defaultLeaveTotal(type: string) {
  const value = lower(type);
  if (value.includes("annual")) return 20;
  if (value.includes("sick")) return 10;
  if (value.includes("casual")) return 5;
  return 0;
}
function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
function mins(v?: string | null) {
  if (!v) return 0;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + (m || 0);
}
function overlap(a: string | null, b: string | null, s: string, e: string) {
  return mins(a) < mins(e) && mins(b) > mins(s);
}
function toggle(v: string, current: string[], set: (x: string[]) => void, all: string[]) {
  const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
  set(next.length ? next : all);
}
function fmtTotal(v: number, mode: Mode) {
  if (mode === "cost")
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(v);
  if (mode === "hours") return `${v.toFixed(1)}h`;
  return String(Math.round(v));
}
function leaveClass(t: string) {
  const k = lower(t);
  if (k.includes("personal"))
    return "rounded-full bg-[var(--navy)] px-2 py-0.5 text-[10px] font-bold uppercase text-white";
  if (k.includes("annual"))
    return "rounded-full bg-[#4A6080] px-2 py-0.5 text-[10px] font-bold uppercase text-white";
  if (k.includes("sick"))
    return "rounded-full bg-[#B0C4D8] px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--navy)]";
  return "rounded-full border border-[var(--navy)] bg-white px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--navy)]";
}
function badge(day: string) {
  if (day === key(new Date())) return "TODAY";
  if (day === key(addDays(new Date(), 1))) return "TOMORROW";
  return new Date(day + "T00:00:00").toLocaleDateString("en-AU", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}
function ago(v: string) {
  const m = Math.max(Math.round((Date.now() - new Date(v).getTime()) / 60000), 0);
  return m < 1 ? "now" : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}
