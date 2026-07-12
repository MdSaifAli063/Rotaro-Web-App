import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import {
  ArrowDownUp,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Mail,
  Filter,
  LogIn,
  LogOut,
  TimerReset,
  Trash2,
  Users2,
  Clock3,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlanGate } from "@/components/PlanGate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { findEmployeeForUser } from "@/lib/employee";
import { notifyManagers } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

type AttendanceRow = {
  id: string;
  user_id: string;
  employee_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  break_start: string | null;
  break_end: string | null;
  status: string | null;
  total_hours: number | null;
  employees?: {
    name: string;
    employee_code: string | null;
    department: string | null;
  } | null;
};

type EmployeeRow = {
  id: string;
  name: string;
  employee_code: string | null;
  department: string | null;
  user_id: string | null;
};

type RosterShiftRow = {
  id: string;
  roster_id: string;
  employee_id: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  employees?: {
    name: string;
    employee_code: string | null;
    department: string | null;
  } | null;
};

type AttendanceStats = {
  todayRostered: number;
  todayCheckedIn: number;
  activeEmployees: number;
  totalLogHours: number;
  onTime: number;
  late: number;
  notAttended: number;
  employeeAttendanceRate: number;
  workingHourRate: number;
};

type EmployeeAttendanceState = {
  profile: Profile | null;
  employeeId: string | null;
  employeeName: string;
  today: AttendanceRow | null;
  history: AttendanceRow[];
};

const weekRange = () => {
  const now = new Date();
  return {
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  };
};
const todayKey = () => new Date().toISOString().slice(0, 10);
const timeLabel = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const statusLabel = (value?: string | null) =>
  (value || "pending").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const breakMinutes = (row: AttendanceRow) =>
  row.break_start && row.break_end
    ? Math.max(
        Math.round(
          (new Date(row.break_end).getTime() - new Date(row.break_start).getTime()) / 60000,
        ),
        0,
      )
    : 0;
const workedHours = (
  row: AttendanceRow,
  out = row.check_out_time ? new Date(row.check_out_time) : new Date(),
) => {
  if (!row.check_in_time) return 0;
  const minutes =
    (out.getTime() - new Date(row.check_in_time).getTime()) / 60000 - breakMinutes(row);
  return Math.max(minutes / 60, 0);
};
const weekdayShort = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function AttendancePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [managerRows, setManagerRows] = useState<AttendanceRow[]>([]);
  const [rosterRows, setRosterRows] = useState<RosterShiftRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [managerLoading, setManagerLoading] = useState(true);
  const [employeeState, setEmployeeState] = useState<EmployeeAttendanceState>({
    profile: null,
    employeeId: null,
    employeeName: "",
    today: null,
    history: [],
  });
  const [deptFilter, setDeptFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeTab, setActiveTab] = useState("overview");
  const [mismatchesOnly, setMismatchesOnly] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const nextProfile = await fetchProfile();
      if (!active) return;
      setProfile(nextProfile);
      if (!nextProfile) return;
      if (isManager(nextProfile)) {
        await loadManager(nextProfile);
      } else {
        await loadEmployee(nextProfile);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profile?.business_id) return;
    const manager = isManager(profile);
    if (!manager && !employeeState.employeeId) return;
    const filter = manager
      ? `business_id=eq.${profile.business_id}`
      : employeeState.employeeId
        ? `employee_id=eq.${employeeState.employeeId}`
        : undefined;
    const channel = supabase
      .channel(`attendance-${profile.business_id}-${employeeState.employeeId ?? profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "attendance_records",
          ...(filter ? { filter } : {}),
        },
        () => {
          if (manager) {
            void loadManager(profile);
          } else {
            void loadEmployee(profile);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeState.employeeId, profile]);

  const loadManager = async (p: Profile) => {
    if (!p.business_id) {
      setManagerLoading(false);
      return;
    }
    setManagerLoading(true);
    const { start, end } = weekRange();
    const [attendanceResult, employeesResult] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("*")
        .eq("business_id", p.business_id)
        .gte("date", format(start, "yyyy-MM-dd"))
        .lte("date", format(end, "yyyy-MM-dd"))
        .order("date", { ascending: false })
        .order("check_in_time", { ascending: false }),
      supabase
        .from("employees")
        .select("id, name, employee_code, department, user_id")
        .eq("business_id", p.business_id)
        .order("name"),
    ]);

    if (attendanceResult.error) toast.error(attendanceResult.error.message);
    if (employeesResult.error) toast.error(employeesResult.error.message);

    const employeeRows = (employeesResult.data ?? []) as EmployeeRow[];
    const employeeById = new Map(employeeRows.map((employee) => [employee.id, employee]));
    const attachEmployee = <T extends { employee_id: string }>(row: T) => {
      const employee = employeeById.get(row.employee_id);
      return {
        ...row,
        employees: employee
          ? {
              name: employee.name,
              employee_code: employee.employee_code,
              department: employee.department,
            }
          : null,
      };
    };

    setManagerRows(((attendanceResult.data ?? []) as AttendanceRow[]).map(attachEmployee));
    setEmployees(employeeRows);

    const weekDays = Array.from({ length: 7 }, (_, index) =>
      format(addDays(start, index), "yyyy-MM-dd"),
    );
    const { data: rosterWeeks, error: rosterWeeksError } = await supabase
      .from("rosters")
      .select("id")
      .eq("business_id", p.business_id)
      .lte("week_start", format(end, "yyyy-MM-dd"))
      .gte("week_end", format(start, "yyyy-MM-dd"));
    if (rosterWeeksError) toast.error(rosterWeeksError.message);

    const rosterIds = (rosterWeeks ?? []).map((roster) => roster.id);
    if (rosterIds.length === 0) {
      setRosterRows([]);
      setManagerLoading(false);
      return;
    }

    const { data: rosterData, error: rosterError } = await supabase
      .from("roster_shifts")
      .select("id, roster_id, employee_id, day, start_time, end_time, break_minutes")
      .in("roster_id", rosterIds)
      .in("day", weekDays)
      .order("day", { ascending: true });
    if (rosterError) toast.error(rosterError.message);
    setRosterRows(((rosterData ?? []) as RosterShiftRow[]).map(attachEmployee));
    setManagerLoading(false);
  };

  const loadEmployee = async (p: Profile) => {
    const { employee: emp, error: empError } = await findEmployeeForUser<{
      id: string;
      name: string;
    }>(p.id, "id, name");
    if (empError) toast.error(empError.message);
    const employeeId = emp?.id ?? null;
    const employeeName = emp?.name ?? p.name ?? "Employee";

    if (!employeeId) {
      setEmployeeState({
        profile: p,
        employeeId: null,
        employeeName,
        today: null,
        history: [],
      });
      return;
    }

    const { data, error } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", employeeId)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) toast.error(error.message);

    const rows = (data ?? []) as AttendanceRow[];
    const today = rows.find((row) => row.date === todayKey()) ?? null;
    setEmployeeState({
      profile: p,
      employeeId,
      employeeName,
      today,
      history: rows,
    });
  };

  const activeEmployees = employees.filter((emp) => emp.user_id || emp.name).length;
  const weekAttendance = managerRows;
  const todayDateKey = todayKey();
  const todayAttendance = weekAttendance.filter((row) => row.date === todayDateKey);
  const todayRoster = rosterRows.filter((row) => row.day === todayDateKey);
  const todayCheckedIn = todayAttendance.filter((row) => !!row.check_in_time).length;
  const totalLogHours = weekAttendance.reduce(
    (sum, row) => sum + (row.total_hours ?? workedHours(row)),
    0,
  );
  const onTime = todayAttendance.filter((row) => isOnTime(row, todayRoster)).length;
  const late = Math.max(todayCheckedIn - onTime, 0);
  const notAttended = Math.max(todayRoster.length - todayCheckedIn, 0);
  const percentBase = Math.max(todayRoster.length || activeEmployees, 1);
  const onTimeRate = Math.round((onTime / percentBase) * 100);
  const lateRate = Math.round((late / percentBase) * 100);
  const notAttendedRate = todayRoster.length ? Math.round((notAttended / percentBase) * 100) : 0;
  const workingHourRate = todayRoster.length
    ? Math.round(
        (todayAttendance.filter(
          (row) => (row.total_hours ?? workedHours(row)) >= scheduledHoursFor(row, todayRoster),
        ).length /
          Math.max(todayRoster.length, 1)) *
          100,
      )
    : 0;

  const stats: AttendanceStats = {
    todayRostered: todayRoster.length,
    todayCheckedIn,
    activeEmployees,
    totalLogHours: Math.round(totalLogHours * 100) / 100,
    onTime,
    late,
    notAttended,
    employeeAttendanceRate: todayRoster.length
      ? Math.round((todayCheckedIn / todayRoster.length) * 100)
      : 0,
    workingHourRate,
  };

  const departments = useMemo(() => {
    const list = employees.map((emp) => emp.department ?? "Unassigned");
    return ["all", ...Array.from(new Set(list))];
  }, [employees]);

  const visibleRows = useMemo(() => {
    const filtered = managerRows.filter((row) => {
      if (deptFilter === "all") return true;
      return (row.employees?.department ?? "Unassigned") === deptFilter;
    });

    filtered.sort((a, b) => {
      if (sortBy === "hours") {
        return (b.total_hours ?? workedHours(b)) - (a.total_hours ?? workedHours(a));
      }
      return b.date.localeCompare(a.date);
    });

    return filtered;
  }, [managerRows, deptFilter, sortBy]);

  const pageRows = visibleRows.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(Math.ceil(visibleRows.length / pageSize), 1);
  const weekBars = weekAttendanceBars(managerRows, rosterRows);
  const comparisonDays = useMemo(() => buildComparisonDays(), []);
  const comparisonRows = useMemo(
    () => buildComparisonRows(employees, rosterRows, managerRows, comparisonDays),
    [employees, rosterRows, managerRows, comparisonDays],
  );
  const mismatchCount = comparisonRows.filter((row) => row.hasMismatch).length;
  const sendRosterSummary = async () => {
    if (!profile?.business_id) return;
    try {
      await notifyManagers({
        businessId: profile.business_id,
        type: "roster_summary",
        message: `Roster comparison summary: ${mismatchCount} mismatches across ${comparisonRows.length} employees this week.`,
      });
      toast.success("Roster summary sent.");
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to send roster summary.");
    }
  };

  const deleteAttendance = async (row: AttendanceRow) => {
    const { error } = await supabase.from("attendance_records").delete().eq("id", row.id);
    if (error) {
      toast.error("Unable to delete attendance: " + error.message);
      return;
    }
    toast.success("Attendance record deleted");
    if (profile) {
      if (isManager(profile)) {
        await loadManager(profile);
      } else {
        await loadEmployee(profile);
      }
    }
  };

  if (!profile) return null;

  if (!isManager(profile)) {
    return (
      <PlanGate
        businessId={profile.business_id}
        required="professional"
        title="Attendance is a Professional feature"
        description="Employee check-in/out, break tracking, attendance dashboards, and roster comparison are included with Professional and Business plans."
      >
        <EmployeeView
          employeeName={employeeState.employeeName}
          today={employeeState.today}
          history={employeeState.history}
          onCheckIn={async () => {
            if (!employeeState.employeeId || !profile.business_id) return;
            const todayStr = todayKey();
            const { data: existing } = await supabase
              .from("attendance_records")
              .select("*")
              .eq("employee_id", employeeState.employeeId)
              .eq("date", todayStr)
              .is("check_out_time", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (existing?.check_in_time) {
              toast.info("You are already checked in");
              setEmployeeState((prev) => ({ ...prev, today: existing as AttendanceRow }));
              return;
            }

            const checkedInAt = new Date();
            const { data: inserted, error } = await supabase
              .from("attendance_records")
              .insert({
                business_id: profile.business_id,
                employee_id: employeeState.employeeId,
                user_id: profile.id,
                date: todayStr,
                check_in_time: checkedInAt.toISOString(),
                status: "checked_in",
              })
              .select("id")
              .single();
            if (error) {
              toast.error(error.message);
              return;
            }

            await notifyManagers({
              businessId: profile.business_id,
              type: "attendance_checked_in",
              message: `${employeeState.employeeName} checked in at ${timeLabel(checkedInAt.toISOString())}.`,
              relatedId: inserted.id,
            }).catch((notifyError) => console.error(notifyError));
            toast.success("Checked in");
            await loadEmployee(profile);
          }}
          onCheckOut={async () => {
            if (!employeeState.today?.check_in_time || !employeeState.employeeId) return;
            const out = new Date();
            const patch = {
              check_out_time: out.toISOString(),
              total_hours: workedHours(employeeState.today, out),
              status: "completed",
              user_id: profile.id,
            };
            const { error } = await supabase
              .from("attendance_records")
              .update(patch)
              .eq("id", employeeState.today.id);
            if (error) {
              toast.error(error.message);
              return;
            }
            if (profile.business_id) {
              await notifyManagers({
                businessId: profile.business_id,
                type: "attendance_checked_out",
                message: `${employeeState.employeeName} checked out at ${timeLabel(out.toISOString())}.`,
                relatedId: employeeState.today.id,
              }).catch((notifyError) => console.error(notifyError));
            }
            toast.success("Checked out");
            await loadEmployee(profile);
          }}
          onStartBreak={async () => {
            if (!employeeState.today?.id) return;
            const started = new Date();
            const { error } = await supabase
              .from("attendance_records")
              .update({ break_start: started.toISOString(), user_id: profile.id })
              .eq("id", employeeState.today.id);
            if (error) {
              toast.error(error.message);
              return;
            }
            if (profile.business_id) {
              await notifyManagers({
                businessId: profile.business_id,
                type: "attendance_break_started",
                message: `${employeeState.employeeName} started a break at ${timeLabel(started.toISOString())}.`,
                relatedId: employeeState.today.id,
              }).catch((notifyError) => console.error(notifyError));
            }
            await loadEmployee(profile);
          }}
          onEndBreak={async () => {
            if (!employeeState.today?.id) return;
            const ended = new Date();
            const { error } = await supabase
              .from("attendance_records")
              .update({ break_end: ended.toISOString(), user_id: profile.id })
              .eq("id", employeeState.today.id);
            if (error) {
              toast.error(error.message);
              return;
            }
            if (profile.business_id) {
              await notifyManagers({
                businessId: profile.business_id,
                type: "attendance_break_ended",
                message: `${employeeState.employeeName} ended a break at ${timeLabel(ended.toISOString())}.`,
                relatedId: employeeState.today.id,
              }).catch((notifyError) => console.error(notifyError));
            }
            await loadEmployee(profile);
          }}
          onDelete={deleteAttendance}
        />
      </PlanGate>
    );
  }

  return (
    <PlanGate
      businessId={profile.business_id}
      required="professional"
      title="Attendance is a Professional feature"
      description="Employee check-in/out, break tracking, attendance dashboards, and roster comparison are included with Professional and Business plans."
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Attendance</h1>
          <p className="text-sm text-muted-foreground">
            Track employee attendance and manage daily records.
          </p>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="h-auto rounded-2xl bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="rounded-xl border px-4 py-2 data-[state=active]:border-[var(--navy)] data-[state=active]:bg-white data-[state=active]:text-[var(--navy)]"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="roster"
              className="rounded-xl border px-4 py-2 data-[state=active]:border-[var(--navy)] data-[state=active]:bg-white data-[state=active]:text-[var(--navy)]"
            >
              Roster comparison
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,0.7fr)]">
              <StatCard
                icon={CalendarDays}
                title="Today's Attendance"
                subtitle={
                  todayRoster.length
                    ? `${todayRoster.length} rostered shifts today`
                    : "No rostered shifts today"
                }
                value={`${stats.employeeAttendanceRate}%`}
                footer={[
                  { label: "On-Time", value: `${onTimeRate}%`, color: "bg-blue-500" },
                  { label: "Late", value: `${lateRate}%`, color: "bg-amber-500" },
                  {
                    label: "Not attended",
                    value: `${notAttendedRate}%`,
                    color: "bg-slate-300",
                  },
                ]}
                chart={weekBars.map((item) => ({
                  label: item.day,
                  value: item.rate,
                  filled: item.filled,
                }))}
              />
              <MetricCard
                icon={Users2}
                title="Employee Attendance"
                value={`${stats.todayCheckedIn}/${stats.todayRostered || stats.activeEmployees}`}
                subtitle={`${stats.activeEmployees} active employees`}
                footer="Last week +0%"
              />
              <MetricCard
                icon={Clock3}
                title="Total Log Hours"
                value={formatHours(stats.totalLogHours)}
                subtitle={`${weekAttendance.length} attendance records this week`}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.42fr)_minmax(0,0.58fr)]">
              <PerformanceCard value={stats.workingHourRate} hours={stats.totalLogHours} />
              <div className="grid gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:grid-cols-3 md:p-6">
                <MiniStat label="Rostered today" value={String(stats.todayRostered)} />
                <MiniStat label="Checked in today" value={String(stats.todayCheckedIn)} />
                <MiniStat label="Missing today" value={String(stats.notAttended)} />
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-[var(--navy)]">Attendance List</h2>
                  <p className="text-sm text-muted-foreground">
                    {format(startOfWeek(new Date(), { weekStartsOn: 1 }), "MMMM d")} -{" "}
                    {format(endOfWeek(new Date(), { weekStartsOn: 1 }), "MMMM d, yyyy")}
                  </p>
                </div>
                <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-auto xl:flex xl:flex-wrap xl:items-center xl:justify-end">
                  <Select
                    value={deptFilter}
                    onValueChange={(value) => {
                      setDeptFilter(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full xl:w-[140px]">
                      <SelectValue placeholder="All departments" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept} value={dept}>
                          {dept === "all" ? "All departments" : dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={sortBy}
                    onValueChange={(value) => {
                      setSortBy(value);
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-full xl:w-[140px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">Sort by date</SelectItem>
                      <SelectItem value="hours">Sort by hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="w-full gap-2 xl:w-auto"
                    onClick={() => {
                      setDeptFilter("all");
                      setSortBy("date");
                      setPage(1);
                    }}
                  >
                    <Filter className="size-4" />
                    Reset
                  </Button>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto rounded-2xl border">
                <table className="min-w-[840px] w-full table-fixed text-[13px]">
                  <thead className="bg-secondary text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-3">
                        <input type="checkbox" className="size-4 rounded border-border" />
                      </th>
                      <th className="w-[96px] whitespace-nowrap px-3 py-3">Employee ID</th>
                      <th className="w-[140px] whitespace-nowrap px-3 py-3">Name</th>
                      <th className="w-[120px] whitespace-nowrap px-3 py-3">Department</th>
                      <th className="w-[96px] whitespace-nowrap px-3 py-3">Check-in</th>
                      <th className="w-[96px] whitespace-nowrap px-3 py-3">Check-out</th>
                      <th className="w-[88px] whitespace-nowrap px-3 py-3">Hours</th>
                      <th className="w-[88px] whitespace-nowrap px-3 py-3">Status</th>
                      <th className="w-[104px] whitespace-nowrap px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {managerLoading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                          Loading attendance...
                        </td>
                      </tr>
                    ) : pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                          No attendance records in this range.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-3">
                            <input type="checkbox" className="size-4 rounded border-border" />
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                            {row.employees?.employee_code ??
                              row.employee_id.slice(0, 6).toUpperCase()}
                          </td>
                          <td className="px-3 py-3 truncate font-medium text-[var(--navy)]">
                            {row.employees?.name ?? "-"}
                          </td>
                          <td className="px-3 py-3 truncate">{row.employees?.department ?? "-"}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {timeLabel(row.check_in_time)}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {timeLabel(row.check_out_time)}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {formatHours(row.total_hours ?? workedHours(row))}
                          </td>
                          <td className="px-3 py-3">
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700"
                            >
                              {statusLabel(row.status)}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => deleteAttendance(row)}
                            >
                              <Trash2 className="mr-1 size-4" />
                              Delete
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <div>Total Attendance: {visibleRows.length}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <Badge variant="outline" className="rounded-md px-3 py-1">
                    {page}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span>Show per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="roster" className="space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={mismatchesOnly ? "outline" : "default"}
                  className={
                    mismatchesOnly
                      ? "border-[var(--navy)] bg-white text-[var(--navy)] hover:bg-secondary"
                      : "bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
                  }
                  onClick={() => setMismatchesOnly((v) => !v)}
                >
                  Mismatches only
                </Button>
                <Button
                  variant="outline"
                  className="border-border bg-white text-[var(--navy)] hover:bg-secondary"
                  onClick={sendRosterSummary}
                >
                  <Mail className="mr-2 size-4" />
                  Email HR
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <KpiCard accent="purple" value={mismatchCount} label="Mismatches in range" />
                <KpiCard accent="navy" value={comparisonRows.length} label="Employees tracked" />
                <KpiCard accent="blue" value={comparisonDays.length} label="Days in view" />
              </div>

              <div className="rounded-2xl border bg-card p-4 shadow-sm">
                <div className="overflow-auto rounded-2xl border">
                  <table className="w-full min-w-[1100px] text-sm">
                    <thead>
                      <tr className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="sticky left-0 z-20 bg-secondary px-4 py-4">Emp Code</th>
                        <th className="sticky left-[110px] z-20 bg-secondary px-4 py-4">
                          Emp Name
                        </th>
                        {comparisonDays.map((day) => (
                          <th
                            key={day.key}
                            className={`px-4 py-4 text-center ${day.isToday ? "bg-blue-50 text-[var(--navy)]" : ""} ${
                              day.isWeekend ? "bg-slate-200" : ""
                            }`}
                          >
                            <div className="text-xs font-semibold uppercase tracking-widest">
                              {day.day}
                            </div>
                            <div
                              className={`text-lg font-bold ${day.isToday ? "text-blue-600" : "text-[var(--navy)]"}`}
                            >
                              {day.label}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(mismatchesOnly
                        ? comparisonRows.filter((row) => row.hasMismatch)
                        : comparisonRows
                      ).map((row) => (
                        <tr key={row.employeeId} className="border-t">
                          <td className="sticky left-0 z-10 bg-card px-4 py-4 font-mono text-sm text-muted-foreground">
                            {row.employeeCode}
                          </td>
                          <td className="sticky left-[110px] z-10 bg-card px-4 py-4 font-medium text-[var(--navy)]">
                            {row.employeeName}
                          </td>
                          {row.cells.map((cell) => (
                            <td key={`${row.employeeId}-${cell.key}`} className="px-3 py-3">
                              <div
                                className={`rounded-xl border px-3 py-3 text-center text-xs font-semibold ${
                                  cell.kind === "working"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : cell.kind === "mismatch"
                                      ? "border-violet-200 bg-violet-50 text-violet-700"
                                      : cell.kind === "scheduled"
                                        ? "border-blue-100 bg-blue-50 text-[var(--navy)]"
                                        : cell.kind === "leave"
                                          ? "border-purple-200 bg-purple-50 text-purple-700"
                                          : "border-border bg-secondary text-muted-foreground"
                                }`}
                              >
                                {cell.label}
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <Legend label="Working" color="bg-emerald-500" />
                  <Legend label="Weekly off" color="bg-amber-400" />
                  <Legend label="Public holiday" color="bg-rose-400" />
                  <Legend label="Approved leave" color="bg-purple-400" />
                  <Legend label="Mismatch" color="bg-violet-500" />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PlanGate>
  );
}

function EmployeeView({
  employeeName,
  today,
  history,
  onCheckIn,
  onCheckOut,
  onStartBreak,
  onEndBreak,
  onDelete,
}: {
  employeeName: string;
  today: AttendanceRow | null;
  history: AttendanceRow[];
  onCheckIn: () => Promise<void>;
  onCheckOut: () => Promise<void>;
  onStartBreak: () => Promise<void>;
  onEndBreak: () => Promise<void>;
  onDelete: (row: AttendanceRow) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">My Attendance</h1>
        <p className="text-sm text-muted-foreground">Track check-in, breaks, and check-out.</p>
      </header>

      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Today
            </div>
            <div className="mt-1 text-xl font-bold text-[var(--navy)]">
              {format(new Date(), "EEE dd MMM yyyy")}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {today?.check_in_time ? `In ${timeLabel(today.check_in_time)}` : "No check-in yet"}
              {today?.check_out_time ? ` - Out ${timeLabel(today.check_out_time)}` : ""}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!today?.check_in_time && (
              <Button onClick={onCheckIn} className="bg-[var(--navy)] hover:bg-[var(--navy-light)]">
                <LogIn className="mr-2 size-4" />
                Check in
              </Button>
            )}
            {today?.check_in_time && !today?.break_start && !today?.check_out_time && (
              <Button variant="outline" onClick={onStartBreak}>
                <Coffee className="mr-2 size-4" />
                Start break
              </Button>
            )}
            {today?.break_start && !today?.break_end && (
              <Button variant="outline" onClick={onEndBreak}>
                <Coffee className="mr-2 size-4" />
                End break
              </Button>
            )}
            {today?.check_in_time && !today?.check_out_time && (
              <Button onClick={onCheckOut}>
                <LogOut className="mr-2 size-4" />
                Check out
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="border-b px-6 py-5">
            <h2 className="text-xl font-semibold text-[var(--navy)]">{employeeName}</h2>
            <p className="text-sm text-muted-foreground">Recent attendance history.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Check In</th>
                  <th className="px-4 py-3">Check Out</th>
                  <th className="px-4 py-3">Break</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No history yet.
                    </td>
                  </tr>
                ) : (
                  history.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-4 py-3">{row.date}</td>
                      <td className="px-4 py-3">{timeLabel(row.check_in_time)}</td>
                      <td className="px-4 py-3">{timeLabel(row.check_out_time)}</td>
                      <td className="px-4 py-3">
                        {row.break_start && row.break_end ? `${breakMinutes(row)}m` : "—"}
                      </td>
                      <td className="px-4 py-3">{statusLabel(row.status)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => onDelete(row)}
                        >
                          <Trash2 className="mr-1 size-4" />
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--navy)]">
            <TimerReset className="size-4" />
            <h2 className="text-xl font-semibold">Today summary</h2>
          </div>
          <div className="mt-6 space-y-4">
            <MiniStat label="Checked in" value={today?.check_in_time ? "Yes" : "No"} />
            <MiniStat label="Checked out" value={today?.check_out_time ? "Yes" : "No"} />
            <MiniStat
              label="Worked hours"
              value={formatHours(today ? (today.total_hours ?? workedHours(today)) : 0)}
            />
            <MiniStat
              label="Break"
              value={today?.break_start && today?.break_end ? `${breakMinutes(today)}m` : "0m"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  title,
  subtitle,
  value,
  footer,
  chart,
}: {
  icon: typeof CalendarDays;
  title: string;
  subtitle: string;
  value: string;
  footer: Array<{ label: string; value: string; color: string }>;
  chart: Array<{ label: string; value: number; filled: boolean }>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-[#EEF3FF] p-3 text-[var(--navy)]">
            <Icon className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--navy)]">{title}</h2>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">+0%</Badge>
      </div>
      <div className="mt-6 text-3xl font-bold leading-none text-[var(--navy)] sm:text-5xl">
        {value}
      </div>
      <div className="mt-6 grid grid-cols-7 gap-1.5 sm:gap-3">
        {chart.map((bar) => (
          <div key={bar.label} className="flex flex-col items-center gap-2">
            <div className="flex h-28 w-full items-end justify-center overflow-hidden rounded-xl border bg-[#F8FAFD] px-1 sm:h-36 sm:rounded-2xl sm:px-2">
              <div
                className={`w-full rounded-t-xl transition-[height] duration-300 ${
                  bar.filled ? "bg-[var(--navy)]" : "bg-slate-100"
                }`}
                style={{
                  height: `${bar.filled ? Math.min(Math.max(bar.value, 8), 100) : 8}%`,
                }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">{bar.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 border-t pt-4 text-sm sm:grid-cols-3">
        {footer.map((item) => (
          <div key={item.label}>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className={`size-2 rounded-full ${item.color}`} />
              {item.label}
            </div>
            <div className="mt-1 text-lg font-semibold text-[var(--navy)]">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  title,
  value,
  subtitle,
  footer,
}: {
  icon: typeof Users2;
  title: string;
  value: string;
  subtitle: string;
  footer?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between">
        <div className="text-sm font-medium text-muted-foreground">{title}</div>
        <div className="rounded-xl bg-[#EEF3FF] p-2 text-[var(--navy)]">
          <Icon className="size-5" />
        </div>
      </div>
      <div className="mt-10 text-3xl font-bold text-[var(--navy)] sm:mt-16 sm:text-5xl">
        {value}
      </div>
      <div className="mt-3 text-sm text-muted-foreground">{subtitle}</div>
      {footer && <div className="mt-14 text-sm font-semibold text-emerald-600">{footer}</div>}
    </div>
  );
}

function PerformanceCard({
  value,
  hours,
  label = "Working Hour Performance",
}: {
  value: number;
  hours: number;
  label?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-[var(--navy)]">{label}</h2>
      <p className="text-sm text-muted-foreground">By department - today</p>
      <div className="mt-8 rounded-3xl border bg-[#F8FAFD] p-4">
        <div className="relative mx-auto flex aspect-square max-w-[220px] items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-[14px] border-slate-100"
            style={{
              background: `conic-gradient(#2563eb ${value * 3.6}deg, #e2e8f0 0deg)`,
              WebkitMask:
                "radial-gradient(farthest-side, transparent calc(100% - 14px), #000 calc(100% - 13px))",
              mask: "radial-gradient(farthest-side, transparent calc(100% - 14px), #000 calc(100% - 13px))",
            }}
          />
          <div className="relative text-center">
            <div className="text-3xl font-bold text-[var(--navy)] sm:text-4xl">{value}%</div>
            <div className="text-sm text-muted-foreground">Needs attention</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
          <div>
            <div className="text-muted-foreground">Employee Perf.</div>
            <div className="text-lg font-semibold text-[var(--navy)]">{value}%</div>
          </div>
          <div>
            <div className="text-muted-foreground">Working Hours</div>
            <div className="text-lg font-semibold text-[var(--navy)]">{formatHours(hours)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-[#F8FAFD] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-bold text-[var(--navy)]">{value}</div>
    </div>
  );
}

function KpiCard({
  value,
  label,
  accent,
}: {
  value: number | string;
  label: string;
  accent: "purple" | "navy" | "blue";
}) {
  const accentClasses =
    accent === "purple"
      ? "border-violet-300 bg-white text-violet-600"
      : accent === "blue"
        ? "border-sky-300 bg-white text-sky-600"
        : "border-[var(--navy)] bg-white text-[var(--navy)]";
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className={`rounded-xl border-l-4 p-2 ${accentClasses}`}>
        <div className="text-3xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Legend({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

function buildComparisonDays() {
  const { start } = weekRange();
  return weekdayShort.map((day, index) => {
    const date = addDays(start, index);
    const key = format(date, "yyyy-MM-dd");
    return {
      key,
      day,
      label: format(date, "dd"),
      isToday: key === todayKey(),
      isWeekend: index >= 5,
    };
  });
}

function weekAttendanceBars(attendance: AttendanceRow[], roster: RosterShiftRow[]) {
  const { start } = weekRange();
  return weekdayShort.map((day, index) => {
    const date = format(addDays(start, index), "yyyy-MM-dd");
    const scheduled = roster.filter((shift) => shift.day === date).length;
    const attended = attendance.filter((row) => row.date === date && row.check_in_time).length;
    const rate = scheduled ? Math.round((attended / scheduled) * 100) : 0;
    return { day, filled: rate > 0, rate };
  });
}

function rosterComparison(
  roster: RosterShiftRow[],
  attendance: AttendanceRow[],
  comparisonDays: Array<{
    key: string;
    day: string;
    label: string;
    isToday: boolean;
    isWeekend: boolean;
  }>,
) {
  return comparisonDays.map((day) => {
    const rostered = roster.filter((shift) => shift.day === day.key).length;
    const attended = attendance.filter((row) => row.date === day.key && row.check_in_time).length;
    const onTime = attendance.filter(
      (row) => row.date === day.key && row.check_in_time && isOnTime(row, roster),
    ).length;
    const late = Math.max(attended - onTime, 0);
    const missed = Math.max(rostered - attended, 0);
    return { day: day.day, rostered, attended, onTime, late, missed };
  });
}

type ComparisonDayCell = {
  key: string;
  kind: "working" | "scheduled" | "mismatch" | "off" | "leave";
  label: string;
};

function buildComparisonRows(
  employees: EmployeeRow[],
  roster: RosterShiftRow[],
  attendance: AttendanceRow[],
  comparisonDays: Array<{
    key: string;
    day: string;
    label: string;
    isToday: boolean;
    isWeekend: boolean;
  }>,
) {
  return employees.map((employee) => {
    const cells: ComparisonDayCell[] = comparisonDays.map((day) => {
      const shift = roster.find((item) => item.employee_id === employee.id && item.day === day.key);
      const record = attendance.find(
        (item) => item.employee_id === employee.id && item.date === day.key,
      );
      if (record?.check_in_time && shift) {
        const onTime = isOnTime(record, [shift]);
        const label =
          record.check_in_time && record.check_out_time
            ? `${timeLabel(record.check_in_time)} - ${timeLabel(record.check_out_time)}`
            : `${timeLabel(record.check_in_time)} - ...`;
        return {
          key: day.key,
          kind: onTime ? "working" : "mismatch",
          label: onTime ? label : "Mismatch",
        };
      }
      if (record?.check_in_time && !shift) {
        return { key: day.key, kind: "mismatch", label: "Mismatch" };
      }
      if (shift) {
        return {
          key: day.key,
          kind: "scheduled",
          label: `${shift.start_time ?? "--"}-${shift.end_time ?? "--"}`,
        };
      }
      return { key: day.key, kind: day.isWeekend ? "off" : "off", label: "—" };
    });

    const hasMismatch = cells.some((cell) => cell.kind === "mismatch");
    return {
      employeeId: employee.id,
      employeeCode: employee.employee_code ?? employee.id.slice(0, 4).toUpperCase(),
      employeeName: employee.name,
      cells,
      hasMismatch,
    };
  });
}

function isOnTime(row: AttendanceRow, roster: RosterShiftRow[]) {
  const shift = roster.find(
    (item) => item.employee_id === row.employee_id && item.day === row.date,
  );
  if (!shift?.start_time || !row.check_in_time) return false;
  return (
    new Date(row.check_in_time).getTime() <= new Date(`${row.date}T${shift.start_time}`).getTime()
  );
}

function scheduledHoursFor(row: AttendanceRow, roster: RosterShiftRow[]) {
  const shift = roster.find(
    (item) => item.employee_id === row.employee_id && item.day === row.date,
  );
  if (!shift?.start_time || !shift?.end_time) return 0;
  const start = new Date(`${row.date}T${shift.start_time}`);
  const end = new Date(`${row.date}T${shift.end_time}`);
  const minutes = (end.getTime() - start.getTime()) / 60000 - (shift.break_minutes ?? 0);
  return Math.max(minutes / 60, 0);
}

function formatHours(hours: number) {
  return `${hours.toFixed(2).replace(/\.00$/, "")}h`;
}
