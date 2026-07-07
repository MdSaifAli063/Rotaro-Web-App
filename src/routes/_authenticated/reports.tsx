import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { PlanGate } from "@/components/PlanGate";

export const Route = createFileRoute("/_authenticated/reports")({ component: ReportsPage });

type GroupBy = "day" | "week" | "month" | "quarter" | "half_year" | "year";
type ReportKind = "hours" | "wages" | "combined" | "comparison" | "attendance";
type Employee = {
  id: string;
  name: string;
  employee_code: string | null;
  department: string | null;
  employment_type: string | null;
  pay_rate: number | null;
};
type ReportRow = {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  employment_type: string;
  pay_rate: number;
  period_label: string;
  scheduled_hours: number;
  actual_hours: number;
  difference: number;
  shift_count: number;
  base_pay: number;
  overtime_hours: number;
  overtime_pay: number;
  total_wages: number;
};
type AttendanceRow = {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  total_days: number;
  total_hours: number;
  on_time_count: number;
  late_count: number;
  early_leave_count: number;
  absent_count: number;
  attendance_rate: number;
};
type ComparisonRow = {
  employee_id: string;
  employee_name: string;
  department: string;
  current_hours: number;
  previous_hours: number;
  hours_change: number;
  hours_change_pct: number;
  current_wages: number;
  previous_wages: number;
  wages_change: number;
  wages_change_pct: number;
};
type ReportResult = {
  kind: ReportKind;
  rows: ReportRow[];
  attendanceRows?: AttendanceRow[];
  comparisonRows?: ComparisonRow[];
  periods: string[];
  summary: Record<string, number>;
};
type ValidationErrors = Partial<Record<"start" | "end" | "previousStart" | "previousEnd", string>>;

const NAVY = "#1E2A45";
const NAVY_MID = "#4A6080";
const NAVY_SOFT = "#8FA5BF";
const now = new Date();
const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

function ReportsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [businessName, setBusinessName] = useState("Rotaro Business");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [previousStart, setPreviousStart] = useState(shiftDate(defaultStart, -30));
  const [previousEnd, setPreviousEnd] = useState(shiftDate(defaultEnd, -30));
  const [groupBy, setGroupBy] = useState<GroupBy>("month");
  const [department, setDepartment] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [loading, setLoading] = useState<ReportKind | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [comparisonMetric, setComparisonMetric] = useState<"hours" | "wages">("hours");

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
      if (!nextProfile?.business_id) return;
      const [{ data: employeeRows }, { data: business }] = await Promise.all([
        supabase
          .from("employees")
          .select("id, name, employee_code, department, employment_type, pay_rate")
          .eq("business_id", nextProfile.business_id)
          .order("name"),
        supabase.from("businesses").select("name").eq("id", nextProfile.business_id).maybeSingle(),
      ]);
      setEmployees((employeeRows ?? []) as Employee[]);
      setBusinessName(business?.name || "Rotaro Business");
    })();
  }, []);

  const departments = useMemo(
    () =>
      Array.from(
        new Set(employees.map((employee) => employee.department).filter(Boolean)),
      ) as string[],
    [employees],
  );

  if (!profile) return null;
  if (!isManager(profile))
    return (
      <div className="text-sm text-muted-foreground">
        You do not have permission to view this page.
      </div>
    );

  const validateRange = (includePrevious = false) => {
    const next: ValidationErrors = {};
    validateDates(startDate, endDate, next, "start", "end");
    if (includePrevious)
      validateDates(previousStart, previousEnd, next, "previousStart", "previousEnd");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const generate = async (kind: ReportKind) => {
    if (!profile.business_id || !validateRange(kind === "comparison")) return;
    setLoading(kind);
    try {
      const current = await buildReport(profile.business_id, employees, {
        startDate,
        endDate,
        groupBy,
        employeeId,
        department,
      });
      if (kind === "comparison") {
        const previous = await buildReport(profile.business_id, employees, {
          startDate: previousStart,
          endDate: previousEnd,
          groupBy,
          employeeId,
          department,
        });
        setResult(buildComparisonResult(current, previous));
      } else if (kind === "attendance") {
        setResult(
          await buildAttendanceReport(profile.business_id, employees, {
            startDate,
            endDate,
            employeeId,
            department,
          }),
        );
      } else setResult({ ...current, kind });
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const exportReport = async (kind: ReportKind, format: "excel" | "pdf") => {
    if (!result || !hasRows(result)) {
      toast.error("No data available for export.");
      return;
    }
    if (format === "pdf") exportPdf(kind, result, { businessName, startDate, endDate, groupBy });
    else await exportExcel(kind, result, { businessName, startDate, endDate, groupBy });
  };

  const rosterExport = async (format: "excel" | "pdf") => {
    if (!profile.business_id || !validateRange()) return;
    const roster = await buildRosterExport(profile.business_id, employees, startDate, endDate);
    if (!roster.length) {
      toast.error("No data available for export.");
      return;
    }
    const fakeResult: ReportResult = {
      kind: "combined",
      rows: roster as any,
      periods: [],
      summary: {},
    };
    if (format === "pdf")
      exportPdf(
        "combined",
        fakeResult,
        { businessName, startDate, endDate, groupBy: "week" },
        "Roster",
      );
    else
      await exportExcel(
        "combined",
        fakeResult,
        { businessName, startDate, endDate, groupBy: "week" },
        "Roster",
      );
  };
  return (
    <PlanGate
      businessId={profile.business_id}
      required="professional"
      title="Reports are a Professional feature"
      description="Hours, wages, comparison reports, roster exports, and PDF downloads are available on Professional and Business plans."
    >
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="text-sm text-muted-foreground">
            <span className="text-[var(--navy)]">Operations</span> /{" "}
            <span className="font-semibold text-[var(--navy)]">Reports</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Reports</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Hours, wages, attendance summaries, and exports.
            </p>
          </div>
        </header>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--navy)]">Date range</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <Field label="Start" error={errors.start}>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Field>
            <Field label="End" error={errors.end}>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Field>
            <Field label="Group By">
              <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="half_year">Half-Year</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="border-[var(--navy)] text-[var(--navy)]"
                onClick={() => rosterExport("excel")}
              >
                Roster Excel
              </Button>
              <Button
                variant="outline"
                className="border-[var(--navy)] text-[var(--navy)]"
                onClick={() => rosterExport("pdf")}
              >
                Roster PDF
              </Button>
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Employee">
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <ReportActionCard
            title="Hours report"
            loading={loading === "hours"}
            onGenerate={() => generate("hours")}
            onExcel={() => exportReport("hours", "excel")}
            onPdf={() => exportReport("hours", "pdf")}
          />
          <ReportActionCard
            title="Wages report"
            loading={loading === "wages"}
            onGenerate={() => generate("wages")}
            onExcel={() => exportReport("wages", "excel")}
            onPdf={() => exportReport("wages", "pdf")}
          />
        </div>
        {result?.kind === "hours" && (
          <StandardResults
            kind="hours"
            result={result}
            onExcel={() => exportReport("hours", "excel")}
            onPdf={() => exportReport("hours", "pdf")}
          />
        )}
        {result?.kind === "wages" && (
          <StandardResults
            kind="wages"
            result={result}
            onExcel={() => exportReport("wages", "excel")}
            onPdf={() => exportReport("wages", "pdf")}
          />
        )}

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--navy)]">Combined (hours + wages)</h2>
          <Button
            className="mt-4 bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
            disabled={loading === "combined"}
            onClick={() => generate("combined")}
          >
            {loading === "combined" && <Loader2 className="mr-2 size-4 animate-spin" />} Generate
            combined
          </Button>
        </section>
        {result?.kind === "combined" && (
          <StandardResults
            kind="combined"
            result={result}
            onExcel={() => exportReport("combined", "excel")}
            onPdf={() => exportReport("combined", "pdf")}
          />
        )}

        <section className="rounded-lg border bg-white p-5 shadow-sm lg:w-1/2">
          <h2 className="text-lg font-bold text-[var(--navy)]">Comparison vs previous period</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Previous Start" error={errors.previousStart}>
              <Input
                type="date"
                value={previousStart}
                onChange={(e) => setPreviousStart(e.target.value)}
              />
            </Field>
            <Field label="Previous End" error={errors.previousEnd}>
              <Input
                type="date"
                value={previousEnd}
                onChange={(e) => setPreviousEnd(e.target.value)}
              />
            </Field>
          </div>
          <Button
            className="mt-4 bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
            disabled={loading === "comparison"}
            onClick={() => generate("comparison")}
          >
            {loading === "comparison" && <Loader2 className="mr-2 size-4 animate-spin" />} Compare
          </Button>
        </section>
        {result?.kind === "comparison" && (
          <ComparisonResults
            result={result}
            metric={comparisonMetric}
            setMetric={setComparisonMetric}
            startDate={startDate}
            endDate={endDate}
            previousStart={previousStart}
            previousEnd={previousEnd}
            onExcel={() => exportReport("comparison", "excel")}
            onPdf={() => exportReport("comparison", "pdf")}
          />
        )}

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--navy)]">Attendance summary</h2>
          <Button
            variant="outline"
            className="mt-4 border-[var(--navy)] text-[var(--navy)]"
            disabled={loading === "attendance"}
            onClick={() => generate("attendance")}
          >
            {loading === "attendance" && <Loader2 className="mr-2 size-4 animate-spin" />} Generate
          </Button>
        </section>
        {result?.kind === "attendance" && (
          <AttendanceResults
            result={result}
            onExcel={() => exportReport("attendance", "excel")}
            onPdf={() => exportReport("attendance", "pdf")}
          />
        )}
      </div>
    </PlanGate>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold uppercase tracking-wide text-[var(--navy)]/75">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
function ReportActionCard({
  title,
  loading,
  onGenerate,
  onExcel,
  onPdf,
}: {
  title: string;
  loading: boolean;
  onGenerate: () => void;
  onExcel: () => void;
  onPdf: () => void;
}) {
  return (
    <section className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-[var(--navy)]">{title}</h2>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Button
          className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
          disabled={loading}
          onClick={onGenerate}
        >
          {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
          {loading ? "Generating..." : "Generate"}
        </Button>
        <button
          className="text-sm font-medium text-[var(--navy)] underline-offset-4 hover:underline"
          onClick={onExcel}
        >
          Excel
        </button>
        <button
          className="text-sm font-medium text-[var(--navy)] underline-offset-4 hover:underline"
          onClick={onPdf}
        >
          PDF
        </button>
      </div>
    </section>
  );
}

function StandardResults({
  kind,
  result,
  onExcel,
  onPdf,
}: {
  kind: ReportKind;
  result: ReportResult;
  onExcel: () => void;
  onPdf: () => void;
}) {
  const rows = result.rows;
  const chart = periodChart(rows);
  const summary = result.summary;
  const title =
    kind === "hours" ? "Hours Report" : kind === "wages" ? "Wages Report" : "Combined Report";
  return (
    <section className="space-y-5 rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-[var(--navy)]">{title} Results</h2>
      <SummaryGrid items={summaryItems(kind, summary)} />
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <ChartBlock>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip formatter={(v: any) => (typeof v === "number" ? v.toFixed(2) : v)} />
                <Legend />
                {kind !== "wages" && <Bar dataKey="scheduled" fill={NAVY} name="Scheduled Hours" />}
                {kind !== "wages" && <Bar dataKey="actual" fill={NAVY_MID} name="Actual Hours" />}
                {kind !== "hours" && <Bar dataKey="wages" fill={NAVY} name="Total Wages" />}
              </BarChart>
            </ResponsiveContainer>
          </ChartBlock>
          <ReportTable kind={kind} rows={rows} />
        </>
      )}
      <ExportRow onExcel={onExcel} onPdf={onPdf} disabled={!rows.length} />
    </section>
  );
}

function ReportTable({ kind, rows }: { kind: ReportKind; rows: ReportRow[] }) {
  const headers =
    kind === "wages"
      ? [
          "Employee",
          "Dept",
          "Type",
          "Pay Rate",
          "Period",
          "Total Hours",
          "Base Pay",
          "OT Hours",
          "OT Pay",
          "Total Wages",
        ]
      : kind === "combined"
        ? [
            "Employee",
            "Dept",
            "Pay Rate",
            "Period",
            "Sched Hrs",
            "Actual Hrs",
            "Hrs Diff",
            "Base Pay",
            "OT Pay",
            "Total Wages",
          ]
        : [
            "Employee",
            "Dept",
            "Type",
            "Period",
            "Scheduled Hrs",
            "Actual Hrs",
            "Difference",
            "Shifts",
          ];
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-secondary text-left">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.employee_id}-${r.period_label}`} className="border-t hover:bg-[#F3F6FA]">
              <td className="sticky left-0 bg-inherit px-4 py-3 font-medium text-[var(--navy)]">
                {r.employee_name}
              </td>
              <td className="px-4 py-3">{r.department}</td>
              {kind === "wages" ? (
                <>
                  <td className="px-4 py-3">{r.employment_type}</td>
                  <td className="px-4 py-3">{money(r.pay_rate)}</td>
                  <td className="px-4 py-3">{r.period_label}</td>
                  <td className="px-4 py-3">{num(r.scheduled_hours)}</td>
                  <td className="px-4 py-3">{money(r.base_pay)}</td>
                  <td className="px-4 py-3">{num(r.overtime_hours)}</td>
                  <td className="px-4 py-3">{money(r.overtime_pay)}</td>
                  <td className="px-4 py-3 font-medium">{money(r.total_wages)}</td>
                </>
              ) : kind === "combined" ? (
                <>
                  <td className="px-4 py-3">{money(r.pay_rate)}</td>
                  <td className="px-4 py-3">{r.period_label}</td>
                  <td className="px-4 py-3">{num(r.scheduled_hours)}</td>
                  <td className="px-4 py-3">{num(r.actual_hours)}</td>
                  <td className="px-4 py-3">{signed(r.difference)}</td>
                  <td className="px-4 py-3">{money(r.base_pay)}</td>
                  <td className="px-4 py-3">{money(r.overtime_pay)}</td>
                  <td className="px-4 py-3 font-medium">{money(r.total_wages)}</td>
                </>
              ) : (
                <>
                  <td className="px-4 py-3">{r.employment_type}</td>
                  <td className="px-4 py-3">{r.period_label}</td>
                  <td className="px-4 py-3">{num(r.scheduled_hours)}</td>
                  <td className="px-4 py-3">{num(r.actual_hours)}</td>
                  <td className="px-4 py-3">{signed(r.difference)}</td>
                  <td className="px-4 py-3">{r.shift_count}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttendanceResults({
  result,
  onExcel,
  onPdf,
}: {
  result: ReportResult;
  onExcel: () => void;
  onPdf: () => void;
}) {
  const rows = result.attendanceRows ?? [];
  return (
    <section className="space-y-5 rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-[var(--navy)]">Attendance Summary</h2>
      <SummaryGrid items={summaryItems("attendance", result.summary)} />
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                {[
                  "Employee",
                  "Dept",
                  "Days",
                  "Hours",
                  "On Time",
                  "Late",
                  "Early Leave",
                  "Absent",
                  "Rate",
                ].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id} className="border-t">
                  <td className="px-4 py-3 font-medium text-[var(--navy)]">{r.employee_name}</td>
                  <td className="px-4 py-3">{r.department}</td>
                  <td className="px-4 py-3">{r.total_days}</td>
                  <td className="px-4 py-3">{num(r.total_hours)}</td>
                  <td className="px-4 py-3">{r.on_time_count}</td>
                  <td className="px-4 py-3">{r.late_count}</td>
                  <td className="px-4 py-3">{r.early_leave_count}</td>
                  <td className="px-4 py-3">{r.absent_count}</td>
                  <td className="px-4 py-3">{num(r.attendance_rate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ExportRow onExcel={onExcel} onPdf={onPdf} disabled={!rows.length} />
    </section>
  );
}

function ComparisonResults({
  result,
  metric,
  setMetric,
  startDate,
  endDate,
  previousStart,
  previousEnd,
  onExcel,
  onPdf,
}: {
  result: ReportResult;
  metric: "hours" | "wages";
  setMetric: (value: "hours" | "wages") => void;
  startDate: string;
  endDate: string;
  previousStart: string;
  previousEnd: string;
  onExcel: () => void;
  onPdf: () => void;
}) {
  const rows = result.comparisonRows ?? [];
  const data = rows.map((row) => ({
    name: row.employee_name,
    current: metric === "hours" ? row.current_hours : row.current_wages,
    previous: metric === "hours" ? row.previous_hours : row.previous_wages,
  }));
  return (
    <section className="space-y-5 rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--navy)]">Comparison Results</h2>
          <p className="text-sm text-muted-foreground">
            {previousStart} - {previousEnd} vs {startDate} - {endDate}
          </p>
        </div>
        <Select value={metric} onValueChange={(value) => setMetric(value as "hours" | "wages")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hours">Hours</SelectItem>
            <SelectItem value="wages">Wages</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <SummaryGrid items={summaryItems("comparison", result.summary)} />
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <>
          <ChartBlock>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: any) => (typeof v === "number" ? v.toFixed(2) : v)} />
                <Legend />
                <Line dataKey="previous" stroke={NAVY_SOFT} name="Previous" strokeWidth={2} />
                <Line dataKey="current" stroke={NAVY} name="Current" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-secondary text-left">
                <tr>
                  {[
                    "Employee",
                    "Dept",
                    "Current Hours",
                    "Previous Hours",
                    "Hours Change",
                    "Current Wages",
                    "Previous Wages",
                    "Wages Change",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee_id} className="border-t">
                    <td className="px-4 py-3 font-medium text-[var(--navy)]">{r.employee_name}</td>
                    <td className="px-4 py-3">{r.department}</td>
                    <td className="px-4 py-3">{num(r.current_hours)}</td>
                    <td className="px-4 py-3">{num(r.previous_hours)}</td>
                    <td className="px-4 py-3">
                      {signed(r.hours_change)} ({signed(r.hours_change_pct)}%)
                    </td>
                    <td className="px-4 py-3">{money(r.current_wages)}</td>
                    <td className="px-4 py-3">{money(r.previous_wages)}</td>
                    <td className="px-4 py-3">
                      {money(r.wages_change)} ({signed(r.wages_change_pct)}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <ExportRow onExcel={onExcel} onPdf={onPdf} disabled={!rows.length} />
    </section>
  );
}

function SummaryGrid({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border bg-[#F8FAFC] p-4">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-2xl font-bold text-[var(--navy)]">{item.value}</p>
        </div>
      ))}
    </div>
  );
}
function ChartBlock({ children }: { children: React.ReactNode }) {
  return <div className="h-[320px] rounded-lg border bg-white p-4">{children}</div>;
}
function Empty() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      No matching data found for this report.
    </div>
  );
}
function ExportRow({
  onExcel,
  onPdf,
  disabled,
}: {
  onExcel: () => void;
  onPdf: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" disabled={disabled} onClick={onExcel}>
        <Download className="mr-2 size-4" /> Export Excel
      </Button>
      <Button variant="outline" disabled={disabled} onClick={onPdf}>
        <Download className="mr-2 size-4" /> Export PDF
      </Button>
    </div>
  );
}

async function buildReport(
  businessId: string,
  employees: Employee[],
  opts: {
    startDate: string;
    endDate: string;
    groupBy: GroupBy;
    employeeId: string;
    department: string;
  },
): Promise<ReportResult> {
  const selected = filterEmployees(employees, opts.employeeId, opts.department);
  const map = new Map(selected.map((employee) => [employee.id, employee]));
  const rosterResponse = await supabase
    .from("rosters")
    .select("id")
    .eq("business_id", businessId)
    .lte("week_start", opts.endDate)
    .gte("week_end", opts.startDate);
  if (rosterResponse.error) throw rosterResponse.error;
  const rosterIds = (rosterResponse.data ?? []).map((roster) => roster.id);
  const shiftsResponse = rosterIds.length
    ? await supabase
        .from("roster_shifts")
        .select("id, employee_id, day, total_hours")
        .in("roster_id", rosterIds)
        .gte("day", opts.startDate)
        .lte("day", opts.endDate)
    : { data: [], error: null };
  const attendanceResponse = await supabase
    .from("attendance_records")
    .select("employee_id, date, total_hours")
    .eq("business_id", businessId)
    .gte("date", opts.startDate)
    .lte("date", opts.endDate);
  if (shiftsResponse.error) throw shiftsResponse.error;
  if (attendanceResponse.error) throw attendanceResponse.error;
  const buckets = new Map<string, ReportRow>();
  for (const shift of shiftsResponse.data ?? []) {
    if (!shift.employee_id || !map.has(shift.employee_id)) continue;
    const employee = map.get(shift.employee_id)!;
    const period = periodLabel(shift.day, opts.groupBy);
    const row = ensureRow(buckets, employee, period);
    row.scheduled_hours += Number(shift.total_hours ?? 0);
    row.shift_count += 1;
  }
  for (const attendance of attendanceResponse.data ?? []) {
    if (!attendance.employee_id || !map.has(attendance.employee_id)) continue;
    const employee = map.get(attendance.employee_id)!;
    const period = periodLabel(attendance.date, opts.groupBy);
    const row = ensureRow(buckets, employee, period);
    row.actual_hours += Number(attendance.total_hours ?? 0);
  }
  const rows = Array.from(buckets.values()).map(finalizeRow).sort(sortReportRows);
  return {
    kind: "combined",
    rows,
    periods: Array.from(new Set(rows.map((row) => row.period_label))),
    summary: summarizeRows(rows),
  };
}

async function buildAttendanceReport(
  businessId: string,
  employees: Employee[],
  opts: { startDate: string; endDate: string; employeeId: string; department: string },
): Promise<ReportResult> {
  const selected = filterEmployees(employees, opts.employeeId, opts.department);
  const map = new Map(selected.map((employee) => [employee.id, employee]));
  const response = await supabase
    .from("attendance_records")
    .select("employee_id, date, total_hours, status")
    .eq("business_id", businessId)
    .gte("date", opts.startDate)
    .lte("date", opts.endDate);
  if (response.error) throw response.error;
  const buckets = new Map<string, AttendanceRow>();
  for (const record of response.data ?? []) {
    if (!record.employee_id || !map.has(record.employee_id)) continue;
    const employee = map.get(record.employee_id)!;
    const row = buckets.get(employee.id) ?? {
      employee_id: employee.id,
      employee_name: employee.name,
      employee_code: employee.employee_code ?? "",
      department: employee.department ?? "Unassigned",
      total_days: 0,
      total_hours: 0,
      on_time_count: 0,
      late_count: 0,
      early_leave_count: 0,
      absent_count: 0,
      attendance_rate: 0,
    };
    row.total_days += 1;
    row.total_hours += Number(record.total_hours ?? 0);
    const status = String(record.status ?? "").toLowerCase();
    if (status.includes("late")) row.late_count += 1;
    else if (status.includes("early")) row.early_leave_count += 1;
    else if (status.includes("absent")) row.absent_count += 1;
    else row.on_time_count += 1;
    buckets.set(employee.id, row);
  }
  const rows = Array.from(buckets.values())
    .map((row) => ({
      ...row,
      attendance_rate: row.total_days
        ? ((row.on_time_count + row.early_leave_count) / row.total_days) * 100
        : 0,
    }))
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  return {
    kind: "attendance",
    rows: [],
    attendanceRows: rows,
    periods: [],
    summary: {
      employees: rows.length,
      days: sum(rows, "total_days"),
      hours: sum(rows, "total_hours"),
      attendanceRate: average(rows.map((row) => row.attendance_rate)),
    },
  };
}

function buildComparisonResult(current: ReportResult, previous: ReportResult): ReportResult {
  const previousMap = new Map<string, ReportRow>();
  for (const row of previous.rows) {
    const existing = previousMap.get(row.employee_id);
    previousMap.set(row.employee_id, existing ? mergeRows(existing, row) : { ...row });
  }
  const currentMap = new Map<string, ReportRow>();
  for (const row of current.rows) {
    const existing = currentMap.get(row.employee_id);
    currentMap.set(row.employee_id, existing ? mergeRows(existing, row) : { ...row });
  }
  const ids = Array.from(new Set([...currentMap.keys(), ...previousMap.keys()]));
  const rows = ids
    .map((id) => {
      const c = currentMap.get(id);
      const p = previousMap.get(id);
      const employee_name = c?.employee_name ?? p?.employee_name ?? "Unknown";
      const department = c?.department ?? p?.department ?? "Unassigned";
      const current_hours = c?.scheduled_hours ?? 0;
      const previous_hours = p?.scheduled_hours ?? 0;
      const current_wages = c?.total_wages ?? 0;
      const previous_wages = p?.total_wages ?? 0;
      return {
        employee_id: id,
        employee_name,
        department,
        current_hours,
        previous_hours,
        hours_change: current_hours - previous_hours,
        hours_change_pct: percentChange(current_hours, previous_hours),
        current_wages,
        previous_wages,
        wages_change: current_wages - previous_wages,
        wages_change_pct: percentChange(current_wages, previous_wages),
      };
    })
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  return {
    kind: "comparison",
    rows: [],
    comparisonRows: rows,
    periods: [],
    summary: {
      currentHours: sum(rows, "current_hours"),
      previousHours: sum(rows, "previous_hours"),
      currentWages: sum(rows, "current_wages"),
      previousWages: sum(rows, "previous_wages"),
    },
  };
}

async function buildRosterExport(
  businessId: string,
  employees: Employee[],
  startDate: string,
  endDate: string,
) {
  const result = await buildReport(businessId, employees, {
    startDate,
    endDate,
    groupBy: "week",
    employeeId: "all",
    department: "all",
  });
  return result.rows;
}

function filterEmployees(employees: Employee[], employeeId: string, department: string) {
  return employees.filter(
    (employee) =>
      (employeeId === "all" || employee.id === employeeId) &&
      (department === "all" || employee.department === department),
  );
}
function ensureRow(map: Map<string, ReportRow>, employee: Employee, period: string) {
  const key = `${employee.id}:${period}`;
  const existing = map.get(key);
  if (existing) return existing;
  const row: ReportRow = {
    employee_id: employee.id,
    employee_name: employee.name,
    employee_code: employee.employee_code ?? "",
    department: employee.department ?? "Unassigned",
    employment_type: employee.employment_type ?? "Employee",
    pay_rate: Number(employee.pay_rate ?? 0),
    period_label: period,
    scheduled_hours: 0,
    actual_hours: 0,
    difference: 0,
    shift_count: 0,
    base_pay: 0,
    overtime_hours: 0,
    overtime_pay: 0,
    total_wages: 0,
  };
  map.set(key, row);
  return row;
}
function finalizeRow(row: ReportRow) {
  const regularHours = Math.min(row.scheduled_hours, row.shift_count * 8);
  row.overtime_hours = Math.max(row.scheduled_hours - regularHours, 0);
  row.base_pay = regularHours * row.pay_rate;
  row.overtime_pay = row.overtime_hours * row.pay_rate * 1.5;
  row.total_wages = row.base_pay + row.overtime_pay;
  row.difference = row.actual_hours - row.scheduled_hours;
  return row;
}
function mergeRows(a: ReportRow, b: ReportRow) {
  return finalizeRow({
    ...a,
    scheduled_hours: a.scheduled_hours + b.scheduled_hours,
    actual_hours: a.actual_hours + b.actual_hours,
    shift_count: a.shift_count + b.shift_count,
  });
}
function summarizeRows(rows: ReportRow[]) {
  return {
    employees: new Set(rows.map((row) => row.employee_id)).size,
    scheduledHours: sum(rows, "scheduled_hours"),
    actualHours: sum(rows, "actual_hours"),
    totalWages: sum(rows, "total_wages"),
    overtimeHours: sum(rows, "overtime_hours"),
  };
}
function periodChart(rows: ReportRow[]) {
  return Array.from(
    rows
      .reduce((map, row) => {
        const item = map.get(row.period_label) ?? {
          period: row.period_label,
          scheduled: 0,
          actual: 0,
          wages: 0,
        };
        item.scheduled += row.scheduled_hours;
        item.actual += row.actual_hours;
        item.wages += row.total_wages;
        map.set(row.period_label, item);
        return map;
      }, new Map<string, { period: string; scheduled: number; actual: number; wages: number }>())
      .values(),
  );
}
function summaryItems(kind: ReportKind, summary: Record<string, number>) {
  if (kind === "attendance")
    return [
      { label: "Employees", value: String(summary.employees ?? 0) },
      { label: "Attendance Days", value: num(summary.days ?? 0) },
      { label: "Total Hours", value: num(summary.hours ?? 0) },
      { label: "Attendance Rate", value: `${num(summary.attendanceRate ?? 0)}%` },
    ];
  if (kind === "comparison")
    return [
      { label: "Current Hours", value: num(summary.currentHours ?? 0) },
      { label: "Previous Hours", value: num(summary.previousHours ?? 0) },
      { label: "Current Wages", value: money(summary.currentWages ?? 0) },
      { label: "Previous Wages", value: money(summary.previousWages ?? 0) },
    ];
  return [
    { label: "Employees", value: String(summary.employees ?? 0) },
    { label: "Scheduled Hours", value: num(summary.scheduledHours ?? 0) },
    { label: "Actual Hours", value: num(summary.actualHours ?? 0) },
    {
      label: kind === "hours" ? "Overtime Hours" : "Total Wages",
      value: kind === "hours" ? num(summary.overtimeHours ?? 0) : money(summary.totalWages ?? 0),
    },
  ];
}
function validateDates(
  start: string,
  end: string,
  errors: ValidationErrors,
  startKey: keyof ValidationErrors,
  endKey: keyof ValidationErrors,
) {
  if (!start) errors[startKey] = "Required";
  if (!end) errors[endKey] = "Required";
  if (start && end && start > end) errors[endKey] = "End must be after start";
}
function hasRows(result: ReportResult) {
  return (
    result.rows.length > 0 ||
    Boolean(result.attendanceRows?.length) ||
    Boolean(result.comparisonRows?.length)
  );
}
function sortReportRows(a: ReportRow, b: ReportRow) {
  return (
    a.period_label.localeCompare(b.period_label) || a.employee_name.localeCompare(b.employee_name)
  );
}
function periodLabel(value: string, groupBy: GroupBy) {
  const date = new Date(`${value}T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (groupBy === "day") return value;
  if (groupBy === "week") return `${year}-W${String(getWeekNumber(date)).padStart(2, "0")}`;
  if (groupBy === "month") return `${year}-${String(month).padStart(2, "0")}`;
  if (groupBy === "quarter") return `${year} Q${Math.ceil(month / 3)}`;
  if (groupBy === "half_year") return `${year} H${month <= 6 ? 1 : 2}`;
  return String(year);
}
function getWeekNumber(date: Date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil(((copy.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
function sum<T extends Record<string, any>>(rows: T[], key: keyof T) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}
function average(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
function percentChange(current: number, previous: number) {
  return previous ? ((current - previous) / previous) * 100 : current ? 100 : 0;
}
function num(value: number) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function signed(value: number) {
  return `${value > 0 ? "+" : ""}${num(value)}`;
}

async function exportExcel(
  kind: ReportKind,
  result: ReportResult,
  meta: { businessName: string; startDate: string; endDate: string; groupBy: GroupBy },
  title = reportTitle(kind),
) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title);
  const rows = exportRows(kind, result);
  sheet.addRow([title]);
  sheet.addRow([
    meta.businessName,
    `${meta.startDate} - ${meta.endDate}`,
    `Grouped by ${meta.groupBy}`,
  ]);
  sheet.addRow([]);
  if (rows.length) {
    sheet.addRow(Object.keys(rows[0]));
    rows.forEach((row) => sheet.addRow(Object.values(row)));
  }
  sheet.columns.forEach((column) => {
    column.width = 18;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer]), `${title.toLowerCase().replaceAll(" ", "-")}.xlsx`);
}

function exportPdf(
  kind: ReportKind,
  result: ReportResult,
  meta: { businessName: string; startDate: string; endDate: string; groupBy: GroupBy },
  title = reportTitle(kind),
) {
  const rows = exportRows(kind, result);
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  const body = rows
    .map(
      (row) =>
        `<tr>${headers.map((header) => `<td>${String(row[header] ?? "")}</td>`).join("")}</tr>`,
    )
    .join("");
  const html = `<html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;color:#1E2A45;padding:24px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #d7dde7;padding:8px;text-align:left}th{background:#eef2f7}</style></head><body><h1>${title}</h1><p>${meta.businessName} | ${meta.startDate} - ${meta.endDate} | Grouped by ${meta.groupBy}</p><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table><script>window.print()</script></body></html>`;
  const popup = window.open("", "_blank");
  if (!popup) {
    toast.error("Popup blocked. Please allow popups to export PDF.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
}

function exportRows(kind: ReportKind, result: ReportResult): Record<string, string | number>[] {
  if (kind === "attendance")
    return (result.attendanceRows ?? []).map((row) => ({
      Employee: row.employee_name,
      Department: row.department,
      Days: row.total_days,
      Hours: num(row.total_hours),
      "On Time": row.on_time_count,
      Late: row.late_count,
      "Early Leave": row.early_leave_count,
      Absent: row.absent_count,
      "Attendance Rate": `${num(row.attendance_rate)}%`,
    }));
  if (kind === "comparison")
    return (result.comparisonRows ?? []).map((row) => ({
      Employee: row.employee_name,
      Department: row.department,
      "Current Hours": num(row.current_hours),
      "Previous Hours": num(row.previous_hours),
      "Hours Change": num(row.hours_change),
      "Current Wages": money(row.current_wages),
      "Previous Wages": money(row.previous_wages),
      "Wages Change": money(row.wages_change),
    }));
  return result.rows.map((row) => ({
    Employee: row.employee_name,
    Department: row.department,
    Type: row.employment_type,
    Period: row.period_label,
    "Scheduled Hours": num(row.scheduled_hours),
    "Actual Hours": num(row.actual_hours),
    Difference: num(row.difference),
    Shifts: row.shift_count,
    "Pay Rate": money(row.pay_rate),
    "Base Pay": money(row.base_pay),
    "Overtime Hours": num(row.overtime_hours),
    "Overtime Pay": money(row.overtime_pay),
    "Total Wages": money(row.total_wages),
  }));
}

function reportTitle(kind: ReportKind) {
  return kind === "hours"
    ? "Hours Report"
    : kind === "wages"
      ? "Wages Report"
      : kind === "attendance"
        ? "Attendance Report"
        : kind === "comparison"
          ? "Comparison Report"
          : "Combined Report";
}
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
