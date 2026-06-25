import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isAfter,
  isSameDay,
  parseISO,
  startOfMonth,
} from "date-fns";
import { CalendarDays, RefreshCw, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, type Profile } from "@/lib/auth";
import { notifyManagers } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/my-roster")({
  component: MyRosterPage,
});

type EmployeeRow = {
  id: string;
  business_id: string;
  employee_code: string | null;
  name: string;
  department: string | null;
  role: string | null;
  user_id: string | null;
};

type ShiftRow = {
  id: string;
  employee_id: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: number | null;
  rosters?: { status: string | null } | null;
};

type LeaveRow = {
  id: string;
  from_date: string;
  to_date: string;
  leave_type: string;
  status: string;
};

type HolidayRow = {
  id: string;
  holiday_date: string;
  holiday_name: string;
  is_paid: boolean;
};

type SwapState = {
  my_shift_id: string;
  target_emp_id: string;
  target_shift_id: string;
  note: string;
};

type CellState =
  | { kind: "shift"; shift: ShiftRow }
  | { kind: "leave"; leave: LeaveRow }
  | { kind: "holiday"; holiday: HolidayRow }
  | { kind: "off" };

const currentDate = new Date();
const defaultFrom = format(startOfMonth(currentDate), "yyyy-MM-dd");
const defaultTo = format(endOfMonth(currentDate), "yyyy-MM-dd");
const maxVisibleDays = 45;

function MyRosterPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [emp, setEmp] = useState<EmployeeRow | null>(null);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [colleagues, setColleagues] = useState<EmployeeRow[]>([]);
  const [colleagueShifts, setColleagueShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState<SwapState>({
    my_shift_id: "",
    target_emp_id: "",
    target_shift_id: "",
    note: "",
  });

  const loadRoster = useCallback(
    async (currentProfile: Profile | null, currentEmp: EmployeeRow | null) => {
      if (!currentProfile?.business_id || !currentEmp) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const [shiftResult, leaveResult, holidayResult, colleagueResult] = await Promise.all([
        supabase
          .from("roster_shifts")
          .select(
            "id, employee_id, day, start_time, end_time, break_minutes, total_hours, rosters(status)",
          )
          .eq("employee_id", currentEmp.id)
          .gte("day", fromDate)
          .lte("day", toDate)
          .order("day", { ascending: true }),
        supabase
          .from("leaves")
          .select("id, from_date, to_date, leave_type, status")
          .eq("business_id", currentProfile.business_id)
          .eq("employee_id", currentEmp.id)
          .eq("status", "approved")
          .lte("from_date", toDate)
          .gte("to_date", fromDate)
          .order("from_date", { ascending: true }),
        supabase
          .from("holidays")
          .select("id, holiday_date, holiday_name, is_paid")
          .eq("business_id", currentProfile.business_id)
          .gte("holiday_date", fromDate)
          .lte("holiday_date", toDate)
          .order("holiday_date", { ascending: true }),
        supabase
          .from("employees")
          .select("id, business_id, employee_code, name, department, role, user_id")
          .eq("business_id", currentProfile.business_id)
          .neq("id", currentEmp.id)
          .order("name", { ascending: true }),
      ]);

      if (shiftResult.error) toast.error("Failed to load roster: " + shiftResult.error.message);
      if (leaveResult.error) toast.error("Failed to load leave: " + leaveResult.error.message);
      if (holidayResult.error)
        toast.error("Failed to load holidays: " + holidayResult.error.message);
      if (colleagueResult.error)
        toast.error("Failed to load team: " + colleagueResult.error.message);

      setShifts((shiftResult.data ?? []) as unknown as ShiftRow[]);
      setLeaves((leaveResult.data ?? []) as LeaveRow[]);
      setHolidays((holidayResult.data ?? []) as HolidayRow[]);
      setColleagues((colleagueResult.data ?? []) as EmployeeRow[]);
      setLoading(false);
    },
    [fromDate, toDate],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const nextProfile = await fetchProfile();
      if (!active) return;
      setProfile(nextProfile);
      if (!nextProfile) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("employees")
        .select("id, business_id, employee_code, name, department, role, user_id")
        .eq("user_id", nextProfile.id)
        .maybeSingle();

      if (error) toast.error("Failed to load employee profile: " + error.message);
      if (!data) {
        setLoading(false);
        return;
      }

      const nextEmployee = data as EmployeeRow;
      setEmp(nextEmployee);
      await loadRoster(nextProfile, nextEmployee);
    })();

    return () => {
      active = false;
    };
  }, [loadRoster]);

  useEffect(() => {
    if (!profile?.business_id || !emp) return;
    void loadRoster(profile, emp);
  }, [fromDate, toDate, emp, loadRoster, profile]);

  useEffect(() => {
    if (!profile?.business_id || !emp) return;
    const channel = supabase
      .channel(`my-roster:${profile.business_id}:${emp.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "roster_shifts" }, () =>
        loadRoster(profile, emp),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leaves", filter: `employee_id=eq.${emp.id}` },
        () => loadRoster(profile, emp),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "holidays",
          filter: `business_id=eq.${profile.business_id}`,
        },
        () => loadRoster(profile, emp),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [emp, loadRoster, profile]);

  const days = useMemo(() => {
    const start = parseDate(fromDate);
    const end = parseDate(toDate);
    if (!start || !end || isAfter(start, end)) return [];
    return eachDayOfInterval({ start, end }).slice(0, maxVisibleDays);
  }, [fromDate, toDate]);

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    shifts.forEach((shift) => {
      const items = map.get(shift.day) ?? [];
      items.push(shift);
      map.set(shift.day, items);
    });
    return map;
  }, [shifts]);

  const holidaysByDay = useMemo(() => {
    const map = new Map<string, HolidayRow>();
    holidays.forEach((holiday) => map.set(holiday.holiday_date, holiday));
    return map;
  }, [holidays]);

  const approvedLeaveByDay = useMemo(() => {
    const map = new Map<string, LeaveRow>();
    days.forEach((day) => {
      const key = format(day, "yyyy-MM-dd");
      const leave = leaves.find((item) => key >= item.from_date && key <= item.to_date);
      if (leave) map.set(key, leave);
    });
    return map;
  }, [days, leaves]);

  const summary = useMemo(() => {
    const rosteredHours = shifts.reduce(
      (total, shift) => total + Number(shift.total_hours ?? 0),
      0,
    );
    return {
      days: days.length,
      shifts: shifts.length,
      workingDays: new Set(shifts.map((shift) => shift.day)).size,
      leaveDays: approvedLeaveByDay.size,
      holidays: holidays.length,
      hours: rosteredHours,
    };
  }, [approvedLeaveByDay.size, days.length, holidays.length, shifts]);

  const loadColleagueShifts = async (empId: string) => {
    const { data, error } = await supabase
      .from("roster_shifts")
      .select(
        "id, employee_id, day, start_time, end_time, break_minutes, total_hours, rosters(status)",
      )
      .eq("employee_id", empId)
      .gte("day", format(new Date(), "yyyy-MM-dd"))
      .order("day", { ascending: true });

    if (error) toast.error("Failed to load colleague shifts: " + error.message);
    setColleagueShifts((data ?? []) as unknown as ShiftRow[]);
  };

  const submitSwap = async () => {
    if (!emp || !profile?.business_id) return;
    if (!swap.my_shift_id || !swap.target_emp_id || !swap.target_shift_id) {
      toast.error("Please select all shifts");
      return;
    }
    const { error } = await supabase.from("shift_swaps").insert({
      business_id: profile.business_id,
      requester_employee_id: emp.id,
      requester_shift_id: swap.my_shift_id,
      target_employee_id: swap.target_emp_id,
      target_shift_id: swap.target_shift_id,
      note: swap.note || null,
      status: "pending",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await notifyManagers({
      businessId: profile.business_id,
      type: "swap_requested",
      message: `${emp.name} requested a shift swap.`,
    });
    toast.success("Swap request submitted");
    setOpen(false);
    setSwap({ my_shift_id: "", target_emp_id: "", target_shift_id: "", note: "" });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Home</span>
            <span>/</span>
            <span>My work</span>
            <span>/</span>
            <span className="font-medium text-[var(--navy)]">My Roster</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-blue-600">Roster</div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">View Roster</h1>
            <p className="text-sm text-muted-foreground">
              {emp
                ? `${emp.name} - ${emp.employee_code || "No code"} - read-only schedule`
                : "Your read-only schedule"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => loadRoster(profile, emp)} disabled={loading}>
            <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <SwapDialog
            open={open}
            setOpen={setOpen}
            shifts={shifts}
            colleagues={colleagues}
            colleagueShifts={colleagueShifts}
            swap={swap}
            setSwap={setSwap}
            loadColleagueShifts={loadColleagueShifts}
            submitSwap={submitSwap}
          />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Days in view" value={summary.days} />
        <SummaryCard label="Roster shifts" value={summary.shifts} />
        <SummaryCard label="Working days" value={summary.workingDays} />
        <SummaryCard label="Approved leave" value={summary.leaveDays} />
        <SummaryCard label="Rostered hours" value={formatHours(summary.hours)} />
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--navy)]">My schedule</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Viewing shifts for{" "}
                <strong className="text-[var(--navy)]">{emp?.name || "you"}</strong>. Approved leave
                shows as <span className="font-semibold text-violet-500">Leave</span>; holidays as{" "}
                <span className="font-semibold text-red-500">PH</span>.
              </p>
            </div>
            {days.length >= maxVisibleDays && (
              <Badge variant="outline">Showing first {maxVisibleDays} days</Badge>
            )}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                From
              </span>
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                To
              </span>
              <Input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
            <Button
              className="self-end bg-blue-500 hover:bg-blue-600"
              onClick={() => loadRoster(profile, emp)}
              disabled={loading || days.length === 0}
            >
              Show my roster
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div
              className="grid border-b bg-secondary/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              style={{
                gridTemplateColumns: `112px 200px repeat(${days.length}, minmax(124px, 1fr))`,
              }}
            >
              <div className="border-r px-4 py-3">Emp code</div>
              <div className="border-r px-4 py-3">Emp name</div>
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`border-r px-3 py-3 text-center ${isWeekend(day) ? "bg-muted text-muted-foreground" : ""} ${
                    isSameDay(day, currentDate) ? "bg-blue-50 text-blue-600" : ""
                  }`}
                >
                  <div>{format(day, "EEE")}</div>
                  <div className="mt-1 text-base font-bold text-[var(--navy)]">
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>

            <div
              className="grid min-h-[72px] border-b"
              style={{
                gridTemplateColumns: `112px 200px repeat(${days.length}, minmax(124px, 1fr))`,
              }}
            >
              <div className="flex items-center border-r px-4 py-3 font-mono text-sm text-muted-foreground">
                {emp?.employee_code || "-"}
              </div>
              <div className="flex flex-col justify-center border-r px-4 py-3">
                <div className="font-semibold text-[var(--navy)]">{emp?.name || "Employee"}</div>
                <div className="text-xs text-muted-foreground">
                  {emp?.department || emp?.role || "Employee"}
                </div>
              </div>
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const cell = getCellState(key, shiftsByDay, approvedLeaveByDay, holidaysByDay);
                return <RosterCell key={key} date={day} state={cell} />;
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t bg-card px-5 py-4 text-sm">
          <Legend label="W Working" className="text-emerald-500" />
          <Legend label="WO Weekly Off" className="text-amber-500" />
          <Legend label="PH Public holiday" className="text-red-500" />
          <Legend label="Leave Approved leave" className="text-violet-500" />
          <span className="font-mono text-xs font-semibold text-emerald-500">
            W cells: 09:00 - 17:00 | 30m | 7.5h
          </span>
        </div>
      </section>

      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b p-5">
          <CalendarDays className="size-5 text-[var(--navy)]" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--navy)]">Shift details</h2>
            <p className="text-sm text-muted-foreground">Read-only list for the selected range.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Start</th>
                <th className="px-5 py-3">End</th>
                <th className="px-5 py-3">Break</th>
                <th className="px-5 py-3">Hours</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    Loading roster...
                  </td>
                </tr>
              ) : shifts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    No shifts found in this range.
                  </td>
                </tr>
              ) : (
                shifts.map((shift) => (
                  <tr key={shift.id} className="border-t">
                    <td className="px-5 py-3 font-medium text-[var(--navy)]">
                      {format(parseISO(shift.day), "EEE, d MMM yyyy")}
                    </td>
                    <td className="px-5 py-3">{timeLabel(shift.start_time)}</td>
                    <td className="px-5 py-3">{timeLabel(shift.end_time)}</td>
                    <td className="px-5 py-3">{shift.break_minutes ?? 0}m</td>
                    <td className="px-5 py-3">{formatHours(Number(shift.total_hours ?? 0))}</td>
                    <td className="px-5 py-3">
                      <Badge variant="outline">{shift.rosters?.status || "Rostered"}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SwapDialog({
  open,
  setOpen,
  shifts,
  colleagues,
  colleagueShifts,
  swap,
  setSwap,
  loadColleagueShifts,
  submitSwap,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  shifts: ShiftRow[];
  colleagues: EmployeeRow[];
  colleagueShifts: ShiftRow[];
  swap: SwapState;
  setSwap: (value: SwapState) => void;
  loadColleagueShifts: (empId: string) => Promise<void>;
  submitSwap: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Repeat className="mr-2 size-4" /> Request swap
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request shift swap</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>My shift</Label>
            <Select
              value={swap.my_shift_id}
              onValueChange={(v) => setSwap({ ...swap, my_shift_id: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your shift" />
              </SelectTrigger>
              <SelectContent>
                {shifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.day} - {timeLabel(s.start_time)} to {timeLabel(s.end_time)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Colleague</Label>
            <Select
              value={swap.target_emp_id}
              onValueChange={(v) => {
                setSwap({ ...swap, target_emp_id: v, target_shift_id: "" });
                void loadColleagueShifts(v);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a colleague" />
              </SelectTrigger>
              <SelectContent>
                {colleagues.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Their shift</Label>
            <Select
              value={swap.target_shift_id}
              onValueChange={(v) => setSwap({ ...swap, target_shift_id: v })}
              disabled={!swap.target_emp_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select their shift" />
              </SelectTrigger>
              <SelectContent>
                {colleagueShifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.day} - {timeLabel(s.start_time)} to {timeLabel(s.end_time)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              value={swap.note}
              onChange={(e) => setSwap({ ...swap, note: e.target.value })}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submitSwap} className="bg-[var(--navy)] hover:bg-[var(--navy-light)]">
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-[var(--navy)]">{value}</div>
    </div>
  );
}

function RosterCell({ date, state }: { date: Date; state: CellState }) {
  const weekend = isWeekend(date);
  if (state.kind === "shift") {
    return (
      <div className="flex min-h-[72px] items-center justify-center border-r px-2 py-3">
        <div className="w-full rounded-full bg-emerald-100 px-3 py-2 text-center text-xs font-semibold text-emerald-700">
          {timeLabel(state.shift.start_time)} - {timeLabel(state.shift.end_time)}
          <span className="ml-1 text-emerald-600">
            | {state.shift.break_minutes ?? 0}m |{" "}
            {formatHours(Number(state.shift.total_hours ?? 0))}
          </span>
        </div>
      </div>
    );
  }
  if (state.kind === "leave") {
    return (
      <div className="flex min-h-[72px] items-center justify-center border-r bg-violet-50 px-2 py-3">
        <span className="rounded-full bg-violet-200 px-3 py-1 text-xs font-semibold text-violet-700">
          Leave
        </span>
      </div>
    );
  }
  if (state.kind === "holiday") {
    return (
      <div className="flex min-h-[72px] items-center justify-center border-r bg-red-50 px-2 py-3">
        <span
          className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600"
          title={state.holiday.holiday_name}
        >
          PH
        </span>
      </div>
    );
  }
  return (
    <div
      className={`flex min-h-[72px] items-center justify-center border-r px-2 py-3 ${weekend ? "bg-muted" : ""}`}
    >
      <span className="text-muted-foreground">-</span>
    </div>
  );
}

function Legend({ label, className }: { label: string; className: string }) {
  const [prefix, ...rest] = label.split(" ");
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`font-semibold ${className}`}>{prefix}</span>
      <span className="text-muted-foreground">{rest.join(" ")}</span>
    </span>
  );
}

function getCellState(
  key: string,
  shiftsByDay: Map<string, ShiftRow[]>,
  leaveByDay: Map<string, LeaveRow>,
  holidayByDay: Map<string, HolidayRow>,
): CellState {
  const shift = shiftsByDay.get(key)?.[0];
  if (shift) return { kind: "shift", shift };
  const leave = leaveByDay.get(key);
  if (leave) return { kind: "leave", leave };
  const holiday = holidayByDay.get(key);
  if (holiday) return { kind: "holiday", holiday };
  return { kind: "off" };
}

function parseDate(value: string) {
  const date = parseISO(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWeekend(date: Date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function timeLabel(value?: string | null) {
  return value?.slice(0, 5) ?? "-";
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0h";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}h`;
}
