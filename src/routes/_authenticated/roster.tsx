import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Copy,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Printer,
  Redo2,
  Save,
  Send,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/roster")({
  component: RosterRoute,
});

// ---------- constants & helpers ----------
const DAYS_FULL = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HOURS = Array.from({ length: 18 }, (_, i) => 5 + i); // 5am..10pm
const GRID_START_HOUR = 5;
const GRID_END_HOUR = 23;

// Navy palette shades, used to color shifts by department
const DEPT_COLORS = ["#1E2A45", "#2D3E5F", "#4A6080", "#6B85A0", "#8FA5BF", "#B0C4D8"];
const deptColor = (dept: string | null, allDepts: string[]) => {
  const idx = Math.max(0, allDepts.indexOf(dept || "—"));
  return DEPT_COLORS[idx % DEPT_COLORS.length];
};

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const normalizeTime = (value?: string | null) => (value ? value.slice(0, 5) : "");
const timeToMinutes = (value?: string | null) => {
  const [h, m] = normalizeTime(value).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const timeFromMinutes = (minutes: number) => {
  const clamped = Math.max(GRID_START_HOUR * 60, Math.min(GRID_END_HOUR * 60, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
const addHoursToTime = (value: string, hours: number) =>
  timeFromMinutes(timeToMinutes(value) + hours * 60);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const monday = (d: Date) => {
  const x = new Date(d);
  const day = x.getDay() || 7;
  if (day !== 1) x.setDate(x.getDate() - (day - 1));
  x.setHours(0, 0, 0, 0);
  return x;
};
const parseHM = (s: string) => {
  const [h, m] = normalizeTime(s).split(":").map(Number);
  return h + (m || 0) / 60;
};
const hoursBetween = (start: string, end: string, brk: number) =>
  Math.max(0, parseHM(end) - parseHM(start) - brk / 60);
const fmt12 = (hm: string) => {
  const [hh, mm] = normalizeTime(hm).split(":").map(Number);
  const ap = hh >= 12 ? "p" : "a";
  const h = ((hh + 11) % 12) + 1;
  return mm ? `${h}:${String(mm).padStart(2, "0")}${ap}` : `${h}:00${ap}`;
};
const fmtAUD = (n: number) =>
  n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
const fmtDM = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
const relTime = (d: string) => {
  const diff = (new Date(d).getTime() - Date.now()) / 86400000;
  if (diff > 1) return `in ${Math.round(diff)} days`;
  if (diff > -1) return diff > 0 ? "tomorrow" : "today";
  const past = Math.abs(diff);
  if (past < 7) return `${Math.round(past)} days ago`;
  if (past < 30) return `${Math.round(past / 7)} weeks ago`;
  return `${Math.round(past / 30)} months ago`;
};

type Roster = {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
};

type Employee = {
  id: string;
  name: string;
  role: string | null;
  department: string | null;
  pay_rate: number | null;
  user_id?: string | null;
  status?: string | null;
};

type Shift = {
  id: string;
  roster_id: string;
  employee_id: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: number | null;
};

type ShiftTemplate = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  department: string | null;
  color: string | null;
  min_staff_required: number | null;
};

// ===================================================================
// Top-level route
// ===================================================================
function RosterRoute() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  if (!profile) return null;
  if (!isManager(profile)) {
    return (
      <div className="text-sm text-muted-foreground">
        Rosters are managed by your employer. View your shifts on the My Roster page.
      </div>
    );
  }

  if (editingId) {
    return (
      <RosterEditor
        rosterId={editingId}
        onBack={() => setEditingId(null)}
        businessId={profile.business_id!}
        onOpen={setEditingId}
      />
    );
  }
  return <RosterList businessId={profile.business_id!} onOpen={setEditingId} />;
}

// ===================================================================
// LIST
// ===================================================================
export function RosterList({
  businessId,
  onOpen,
  openCreate = false,
}: {
  businessId: string;
  onOpen: (id: string) => void;
  openCreate?: boolean;
}) {
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(openCreate);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rosters")
      .select("id, week_start, week_end, status")
      .eq("business_id", businessId)
      .order("week_start", { ascending: false })
      .limit(10);
    setRosters((data ?? []) as Roster[]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setCreateOpen(openCreate);
  }, [openCreate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rosters</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan, save and publish weekly rosters for your team.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" /> Create new
        </Button>
      </div>

      <div className="bg-[var(--navy)] text-white rounded-t-xl px-5 py-3 font-semibold tracking-wide text-sm">
        Current / previous rosters
      </div>
      <div className="bg-card border border-t-0 rounded-b-xl overflow-hidden -mt-6">
        <div className="hidden md:grid grid-cols-[1fr_1fr_120px_140px_100px] gap-4 px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b bg-secondary/40">
          <div>Start date</div>
          <div>End date</div>
          <div>Age</div>
          <div>Status</div>
          <div className="text-right">Details</div>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-sm text-muted-foreground text-center">Loading...</div>
        ) : rosters.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="text-sm text-muted-foreground">
              No rosters yet. Click <strong>Create new</strong> to get started.
            </div>
          </div>
        ) : (
          rosters.map((r, idx) => {
            const start = new Date(r.week_start);
            const end = new Date(r.week_end);
            return (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                className={`w-full text-left grid grid-cols-1 md:grid-cols-[1fr_1fr_120px_140px_100px] gap-1 md:gap-4 px-5 py-4 border-b last:border-b-0 hover:bg-secondary/40 transition-colors ${
                  idx % 2 === 1 ? "bg-secondary/20" : ""
                }`}
              >
                <div className="font-medium text-[var(--navy)]">
                  {start.toLocaleDateString("en-AU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
                <div className="text-sm">
                  {end.toLocaleDateString("en-AU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
                <div className="text-sm text-muted-foreground">{relTime(r.week_start)}</div>
                <div>
                  {r.status.toLowerCase() === "published" ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--navy)] text-white text-xs font-medium">
                      Published
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[var(--navy)] text-xs font-medium">
                      Draft
                    </span>
                  )}
                </div>
                <div className="md:text-right text-sm font-medium text-[var(--navy)]">
                  Open -&gt;
                </div>
              </button>
            );
          })
        )}
      </div>

      <CreateRosterDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        businessId={businessId}
        rosters={rosters}
        onCreated={(id) => {
          setCreateOpen(false);
          onOpen(id);
        }}
      />
    </div>
  );
}

// ===================================================================
// CREATE DIALOG
// ===================================================================
function CreateRosterDialog({
  open,
  onOpenChange,
  businessId,
  rosters,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string;
  rosters: Roster[];
  onCreated: (id: string) => void;
}) {
  const nextMon = useMemo(() => monday(addDays(new Date(), 7)), []);
  const [mode, setMode] = useState<"blank" | "copy">("blank");
  const [start, setStart] = useState(fmtDate(nextMon));
  const [end, setEnd] = useState(fmtDate(addDays(nextMon, 6)));
  const [sourceId, setSourceId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    setSaving(true);
    try {
      const { data: r, error } = await supabase
        .from("rosters")
        .insert({
          business_id: businessId,
          week_start: start,
          week_end: end,
          status: "draft",
        })
        .select()
        .single();
      if (error || !r) throw error ?? new Error("Failed to create roster");

      if (mode === "copy" && sourceId) {
        const { data: src } = await supabase
          .from("roster_shifts")
          .select("employee_id, day, start_time, end_time, break_minutes, total_hours")
          .eq("roster_id", sourceId);
        const source = (src ?? []) as Array<{
          employee_id: string;
          day: string;
          start_time: string | null;
          end_time: string | null;
          break_minutes: number | null;
          total_hours: number | null;
        }>;
        if (source.length) {
          const srcRoster = rosters.find((x) => x.id === sourceId);
          const offsetDays = srcRoster
            ? Math.round(
                (new Date(start).getTime() - new Date(srcRoster.week_start).getTime()) / 86400000,
              )
            : 0;
          const copies = source.map((s) => ({
            roster_id: r.id,
            employee_id: s.employee_id,
            day: fmtDate(addDays(new Date(s.day), offsetDays)),
            start_time: s.start_time,
            end_time: s.end_time,
            break_minutes: s.break_minutes,
            total_hours: s.total_hours,
          }));
          await supabase.from("roster_shifts").insert(copies);
        }
      }

      toast.success("Roster created");
      onCreated(r.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create new roster</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("blank")}
              className={`p-3 rounded-md border text-sm text-left transition-colors ${
                mode === "blank"
                  ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                  : "hover:bg-secondary"
              }`}
            >
              <div className="font-semibold">Blank roster</div>
              <div className="text-xs opacity-80 mt-1">Start from scratch</div>
            </button>
            <button
              type="button"
              onClick={() => setMode("copy")}
              disabled={rosters.length === 0}
              className={`p-3 rounded-md border text-sm text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === "copy"
                  ? "bg-[var(--navy)] text-white border-[var(--navy)]"
                  : "hover:bg-secondary"
              }`}
            >
              <div className="font-semibold">Copy previous</div>
              <div className="text-xs opacity-80 mt-1">Reuse a past roster</div>
            </button>
          </div>

          {mode === "copy" && (
            <div className="space-y-2">
              <Label>Source roster</Label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a roster to copy" />
                </SelectTrigger>
                <SelectContent>
                  {rosters.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      Week of {new Date(r.week_start).toLocaleDateString("en-AU")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Start date</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setEnd(fmtDate(addDays(new Date(e.target.value), 6)));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>End date</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={create}
            disabled={saving || (mode === "copy" && !sourceId) || !start || !end}
          >
            {saving ? "Creating…" : "Create roster"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================================================================
// EDITOR
// ===================================================================
export function RosterEditor({
  rosterId,
  businessId,
  onBack,
  onOpen,
  readOnly = false,
}: {
  rosterId: string;
  businessId: string;
  onBack: () => void;
  onOpen?: (id: string) => void;
  readOnly?: boolean;
}) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [editing, setEditing] = useState<Partial<Shift> | null>(null);
  const [loading, setLoading] = useState(true);
  const [businessName, setBusinessName] = useState("");
  const [allRosters, setAllRosters] = useState<Roster[]>([]);

  // Toolbar state
  const [deptFilter, setDeptFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"name" | "hours" | "cost">("name");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [byStaff, setByStaff] = useState(false);
  const [showCost, setShowCost] = useState(true);
  const [notesDraft, setNotesDraft] = useState("");
  const [copyFromOpen, setCopyFromOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: emps }, { data: sh }, { data: biz }, { data: rs }, { data: tpl }] =
      await Promise.all([
        supabase
          .from("rosters")
          .select("id, week_start, week_end, status")
          .eq("id", rosterId)
          .single(),
        supabase
          .from("employees")
          .select("id, name, role, department, pay_rate, user_id, status")
          .eq("business_id", businessId)
          .order("name"),
        supabase
          .from("roster_shifts")
          .select(
            "id, roster_id, employee_id, day, start_time, end_time, break_minutes, total_hours",
          )
          .eq("roster_id", rosterId),
        supabase.from("businesses").select("name").eq("id", businessId).single(),
        supabase
          .from("rosters")
          .select("id, week_start, week_end, status")
          .eq("business_id", businessId)
          .order("week_start", { ascending: false }),
        supabase
          .from("shift_templates")
          .select(
            "id, name, start_time, end_time, break_minutes, department, color, min_staff_required",
          )
          .eq("business_id", businessId)
          .order("start_time"),
      ]);
    setRoster(r as Roster | null);
    setEmployees(
      ((emps ?? []) as Employee[]).filter(
        (emp) => (emp.status ?? "active").toLowerCase() === "active",
      ),
    );
    setShifts((sh ?? []) as Shift[]);
    setTemplates((tpl ?? []) as ShiftTemplate[]);
    setBusinessName((biz as { name?: string } | null)?.name ?? "");
    setAllRosters((rs ?? []) as Roster[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rosterId]);

  const weekDates = useMemo(() => {
    if (!roster) return [] as Date[];
    const ws = new Date(roster.week_start);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [roster]);

  const allDepts = useMemo(() => {
    const set = new Set<string>();
    employees.forEach((e) => set.add(e.department || "—"));
    return Array.from(set).sort();
  }, [employees]);

  const visibleEmployees = useMemo(() => {
    let list = employees.slice();
    if (deptFilter !== "ALL") list = list.filter((e) => (e.department || "—") === deptFilter);
    return list;
  }, [employees, deptFilter]);

  const dayKey = weekDates[activeDay] ? fmtDate(weekDates[activeDay]) : "";
  const dayShifts = useMemo(() => shifts.filter((s) => s.day === dayKey), [shifts, dayKey]);

  // Per-employee day metrics (used for sorting & right column totals)
  const empDayMetrics = useMemo(() => {
    const map = new Map<string, { hours: number; cost: number }>();
    visibleEmployees.forEach((e) => {
      const sh = dayShifts.filter((s) => s.employee_id === e.id);
      const hours = sh.reduce((s, x) => s + Number(x.total_hours ?? 0), 0);
      const cost = hours * Number(e.pay_rate ?? 0);
      map.set(e.id, { hours, cost });
    });
    return map;
  }, [visibleEmployees, dayShifts]);

  const sortedEmployees = useMemo(() => {
    const list = visibleEmployees.slice();
    if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === "hours")
      list.sort(
        (a, b) => (empDayMetrics.get(b.id)?.hours ?? 0) - (empDayMetrics.get(a.id)?.hours ?? 0),
      );
    if (sortBy === "cost")
      list.sort(
        (a, b) => (empDayMetrics.get(b.id)?.cost ?? 0) - (empDayMetrics.get(a.id)?.cost ?? 0),
      );
    return list;
  }, [visibleEmployees, sortBy, empDayMetrics]);

  // Per-hour-slot rostered headcount above the grid
  const hourCounts = useMemo(() => {
    return HOURS.map((h) => {
      let c = 0;
      for (const s of dayShifts) {
        if (!s.start_time || !s.end_time) continue;
        const sh = parseHM(s.start_time);
        const eh = parseHM(s.end_time);
        if (sh < h + 1 && eh > h) c += 1;
      }
      return c;
    });
  }, [dayShifts]);

  const dayHours = dayShifts.reduce((s, x) => s + Number(x.total_hours ?? 0), 0);
  const dayCost = dayShifts.reduce((s, x) => {
    const emp = employees.find((e) => e.id === x.employee_id);
    return s + Number(x.total_hours ?? 0) * Number(emp?.pay_rate ?? 0);
  }, 0);

  const saveNotes = async () => {
    toast.success("Daily notes saved locally");
  };

  const openNew = (employeeId?: string, startTime = "09:00") => {
    const start = normalizeTime(startTime);
    setEditing({
      employee_id: employeeId,
      day: dayKey,
      start_time: start,
      end_time: addHoursToTime(start, 4),
      break_minutes: 30,
    });
  };

  const templateForShift = (shift: Shift, employee: Employee) =>
    templates.find((template) => {
      const sameTime =
        normalizeTime(template.start_time) === normalizeTime(shift.start_time) &&
        normalizeTime(template.end_time) === normalizeTime(shift.end_time);
      const sameBreak = Number(template.break_minutes ?? 0) === Number(shift.break_minutes ?? 0);
      const sameDepartment = !template.department || template.department === employee.department;
      return sameTime && sameBreak && sameDepartment;
    });

  const applyTemplate = (templateId: string) => {
    if (!editing) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const matchingEmployee =
      editing.employee_id ||
      employees.find(
        (employee) => !template.department || employee.department === template.department,
      )?.id;
    setEditing({
      ...editing,
      employee_id: matchingEmployee,
      start_time: normalizeTime(template.start_time),
      end_time: normalizeTime(template.end_time),
      break_minutes: template.break_minutes ?? 0,
    });
  };

  const saveShift = async () => {
    if (
      !editing ||
      !editing.employee_id ||
      !editing.day ||
      !editing.start_time ||
      !editing.end_time
    ) {
      toast.error("Pick employee, start and end time");
      return;
    }
    const total = hoursBetween(editing.start_time, editing.end_time, editing.break_minutes ?? 0);
    if (total <= 0) {
      toast.error("End time must be after start time");
      return;
    }
    const payload = {
      roster_id: rosterId,
      employee_id: editing.employee_id,
      day: editing.day,
      start_time: normalizeTime(editing.start_time),
      end_time: normalizeTime(editing.end_time),
      break_minutes: editing.break_minutes ?? 0,
      total_hours: total,
    };
    if (editing.id) {
      const { error } = await supabase.from("roster_shifts").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("roster_shifts").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Shift saved");
    setEditing(null);
    load();
  };

  const deleteShift = async () => {
    if (!editing?.id) return;
    const { error } = await supabase.from("roster_shifts").delete().eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Shift deleted");
    setEditing(null);
    load();
  };

  const clearDay = async () => {
    if (!confirm(`Clear all shifts for ${weekDates[activeDay]?.toDateString()}?`)) return;
    const ids = dayShifts.map((s) => s.id);
    if (!ids.length) return;
    await supabase.from("roster_shifts").delete().in("id", ids);
    load();
  };

  const publish = async () => {
    if (!roster) return;
    const next = roster.status.toLowerCase() === "published" ? "draft" : "published";
    const { error } = await supabase.from("rosters").update({ status: next }).eq("id", roster.id);
    if (error) return toast.error(error.message);
    toast.success(next === "published" ? "Roster published" : "Roster unpublished");
    const weekLabel = `${new Date(roster.week_start).toLocaleDateString("en-AU")} - ${new Date(
      roster.week_end,
    ).toLocaleDateString("en-AU")}`;
    const rosteredEmployees = employees.filter(
      (employee) => employee.user_id && shifts.some((shift) => shift.employee_id === employee.id),
    );
    void Promise.allSettled(
      rosteredEmployees.map((employee) => {
        const employeeShifts = shifts.filter((shift) => shift.employee_id === employee.id);
        const totalHours = employeeShifts.reduce(
          (sum, shift) => sum + Number(shift.total_hours ?? 0),
          0,
        );
        return notify({
          userId: employee.user_id!,
          businessId,
          type: next === "published" ? "roster_published" : "roster_unpublished",
          message:
            next === "published"
              ? `Your roster for ${weekLabel} has been published. You have ${employeeShifts.length} shift${employeeShifts.length === 1 ? "" : "s"} and ${totalHours.toFixed(2)} rostered hours.`
              : `Your roster for ${weekLabel} has been moved back to draft by your employer.`,
          relatedId: roster.id,
        });
      }),
    ).catch((notifyError) => console.error(notifyError));
    load();
  };

  const deleteRoster = async () => {
    if (!confirm("Delete this entire roster? This cannot be undone.")) return;
    const { error } = await supabase.from("rosters").delete().eq("id", rosterId);
    if (error) return toast.error(error.message);
    toast.success("Roster deleted");
    onBack();
  };

  const copyFromDay = async (fromKey: string) => {
    const src = shifts.filter((s) => s.day === fromKey);
    if (!src.length) {
      toast.error("No shifts to copy from that day");
      return;
    }
    if (dayShifts.length) {
      if (!confirm("Replace existing shifts for this day?")) return;
      await supabase
        .from("roster_shifts")
        .delete()
        .in(
          "id",
          dayShifts.map((s) => s.id),
        );
    }
    const copies = src.map((s) => ({
      roster_id: rosterId,
      employee_id: s.employee_id,
      day: dayKey,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes,
      total_hours: s.total_hours,
    }));
    await supabase.from("roster_shifts").insert(copies);
    toast.success("Day copied");
    setCopyFromOpen(false);
    load();
  };

  const prevWeekRoster = useMemo(() => {
    if (!roster) return null;
    const targetStart = fmtDate(addDays(new Date(roster.week_start), -7));
    return allRosters.find((r) => r.week_start === targetStart) ?? null;
  }, [roster, allRosters]);

  if (loading || !roster) {
    return <div className="text-sm text-muted-foreground">Loading roster…</div>;
  }

  const weekStartDate = new Date(roster.week_start);
  const weekStartLabel = weekStartDate.toLocaleDateString("en-AU", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="space-y-4 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Back link */}
      <div className="px-4 sm:px-6 lg:px-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[var(--navy)]"
        >
          <ArrowLeft className="size-4" /> All rosters
        </button>
      </div>

      {/* Page title + store/dept selectors (matches reference top row) */}
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--navy)] truncate">
              Roster for the Week beginning {weekStartLabel}
            </h1>
            {prevWeekRoster ? (
              <button
                onClick={() => onOpen?.(prevWeekRoster.id)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-[var(--navy)]"
              >
                <ChevronLeft className="size-3" />
                {new Date(prevWeekRoster.week_start).toLocaleDateString("en-AU")}
              </button>
            ) : null}
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap sm:items-center sm:shrink-0">
            <div className="min-w-0 rounded-md border bg-white px-3 py-1.5 text-sm text-[var(--navy)] sm:min-w-[180px]">
              {businessName || "Business"}
            </div>
            <div className="rounded-md border bg-white px-3 py-1.5 text-sm text-[var(--navy)]">
              ROSTER
            </div>
          </div>
        </div>
      </div>

      {/* Navy "Edit Roster" bar */}
      <div className="bg-[var(--navy)] text-white px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-6 flex-wrap">
            <div>
              <div className="text-2xl font-bold">{dayHours.toFixed(2)}</div>
              <div className="text-[10px] uppercase tracking-wide opacity-80">
                Hours rostered for {DAYS_FULL[activeDay]}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">{fmtAUD(dayCost)}</div>
              <div className="text-[10px] uppercase tracking-wide opacity-80">
                Total cost for {DAYS_FULL[activeDay]}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={deleteRoster}
              className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white gap-1"
            >
              <Trash2 className="size-4" /> Delete Roster
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={saveNotes}
              className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white gap-1"
            >
              <Save className="size-4" /> Save
            </Button>
            <Button
              size="sm"
              onClick={publish}
              className="bg-white text-[var(--navy)] hover:bg-white/90 gap-1"
            >
              <Send className="size-4" />
              {roster.status.toLowerCase() === "published" ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>

        {/* Sub-toolbar */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase opacity-80">Department</span>
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="h-8 w-[160px] bg-white text-[var(--navy)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">(ALL)</SelectItem>
                {allDepts.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="h-8 w-[140px] bg-white text-[var(--navy)]">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort by name</SelectItem>
              <SelectItem value="hours">Sort by hours</SelectItem>
              <SelectItem value="cost">Sort by cost</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-white/90 ml-1">
            <Checkbox
              checked={byStaff}
              onCheckedChange={(v) => setByStaff(!!v)}
              className="border-white/60 data-[state=checked]:bg-white data-[state=checked]:text-[var(--navy)]"
            />
            Roster By Staff Member
          </label>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={clearDay}
              className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white gap-1"
            >
              <X className="size-4" /> Clear Day
            </Button>
            <button
              title="Undo"
              className="p-1.5 rounded-md hover:bg-white/10 text-white"
              onClick={() => toast.message("Undo coming soon")}
            >
              <Undo2 className="size-4" />
            </button>
            <button
              title="Redo"
              className="p-1.5 rounded-md hover:bg-white/10 text-white"
              onClick={() => toast.message("Redo coming soon")}
            >
              <Redo2 className="size-4" />
            </button>
            <button
              title="Print"
              className="p-1.5 rounded-md hover:bg-white/10 text-white"
              onClick={() => window.print()}
            >
              <Printer className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Day tabs + view toggle */}
      <div className="px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto">
        <button
          className="p-2 rounded-md hover:bg-secondary shrink-0"
          onClick={() => setActiveDay((d) => Math.max(0, d - 1))}
        >
          <ChevronLeft className="size-4" />
        </button>
        {weekDates.map((d, i) => {
          const active = i === activeDay;
          return (
            <button
              key={i}
              onClick={() => setActiveDay(i)}
              className={`px-3 py-2 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                active ? "bg-[var(--navy)] text-white" : "hover:bg-secondary text-[var(--navy)]"
              }`}
            >
              <div className="uppercase">{DAYS_SHORT[i]}</div>
              <div className="opacity-80">{fmtDM(d)}</div>
            </button>
          );
        })}
        <button
          className="p-2 rounded-md hover:bg-secondary shrink-0"
          onClick={() => setActiveDay((d) => Math.min(6, d + 1))}
        >
          <ChevronRight className="size-4" />
        </button>

        <div className="ml-auto flex items-center gap-1 shrink-0">
          <button
            onClick={() => setView("grid")}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
              view === "grid"
                ? "bg-[var(--navy)] text-white"
                : "text-[var(--navy)] hover:bg-secondary"
            }`}
          >
            <LayoutGrid className="size-3.5" /> GRID
          </button>
          <button
            onClick={() => setView("list")}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs ${
              view === "list"
                ? "bg-[var(--navy)] text-white"
                : "text-[var(--navy)] hover:bg-secondary"
            }`}
          >
            <ListIcon className="size-3.5" /> LIST
          </button>
        </div>
      </div>

      {/* Grid / List body */}
      <div className="px-4 sm:px-6 lg:px-8">
        {view === "grid" ? (
          <div className="border rounded-xl bg-card overflow-x-auto">
            <div className="min-w-[1000px]">
              {/* hour-count strip */}
              <div className="grid grid-cols-[200px_1fr_90px] border-b bg-[var(--navy)]/5">
                <div className="px-3 py-2 text-xs uppercase tracking-wide text-[var(--navy)] border-r font-semibold">
                  Staff
                </div>
                <div
                  className="grid text-center text-xs font-semibold text-[var(--navy)]"
                  style={{
                    gridTemplateColumns: `repeat(${HOURS.length}, minmax(50px, 1fr))`,
                  }}
                >
                  {hourCounts.map((c, i) => (
                    <div key={i} className="border-l first:border-l-0 px-1 py-2">
                      {c || ""}
                    </div>
                  ))}
                </div>
                <div className="px-2 py-2 text-xs uppercase tracking-wide text-[var(--navy)] border-l font-semibold text-right">
                  {dayHours.toFixed(2)}
                </div>
              </div>

              {/* hour axis */}
              <div className="grid grid-cols-[200px_1fr_90px] border-b bg-secondary/40">
                <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground border-r">
                  Time
                </div>
                <div
                  className="grid text-[10px] uppercase text-muted-foreground"
                  style={{
                    gridTemplateColumns: `repeat(${HOURS.length}, minmax(50px, 1fr))`,
                  }}
                >
                  {HOURS.map((h) => (
                    <div key={h} className="border-l first:border-l-0 px-2 py-2">
                      {h < 12 ? `${h}am` : h === 12 ? `12pm` : `${h - 12}pm`}
                    </div>
                  ))}
                </div>
                <div className="border-l" />
              </div>

              {sortedEmployees.length === 0 ? (
                <div className="px-4 py-10 text-sm text-muted-foreground text-center">
                  No employees match the selected department.
                </div>
              ) : (
                sortedEmployees.map((emp) => {
                  const empShifts = dayShifts.filter((s) => s.employee_id === emp.id);
                  const metrics = empDayMetrics.get(emp.id) ?? {
                    hours: 0,
                    cost: 0,
                  };
                  return (
                    <div
                      key={emp.id}
                      className="grid grid-cols-[200px_1fr_90px] border-b last:border-b-0 min-h-[56px]"
                    >
                      <div className="px-3 py-2 border-r flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-[var(--navy)]/10 text-[var(--navy)] grid place-items-center text-xs font-semibold shrink-0">
                          {emp.name
                            .split(" ")
                            .map((p) => p[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-[var(--navy)] truncate">
                            {emp.name}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {emp.department || emp.role || "—"}
                          </div>
                        </div>
                      </div>
                      <div
                        className="relative cursor-pointer hover:bg-secondary/30"
                        style={{
                          backgroundImage:
                            "repeating-linear-gradient(to right, transparent 0, transparent calc((100%/" +
                            HOURS.length +
                            ") - 1px), var(--border) calc((100%/" +
                            HOURS.length +
                            ") - 1px), var(--border) calc(100%/" +
                            HOURS.length +
                            "))",
                        }}
                        onClick={(e) => {
                          if (readOnly) return;
                          if ((e.target as HTMLElement).closest("[data-shift]")) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const position = Math.max(
                            0,
                            Math.min(1, (e.clientX - rect.left) / rect.width),
                          );
                          const gridMinutes = (GRID_END_HOUR - GRID_START_HOUR) * 60;
                          const clickedMinutes =
                            GRID_START_HOUR * 60 + Math.round((position * gridMinutes) / 15) * 15;
                          openNew(emp.id, timeFromMinutes(clickedMinutes));
                        }}
                      >
                        {empShifts.map((s) => {
                          if (!s.start_time || !s.end_time) return null;
                          const startH = parseHM(s.start_time);
                          const endH = parseHM(s.end_time);
                          const first = GRID_START_HOUR;
                          const total = GRID_END_HOUR - GRID_START_HOUR;
                          const leftPct = Math.max(0, ((startH - first) / total) * 100);
                          const widthPct = Math.max(2, ((endH - startH) / total) * 100);
                          const matchedTemplate = templateForShift(s, emp);
                          const bg = matchedTemplate?.color || deptColor(emp.department, allDepts);
                          return (
                            <button
                              key={s.id}
                              data-shift
                              disabled={readOnly}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                if (readOnly) return;
                                setEditing(s);
                              }}
                              className="absolute top-1 bottom-1 text-white text-[11px] px-2 rounded-md flex flex-col items-start justify-center overflow-hidden hover:opacity-90"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: bg,
                              }}
                            >
                              <span className="truncate font-medium">
                                {fmt12(s.start_time.slice(0, 5))} - {fmt12(s.end_time.slice(0, 5))}
                                {matchedTemplate
                                  ? ` (${matchedTemplate.name})`
                                  : emp.department
                                    ? ` (${emp.department})`
                                    : ""}
                              </span>
                              {showCost && (
                                <span className="truncate opacity-80">
                                  {Number(s.total_hours ?? 0).toFixed(2)}h -{" "}
                                  {fmtAUD(Number(s.total_hours ?? 0) * Number(emp.pay_rate ?? 0))}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="border-l px-2 py-2 text-right text-xs text-[var(--navy)] flex flex-col justify-center">
                        <div className="font-semibold">{metrics.hours.toFixed(2)}</div>
                        {showCost && (
                          <div className="text-[11px] text-muted-foreground">
                            {fmtAUD(metrics.cost)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          // LIST view
          <div className="overflow-x-auto rounded-xl border bg-card">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[1fr_120px_120px_120px_120px_60px] border-b bg-secondary/40 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">
                <div>Staff</div>
                <div>Start</div>
                <div>End</div>
                <div>Hours</div>
                <div>Cost</div>
                <div />
              </div>
              {dayShifts.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No shifts on this day yet.
                </div>
              ) : (
                dayShifts.map((s) => {
                  const emp = employees.find((e) => e.id === s.employee_id);
                  const hrs = Number(s.total_hours ?? 0);
                  const cost = hrs * Number(emp?.pay_rate ?? 0);
                  return (
                    <div
                      key={s.id}
                      className="grid grid-cols-[1fr_120px_120px_120px_120px_60px] items-center border-b px-4 py-2 text-sm last:border-b-0"
                    >
                      <div className="truncate font-medium text-[var(--navy)]">
                        {emp?.name ?? "—"}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {emp?.department}
                        </span>
                      </div>
                      <div>{s.start_time ? fmt12(s.start_time.slice(0, 5)) : "—"}</div>
                      <div>{s.end_time ? fmt12(s.end_time.slice(0, 5)) : "—"}</div>
                      <div>{hrs.toFixed(2)}</div>
                      <div>{fmtAUD(cost)}</div>
                      <div className="text-right">
                        <button
                          className="text-xs text-[var(--navy)] hover:underline"
                          onClick={() => setEditing(s)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer: notes + actions */}
      <div className="px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-end">
        <div className="space-y-2">
          <Label className="text-[var(--navy)] font-semibold">Daily Notes</Label>
          <Textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={saveNotes}
            placeholder={`Notes for ${DAYS_FULL[activeDay]}…`}
            className="min-h-[80px] bg-white"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 justify-end">
          <label className="flex items-center gap-2 text-xs text-[var(--navy)]">
            <Checkbox checked={showCost} onCheckedChange={(v) => setShowCost(!!v)} />
            Show Cost Per Shift
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCopyFromOpen(true)}
            className="gap-1 border-[var(--navy)] text-[var(--navy)]"
          >
            <Copy className="size-4" /> COPY FROM
          </Button>
          <Button
            size="sm"
            onClick={() => openNew()}
            className="gap-1 bg-[var(--navy)] hover:bg-[var(--navy)]/90"
          >
            <Plus className="size-4" /> ADD
          </Button>
        </div>
      </div>

      {/* Shift edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit shift" : "Add shift"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              {templates.length > 0 && (
                <div className="space-y-2">
                  <Label>Shift template</Label>
                  <Select onValueChange={applyTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Apply a saved template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} - {normalizeTime(template.start_time)} to{" "}
                          {normalizeTime(template.end_time)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Employee</Label>
                <Select
                  value={editing.employee_id ?? ""}
                  onValueChange={(v) => setEditing({ ...editing, employee_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name} {e.department ? `- ${e.department}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start</Label>
                  <Input
                    type="time"
                    step={900}
                    value={normalizeTime(editing.start_time)}
                    onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End</Label>
                  <Input
                    type="time"
                    step={900}
                    value={normalizeTime(editing.end_time)}
                    onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Break</Label>
                <Select
                  value={String(editing.break_minutes ?? 0)}
                  onValueChange={(v) => setEditing({ ...editing, break_minutes: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">None</SelectItem>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.start_time && editing.end_time && (
                <div className="text-sm bg-secondary/50 rounded-md px-3 py-2">
                  Total:{" "}
                  <strong>
                    {hoursBetween(
                      editing.start_time,
                      editing.end_time,
                      editing.break_minutes ?? 0,
                    ).toFixed(2)}
                  </strong>{" "}
                  hours
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-row justify-between sm:justify-between gap-2">
            {editing?.id ? (
              <Button variant="outline" onClick={deleteShift} className="gap-1">
                <Trash2 className="size-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={saveShift} className="gap-1">
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy From dialog */}
      <Dialog open={copyFromOpen} onOpenChange={setCopyFromOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Copy shifts into {DAYS_FULL[activeDay]} {fmtDM(weekDates[activeDay])}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {weekDates.map((d, i) => {
              if (i === activeDay) return null;
              const key = fmtDate(d);
              const count = shifts.filter((s) => s.day === key).length;
              return (
                <button
                  key={key}
                  onClick={() => copyFromDay(key)}
                  disabled={!count}
                  className="w-full text-left px-3 py-2 rounded-md border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-between"
                >
                  <span className="text-sm text-[var(--navy)] font-medium">
                    {DAYS_FULL[i]} {fmtDM(d)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {count} shift{count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
