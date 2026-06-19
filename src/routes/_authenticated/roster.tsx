import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
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
import { UserAvatar } from "@/components/UserAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { MapPin, Layout } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  LayoutGrid,
  List,
  Plus,
  Printer,
  RotateCcw,
  RotateCw,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/roster")({
  component: RosterRoute,
});

// ---------- helpers ----------
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const HOURS = Array.from({ length: 18 }, (_, i) => 5 + i); // 5am..10pm
const GRID_START_HOUR = 5;
const GRID_END_HOUR = 23;
const fmtDate = (d: Date | undefined) => {
  if (!d || isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};
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
const hoursBetween = (start: string, end: string, brk: number) =>
  Math.max(0, parseHM(end) - parseHM(start) - brk / 60);
const money = (value: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
const isPublished = (status: string) => status.toLowerCase() === "published";
const activeStatus = (status?: string | null) => (status ?? "active").toLowerCase() === "active";
const shortTime = (value?: string | null) => {
  if (!value) return "--";
  const [h, m] = normalizeTime(value).split(":").map(Number);
  const suffix = h >= 12 ? "p" : "a";
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")}${suffix}`;
};
const hourLabel = (hour: number) => {
  const suffix = hour >= 12 ? "pm" : "am";
  return `${hour % 12 || 12}${suffix}`;
};
const shiftColor = (value?: string | null) => {
  const key = (value || "other").toLowerCase();
  if (key.includes("register") || key.includes("front")) return "#16A34A";
  if (key.includes("stock") || key.includes("kitchen")) return "#DC2626";
  if (key.includes("floor")) return "#2563EB";
  if (key.includes("manage") || key.includes("supervisor")) return "#7C3AED";
  if (key.includes("duty")) return "#0891B2";
  return "#1E2A45";
};
const shiftCost = (shift: Shift, employees: Employee[]) => {
  const emp = employees.find((e) => e.id === shift.employee_id);
  return Number(shift.total_hours ?? 0) * Number(emp?.pay_rate ?? 0);
};
const sumHours = (rows: Shift[]) =>
  rows.reduce((sum, row) => sum + Number(row.total_hours ?? 0), 0);
const sumCost = (rows: Shift[], employees: Employee[]) =>
  rows.reduce((sum, row) => sum + shiftCost(row, employees), 0);
const uniq = (items: string[]) => Array.from(new Set(items.filter(Boolean)));
const overlaps = (shift: Shift, start: number, end: number) => {
  if (!shift.start_time || !shift.end_time) return false;
  return parseHM(shift.start_time) < end && parseHM(shift.end_time) > start;
};
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
  business_id?: string;
  week_start: string;
  week_end: string;
  status: string;
  location?: string | null;
  created_at?: string;
};

type Employee = {
  id: string;
  name: string;
  email?: string | null;
  role: string | null;
  department?: string | null;
  employment_type?: string | null;
  pay_rate: number | null;
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

// ===================================================================
// Top-level route component
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
  const [viewType, setViewType] = useState<"ROSTERS" | "TEMPLATES">("ROSTERS");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("rosters")
      .select("id, business_id, week_start, week_end, status, location, created_at")
      .eq("business_id", businessId)
      .order("week_start", { ascending: false });
    setRosters((data ?? []) as Roster[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [businessId]);

  useEffect(() => {
    setCreateOpen(openCreate);
  }, [openCreate]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--navy)]">
          Roster for the Week beginning{" "}
          {rosters[0]
            ? new Date(rosters[0].week_start).toLocaleDateString("en-AU", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })
            : new Date().toLocaleDateString("en-AU")}
        </h1>
        <div className="mt-2 text-sm font-semibold text-[var(--navy)]">
          &lt;&lt; {rosters[0]?.week_start ?? fmtDate(monday(new Date()))}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-1">
            <Select defaultValue="main">
              <SelectTrigger className="w-full sm:w-[200px] h-9 rounded-full border-[var(--navy)] text-[var(--navy)] font-medium">
                <MapPin className="size-4 mr-2" />
                <SelectValue placeholder="Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="main">Rotaro Demo Business</SelectItem>
              </SelectContent>
            </Select>

            <Select value={viewType} onValueChange={(v: any) => setViewType(v)}>
              <SelectTrigger className="w-full sm:w-[160px] h-9 rounded-full border-[var(--navy)] text-[var(--navy)] font-medium">
                <Layout className="size-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ROSTERS">ROSTERS</SelectItem>
                <SelectItem value="TEMPLATES">TEMPLATES</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 w-full sm:w-auto">
          <Plus className="size-4" /> Create new
        </Button>
      </div>

      <div className="bg-[var(--navy)] text-white rounded-t-xl px-5 py-3 font-semibold tracking-wide text-sm flex items-center justify-between gap-3">
        <span>{viewType === "ROSTERS" ? "Current/Previous Rosters" : "Roster templates"}</span>
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="bg-white/10 text-white hover:bg-white/20"
        >
          CREATE NEW <Plus className="ml-1 size-4" />
        </Button>
      </div>
      <div className="bg-card border border-t-0 rounded-b-xl overflow-hidden -mt-6">
        {/* table header */}
        <div className="hidden md:grid grid-cols-[1fr_1fr_120px_140px_100px] gap-4 px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b bg-secondary/40">
          <div>Start date</div>
          <div>End date</div>
          <div>Created</div>
          <div>Published</div>
          <div className="text-right">Details</div>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-sm text-muted-foreground text-center">Loading…</div>
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
                  {start.toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
                <div className="text-sm">
                  {end.toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
                <div className="text-sm text-muted-foreground">{relTime(r.week_start)}</div>
                <div>
                  {isPublished(r.status) ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--navy)] text-white text-xs font-medium">
                      <Check className="size-3" /> Published
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-[var(--navy)] text-xs font-medium">
                      Draft
                    </span>
                  )}
                </div>
                <div className="md:text-right text-sm font-medium text-[var(--navy)]">
                  VIEW &gt;
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
        .insert({ business_id: businessId, week_start: start, week_end: end, status: "draft" })
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
          <div className="grid grid-cols-2 gap-2">
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
                      Week of {new Date(r.week_start).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
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
  readOnly = false,
}: {
  rosterId: string;
  businessId: string;
  onBack: () => void;
  readOnly?: boolean;
}) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [holidays, setHolidays] = useState<RosterHoliday[]>([]);
  const [editing, setEditing] = useState<Partial<Shift> | null>(null);
  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState("ALL");
  const [sortBy, setSortBy] = useState("name-asc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showCost, setShowCost] = useState(false);
  const [dailyNotes, setDailyNotes] = useState<Record<string, string>>({});
  const [copySource, setCopySource] = useState("");
  const [allRosters, setAllRosters] = useState<Roster[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: emps }, { data: sh }, { data: rosterRows }] = await Promise.all([
      supabase
        .from("rosters")
        .select("id, business_id, week_start, week_end, status, location, created_at")
        .eq("id", rosterId)
        .single(),
      supabase
        .from("employees")
        .select("id, name, email, role, department, employment_type, pay_rate, status")
        .eq("business_id", businessId)
        .order("name"),
      supabase
        .from("roster_shifts")
        .select("id, roster_id, employee_id, day, start_time, end_time, break_minutes, total_hours")
        .eq("roster_id", rosterId),
      supabase
        .from("rosters")
        .select("id, business_id, week_start, week_end, status, location, created_at")
        .eq("business_id", businessId)
        .order("week_start", { ascending: false }),
    ]);
    const { data: fetchedHolidays } = await supabase
      .from("holidays")
      .select("holiday_date, holiday_name, is_paid")
      .eq("business_id", businessId)
      .gte("holiday_date", r?.week_start)
      .lte("holiday_date", r?.week_end);

    setRoster(r as Roster | null);
    setEmployees(((emps ?? []) as Employee[]).filter((emp) => activeStatus((emp as any).status)));
    setShifts((sh ?? []) as Shift[]);
    setHolidays((fetchedHolidays ?? []) as RosterHoliday[]);
    setAllRosters((rosterRows ?? []) as Roster[]);
    setCopySource(((rosterRows ?? []) as Roster[]).find((item) => item.id !== rosterId)?.id ?? "");
    setLoading(false);
  };

  type RosterHoliday = {
    holiday_date: string;
    holiday_name: string;
    is_paid: boolean;
  };
  useEffect(() => {
    load();
  }, [rosterId]);

  const weekDates = useMemo(() => {
    if (!roster) return [] as Date[];
    const ws = new Date(roster.week_start);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [roster]);

  const dayKey = weekDates[activeDay] ? fmtDate(weekDates[activeDay]) : "";
  const dayShifts = shifts.filter((s) => s.day === dayKey);

  const departments = useMemo(
    () => ["ALL", ...uniq(employees.map((emp) => emp.department || "Unassigned"))],
    [employees],
  );
  const visibleEmployees = useMemo(() => {
    const rows = employees.filter(
      (emp) => department === "ALL" || (emp.department || "Unassigned") === department,
    );
    return [...rows].sort((a, b) => {
      if (sortBy === "name-desc") return b.name.localeCompare(a.name);
      if (sortBy === "department") {
        return (
          (a.department || "").localeCompare(b.department || "") || a.name.localeCompare(b.name)
        );
      }
      if (sortBy === "employment") {
        return (
          (a.employment_type || "").localeCompare(b.employment_type || "") ||
          a.name.localeCompare(b.name)
        );
      }
      if (sortBy === "hours") {
        const ah = sumHours(shifts.filter((shift) => shift.employee_id === a.id));
        const bh = sumHours(shifts.filter((shift) => shift.employee_id === b.id));
        return bh - ah;
      }
      return a.name.localeCompare(b.name);
    });
  }, [department, employees, shifts, sortBy]);

  const dayHours = sumHours(dayShifts);
  const dayCost = sumCost(dayShifts, employees);

  const openNew = (employeeId: string, startTime = "09:00") => {
    const start = normalizeTime(startTime);
    setEditing({
      employee_id: employeeId,
      day: dayKey,
      start_time: start,
      end_time: addHoursToTime(start, 4),
      break_minutes: 30,
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
    const next = isPublished(roster.status) ? "draft" : "published";
    const { error } = await supabase.from("rosters").update({ status: next }).eq("id", roster.id);
    if (error) return toast.error(error.message);
    toast.success(next === "published" ? "Roster published" : "Roster unpublished");
    load();
  };

  const deleteRoster = async () => {
    if (!confirm("Delete this entire roster? This cannot be undone.")) return;
    const { error } = await supabase.from("rosters").delete().eq("id", rosterId);
    if (error) return toast.error(error.message);
    toast.success("Roster deleted");
    onBack();
  };

  const copyFromRoster = async () => {
    if (!roster || !copySource) return;
    const sourceRoster = allRosters.find((item) => item.id === copySource);
    if (!sourceRoster) return;
    if (
      !confirm(
        `This will add shifts from week of ${new Date(sourceRoster.week_start).toLocaleDateString(
          "en-AU",
        )}. Existing shifts will be kept. Continue?`,
      )
    ) {
      return;
    }
    const { data: source } = await supabase
      .from("roster_shifts")
      .select("employee_id, day, start_time, end_time, break_minutes, total_hours")
      .eq("roster_id", sourceRoster.id);
    const offsetDays = Math.round(
      (new Date(roster.week_start).getTime() - new Date(sourceRoster.week_start).getTime()) /
        86400000,
    );
    const copies = (source ?? []).map((shift) => ({
      roster_id: roster.id,
      employee_id: shift.employee_id,
      day: fmtDate(addDays(new Date(shift.day), offsetDays)),
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: shift.break_minutes ?? 0,
      total_hours: shift.total_hours ?? 0,
    }));
    if (!copies.length) return toast.info("No shifts found to copy.");
    const { error } = await supabase.from("roster_shifts").insert(copies);
    if (error) return toast.error(error.message);
    toast.success("Shifts copied");
    load();
  };

  const saveAsTemplate = async () => {
    const name = prompt("Template name");
    if (!name) return;
    const firstShift = shifts[0];
    if (!firstShift) return toast.error("Add at least one shift before saving a template.");
    const emp = employees.find((item) => item.id === firstShift.employee_id);
    const { error } = await supabase.from("shift_templates").insert({
      business_id: businessId,
      name,
      department: emp?.department ?? null,
      start_time: firstShift.start_time ?? "09:00",
      end_time: firstShift.end_time ?? "17:00",
      break_minutes: firstShift.break_minutes ?? 30,
    });
    if (error) return toast.error(error.message);
    toast.success("Template saved");
  };

  if (loading || !roster) {
    return <div className="text-sm text-muted-foreground">Loading roster…</div>;
  }

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

      {/* Navy top bar */}
      <div className="bg-[var(--navy)] text-white px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-6">
          <div>
            <div className="text-2xl font-bold">{dayHours.toFixed(2)}</div>
            <div className="text-xs uppercase opacity-80">
              Hours rostered for{" "}
              {weekDates[activeDay]?.toLocaleDateString(undefined, { weekday: "long" })}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold">{money(dayCost)}</div>
            <div className="text-xs uppercase opacity-80">Total cost for day</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.print()}
                className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white gap-1"
              >
                <Printer className="size-4" /> Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("Email sending is not configured yet.")}
                className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white gap-1"
              >
                <Send className="size-4" /> Re-send
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={deleteRoster}
                className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white gap-1"
              >
                <Trash2 className="size-4" /> Delete
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.success("Roster saved")}
                className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white gap-1"
              >
                <Save className="size-4" /> Save
              </Button>
              <Button
                size="sm"
                onClick={publish}
                className="bg-white text-[var(--navy)] hover:bg-white/90 gap-1"
              >
                <Send className="size-4" /> {isPublished(roster.status) ? "Re-publish" : "Publish"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Toolbar */}
      {!readOnly && (
        <div className="px-4 sm:px-6 lg:px-8 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 font-medium text-[var(--navy)]">
            Department:
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="h-9 rounded-md border bg-card px-3 text-sm"
            >
              {departments.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="h-9 rounded-md border bg-card px-3 text-sm"
          >
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="department">Department</option>
            <option value="employment">Employment Type</option>
            <option value="hours">Hours</option>
          </select>
          <Button variant="outline" size="sm" className="gap-1">
            <GripVertical className="size-4" /> Set Staff Member Order
          </Button>
          <label className="flex items-center gap-2">
            <input type="checkbox" defaultChecked /> Roster By Staff Member
          </label>
          <span className="px-2 py-1 rounded bg-secondary text-[var(--navy)] text-xs font-medium uppercase tracking-wide">
            {roster.status}
          </span>
          <span className="text-muted-foreground">
            Week of {new Date(roster.week_start).toLocaleDateString()} –{" "}
            {new Date(roster.week_end).toLocaleDateString()}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={clearDay} className="gap-1">
              <X className="size-4" /> Clear day
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => toast.info("Nothing to undo yet.")}
            >
              <RotateCcw className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => toast.info("Nothing to redo yet.")}
            >
              <RotateCw className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => window.print()}>
              <Printer className="size-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === "grid" ? "default" : "outline"}
              onClick={() => setViewMode("grid")}
              className="gap-1"
            >
              <LayoutGrid className="size-4" /> Grid
            </Button>
            <Button
              size="sm"
              variant={viewMode === "list" ? "default" : "outline"}
              onClick={() => setViewMode("list")}
              className="gap-1"
            >
              <List className="size-4" /> List
            </Button>
          </div>
        </div>
      )}

      {/* Day tabs */}
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
              <div className="uppercase">{DAYS[i]}</div>
              <div className="opacity-80">
                {d.getDate()}/{d.getMonth() + 1}
              </div>
            </button>
          );
        })}
        <button
          className="p-2 rounded-md hover:bg-secondary shrink-0"
          onClick={() => setActiveDay((d) => Math.min(6, d + 1))}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="px-4 sm:px-6 lg:px-8">
        {viewMode === "list" ? (
          <div className="bg-card border rounded-xl overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-secondary/40 text-left">
                <tr>
                  <th className="px-4 py-3">Employee Name</th>
                  <th>Date</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Break</th>
                  <th>Total Hours</th>
                  <th>Role</th>
                  <th>Cost</th>
                  <th className="text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dayShifts.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      No shifts for this day.
                    </td>
                  </tr>
                ) : (
                  dayShifts.map((shift) => {
                    const emp = employees.find((item) => item.id === shift.employee_id);
                    return (
                      <tr key={shift.id} className="border-t">
                        <td className="px-4 py-3 font-semibold text-[var(--navy)]">
                          {emp?.name ?? "Staff"}
                        </td>
                        <td>{shift.day}</td>
                        <td>{shortTime(shift.start_time)}</td>
                        <td>{shortTime(shift.end_time)}</td>
                        <td>{shift.break_minutes ?? 0}m</td>
                        <td>{Number(shift.total_hours ?? 0).toFixed(2)}</td>
                        <td>{emp?.role || emp?.department || "Shift"}</td>
                        <td>{money(shiftCost(shift, employees))}</td>
                        <td className="text-right pr-4">
                          <Button variant="outline" size="sm" onClick={() => setEditing(shift)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border rounded-xl bg-card overflow-x-auto">
            <div className="min-w-[900px]">
              {/* hour axis */}
              <div className="border-b bg-secondary/40 text-[10px] uppercase text-muted-foreground">
                <div className="grid grid-cols-[180px_1fr_110px] md:grid-cols-[220px_1fr_120px]">
                  <div className="sticky left-0 z-10 bg-secondary/95 px-3 py-2 font-semibold tracking-wide border-r">
                    Staff
                  </div>
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(50px, 1fr))` }}
                  >
                    {HOURS.map((h) => (
                      <div
                        key={h}
                        className="border-l first:border-l-0 px-2 py-2 text-center font-semibold text-[var(--navy)]"
                      >
                        {dayShifts.filter((shift) => overlaps(shift, h, h + 1)).length}
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 text-right font-semibold tracking-wide">Total</div>
                </div>
                <div className="grid grid-cols-[180px_1fr_110px] md:grid-cols-[220px_1fr_120px] border-t bg-white/80">
                  <div className="sticky left-0 z-10 bg-white px-3 py-1.5 font-semibold tracking-wide border-r">
                    Time
                  </div>
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `repeat(${HOURS.length}, minmax(50px, 1fr))` }}
                  >
                    {HOURS.map((h) => (
                      <div key={h} className="border-l first:border-l-0 px-2 py-1.5 text-center">
                        {hourLabel(h)}
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-1.5 text-right font-semibold text-[var(--navy)]">
                    {dayHours.toFixed(2)}
                  </div>
                </div>
              </div>

              {visibleEmployees.length === 0 ? (
                <div className="px-4 py-10 text-sm text-muted-foreground text-center">
                  Add employees on the Staff page to start rostering.
                </div>
              ) : (
                visibleEmployees.map((emp) => {
                  const empShifts = dayShifts.filter((s) => s.employee_id === emp.id);
                  const weekShifts = shifts.filter((s) => s.employee_id === emp.id);
                  const weekHours = sumHours(weekShifts);
                  const weekCost = weekHours * Number(emp.pay_rate ?? 0);
                  return (
                    <div
                      key={emp.id}
                      className="grid grid-cols-[180px_1fr_110px] md:grid-cols-[220px_1fr_120px] border-b last:border-b-0 min-h-[60px]"
                    >
                      <div className="sticky left-0 z-10 bg-white px-3 py-2 border-r flex items-center gap-2">
                        <UserAvatar name={emp.name} email={emp.email} size={32} />
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-[var(--navy)] truncate">
                            {emp.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {emp.role || "—"}
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
                          const role = emp.role || emp.department || "Shift";
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
                              className="absolute top-1 bottom-1 text-white text-xs px-2 rounded-md flex flex-col items-start justify-center overflow-hidden shadow-sm brightness-95 hover:brightness-90"
                              style={{
                                left: `${leftPct}%`,
                                width: `${widthPct}%`,
                                backgroundColor: shiftColor(role),
                              }}
                            >
                              <span className="truncate font-medium">
                                {shortTime(s.start_time)} - {shortTime(s.end_time)} ({role})
                              </span>
                              <span className="truncate opacity-80">
                                {Number(s.total_hours ?? 0).toFixed(1)}h{" "}
                                {showCost ? money(shiftCost(s, employees)) : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-col justify-center px-3 text-right text-sm font-semibold text-[var(--navy)]">
                        <span>{weekHours.toFixed(2)}</span>
                        <span className="text-xs text-muted-foreground">{money(weekCost)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 sm:px-6 lg:px-8 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-2">
          <Label>Daily Notes</Label>
          <Textarea
            rows={4}
            value={dailyNotes[dayKey] ?? ""}
            onChange={(event) => setDailyNotes({ ...dailyNotes, [dayKey]: event.target.value })}
            onBlur={() => toast.success("Daily notes saved locally")}
          />
        </div>
        {!readOnly && (
          <div className="space-y-3 self-end">
            <label className="flex items-center justify-end gap-2 text-sm">
              <input
                type="checkbox"
                checked={showCost}
                onChange={(event) => setShowCost(event.target.checked)}
              />
              Show Cost Per Shift
            </label>
            <div className="flex gap-2">
              <select
                value={copySource}
                onChange={(event) => setCopySource(event.target.value)}
                className="h-10 min-w-0 flex-1 rounded-md border bg-card px-3 text-sm"
              >
                <option value="">COPY FROM</option>
                {allRosters
                  .filter((item) => item.id !== roster.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      Week of {new Date(item.week_start).toLocaleDateString("en-AU")}
                    </option>
                  ))}
              </select>
              <Button onClick={copyFromRoster} className="bg-[var(--navy)] text-white">
                ADD <Plus className="ml-1 size-4" />
              </Button>
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={saveAsTemplate}>
              <Copy className="size-4" /> Save as Template
            </Button>
          </div>
        )}
      </div>

      {/* Shift edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit shift" : "Add shift"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
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
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
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
                <ArrowRight className="size-4" /> Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
