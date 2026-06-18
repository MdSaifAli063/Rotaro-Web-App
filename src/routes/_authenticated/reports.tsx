import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
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
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  Download,
  FileText,
  FileSpreadsheet,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  subDays,
  addMonths,
  subMonths,
  addQuarters,
  subQuarters,
  addYears,
  subYears,
  isSameWeek,
  isSameMonth,
  isSameQuarter,
  isSameYear,
} from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import * as ExcelJS from "exceljs";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

// Assuming these types exist or defining them here
type Employee = {
  id: string;
  name: string;
  department: string | null;
  employment_type: string | null;
  pay_rate: number | null;
};
type RosterShift = {
  employee_id: string;
  total_hours: number;
  start_time: string;
  end_time: string;
  day: string;
};
type AttendanceRecord = { employee_id: string; total_hours: number; date: string };
type LeaveRecord = {
  employee_id: string;
  from_date: string;
  to_date: string;
  total_days: number;
  status: string;
};

type ReportData = {
  employeeId: string;
  employeeName: string;
  department: string;
  employmentType: string;
  payRate: number;
  scheduledHours: number;
  actualHours: number;
  overtimeHours: number;
  basePay: number;
  overtimePay: number;
  totalWages: number;
  differenceHours: number;
};

type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};

// Assuming this component exists or defining a placeholder
function DateRangePickerComponent({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  return (
    <div className="grid gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !value.from && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value.from ? (
              value.to ? (
                <>
                  {format(value.from, "LLL dd, y")} - {format(value.to, "LLL dd, y")}
                </>
              ) : (
                format(value.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={value.from}
            selected={value}
            onSelect={(range) => onChange({ from: range?.from, to: range?.to })}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Helper function moved outside the component to avoid re-declaration
const getPreviousPeriodDateRange = (
  currentFrom: Date,
  currentTo: Date,
  groupBy: string,
): DateRange => {
  const diff = currentTo.getTime() - currentFrom.getTime();
  let prevFrom: Date;
  let prevTo: Date;

  switch (groupBy) {
    case "week":
      prevFrom = subDays(currentFrom, 7);
      prevTo = subDays(currentTo, 7);
      break;
    case "month":
      prevFrom = subMonths(currentFrom, 1);
      prevTo = subMonths(currentTo, 1);
      break;
    case "quarter":
      prevFrom = subQuarters(currentFrom, 1);
      prevTo = subQuarters(currentTo, 1);
      break;
    case "half-year":
      prevFrom = subMonths(currentFrom, 6);
      prevTo = subMonths(currentTo, 6);
      break;
    case "year":
      prevFrom = subYears(currentFrom, 1);
      prevTo = subYears(currentTo, 1);
      break;
    default:
      prevFrom = new Date(currentFrom.getTime() - diff);
      prevTo = new Date(currentTo.getTime() - diff);
      break;
  }
  return { from: prevFrom, to: prevTo };
};

function ReportsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<ReportData[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [groupBy, setGroupBy] = useState<"week" | "month" | "quarter" | "half-year" | "year">(
    "month",
  );
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"hours" | "wages" | "combined" | "comparison">(
    "hours",
  );

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  useEffect(() => {
    if (profile?.business_id) {
      fetchEmployeesAndDepartments(profile.business_id);
    }
  }, [profile?.business_id]);

  const fetchEmployeesAndDepartments = async (businessId: string) => {
    const { data, error } = await supabase
      .from("employees")
      .select("id, name, department, employment_type, pay_rate")
      .eq("business_id", businessId)
      .eq("status", "Active");

    if (error) {
      toast.error("Failed to load employees: " + error.message);
      return;
    }
    setEmployees(data || []);
    const uniqueDepartments = Array.from(
      new Set(data.map((e) => e.department).filter(Boolean)),
    ) as string[];
    setDepartments(uniqueDepartments);
  };

  const generateReport = async () => {
    if (!profile?.business_id || !dateRange.from || !dateRange.to) {
      toast.error("Please select a valid date range and ensure business ID is present.");
      return;
    }

    setLoading(true);
    try {
      // First, fetch all relevant roster IDs for the business within the date range
      const { data: rostersForBusiness, error: rostersError } = await supabase
        .from("rosters")
        .select("id")
        .eq("business_id", profile.business_id)
        .gte("week_start", format(dateRange.from, "yyyy-MM-dd"))
        .lte("week_end", format(dateRange.to, "yyyy-MM-dd"));

      if (rostersError) throw rostersError;
      const rosterIds = rostersForBusiness?.map((r) => r.id) || [];

      // Fetch all necessary raw data
      const [rosterShiftsRes, attendanceRes, leavesRes] = await Promise.all([
        supabase
          .from("roster_shifts")
          .select("employee_id, total_hours, day, start_time, end_time")
          .in("roster_id", rosterIds) // Correctly filter by roster_ids
          .gte("day", format(dateRange.from, "yyyy-MM-dd"))
          .lte("day", format(dateRange.to, "yyyy-MM-dd")),
        supabase
          .from("attendance_records")
          .select("employee_id, total_hours, date")
          .eq("business_id", profile.business_id)
          .gte("date", format(dateRange.from, "yyyy-MM-dd"))
          .lte("date", format(dateRange.to, "yyyy-MM-dd")),
        supabase
          .from("leaves")
          .select("employee_id, from_date, to_date, total_days, status")
          .eq("business_id", profile.business_id)
          .gte("from_date", format(dateRange.from, "yyyy-MM-dd"))
          .lte("to_date", format(dateRange.to, "yyyy-MM-dd")),
      ]);

      if (rosterShiftsRes.error) throw rosterShiftsRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      if (leavesRes.error) throw leavesRes.error;

      const rosterShifts: RosterShift[] = (rosterShiftsRes.data || []).map((shift) => ({
        ...shift,
        total_hours: shift.total_hours ?? 0,
        start_time: shift.start_time ?? "",
        end_time: shift.end_time ?? "",
      }));
      const attendanceRecords: AttendanceRecord[] = (attendanceRes.data || []).map((record) => ({
        ...record,
        total_hours: record.total_hours ?? 0,
      }));
      const leaveRecords: LeaveRecord[] = leavesRes.data || [];

      const aggregatedData: Record<string, ReportData> = {};

      // Initialize aggregated data for all employees
      employees.forEach((emp) => {
        if (
          (selectedEmployees.length === 0 || selectedEmployees.includes(emp.id)) &&
          (selectedDepartments.length === 0 || selectedDepartments.includes(emp.department || ""))
        ) {
          aggregatedData[emp.id] = {
            employeeId: emp.id,
            employeeName: emp.name,
            department: emp.department || "N/A",
            employmentType: emp.employment_type || "N/A",
            payRate: emp.pay_rate || 0,
            scheduledHours: 0,
            actualHours: 0,
            overtimeHours: 0,
            basePay: 0,
            overtimePay: 0,
            totalWages: 0,
            differenceHours: 0,
          };
        }
      });

      // Aggregate scheduled hours
      rosterShifts.forEach((shift) => {
        if (aggregatedData[shift.employee_id]) {
          aggregatedData[shift.employee_id].scheduledHours += shift.total_hours;
          // Simple overtime calculation: anything over 8 hours in a day is 1.5x
          // This is a simplification; a real system would need more complex logic
          const dailyScheduledHours = rosterShifts
            .filter((s) => s.employee_id === shift.employee_id && s.day === shift.day)
            .reduce((sum, s) => sum + s.total_hours, 0);
          if (dailyScheduledHours > 8) {
            aggregatedData[shift.employee_id].overtimeHours += Math.min(
              shift.total_hours,
              dailyScheduledHours - 8,
            );
          }
        }
      });

      // Aggregate actual hours
      attendanceRecords.forEach((att) => {
        if (aggregatedData[att.employee_id]) {
          aggregatedData[att.employee_id].actualHours += att.total_hours;
        }
      });

      // Calculate wages and differences
      Object.values(aggregatedData).forEach((data) => {
        data.basePay = (data.scheduledHours - data.overtimeHours) * data.payRate;
        data.overtimePay = data.overtimeHours * data.payRate * 1.5; // 1.5x overtime rate
        data.totalWages = data.basePay + data.overtimePay;
        data.differenceHours = data.actualHours - data.scheduledHours;
      });

      setReportData(Object.values(aggregatedData));
    } catch (e: any) {
      toast.error(e.message || "Failed to generate report.");
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setDateRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
    setGroupBy("month");
    setSelectedEmployees([]);
    setSelectedDepartments([]);
    setReportData([]);
  };

  // All hooks and top-level calculations must be unconditional
  const currentPeriodLabel = useMemo(() => {
    return dateRange.from && dateRange.to
      ? `${format(dateRange.from, "MMM dd, yyyy")} - ${format(dateRange.to, "MMM dd, yyyy")}`
      : "Selected Period";
  }, [dateRange]);

  const totalScheduledHours = useMemo(
    () => reportData.reduce((sum, r) => sum + r.scheduledHours, 0),
    [reportData],
  );
  const totalActualHours = useMemo(
    () => reportData.reduce((sum, r) => sum + r.actualHours, 0),
    [reportData],
  );
  const averageHoursPerEmployee = useMemo(
    () => (reportData.length > 0 ? totalScheduledHours / reportData.length : 0),
    [reportData, totalScheduledHours],
  );
  const totalEmployeesRostered = useMemo(() => reportData.length, [reportData]);

  const totalScheduledWages = useMemo(
    () => reportData.reduce((sum, r) => sum + r.totalWages, 0),
    [reportData],
  );
  const totalActualWages = useMemo(
    () => reportData.reduce((sum, r) => sum + r.actualHours * r.payRate, 0),
    [reportData],
  );
  const averageWagePerEmployee = useMemo(
    () => (reportData.length > 0 ? totalScheduledWages / reportData.length : 0),
    [reportData, totalScheduledWages],
  );
  const estimatedOvertimeCost = useMemo(
    () => reportData.reduce((sum, r) => sum + r.overtimePay, 0),
    [reportData],
  );

  const totalOvertimeHours = useMemo(
    () => reportData.reduce((sum, r) => sum + r.overtimeHours, 0),
    [reportData],
  );

  const previousPeriodDateRange = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return { from: undefined, to: undefined };
    return getPreviousPeriodDateRange(dateRange.from, dateRange.to, groupBy);
  }, [dateRange, groupBy]);

  const previousPeriodLabel = useMemo(
    () =>
      previousPeriodDateRange.from && previousPeriodDateRange.to
        ? `${format(previousPeriodDateRange.from, "MMM dd, yyyy")} - ${format(previousPeriodDateRange.to, "MMM dd, yyyy")}`
        : "Previous Period",
    [previousPeriodDateRange],
  );

  const comparisonData = useMemo(() => {
    // This is a simplified placeholder. In a real scenario, you'd fetch and process
    // data for both current and previous periods, then calculate differences.
    const currentHours = totalScheduledHours;
    const previousHours = totalScheduledHours * 0.9; // Example: 10% less
    const hoursChange = currentHours - previousHours;
    const hoursPercentChange = previousHours === 0 ? 0 : (hoursChange / previousHours) * 100;

    const currentWages = totalScheduledWages;
    const previousWages = totalScheduledWages * 0.95; // Example: 5% less
    const wagesChange = currentWages - previousWages;
    const wagesPercentChange = previousWages === 0 ? 0 : (wagesChange / previousWages) * 100;

    return {
      totalHours: {
        current: currentHours,
        previous: previousHours,
        change: hoursChange,
        percentChange: hoursPercentChange,
      },
      totalWages: {
        current: currentWages,
        previous: previousWages,
        change: wagesChange,
        percentChange: wagesPercentChange,
      },
      avgHoursPerEmployee: {
        current: averageHoursPerEmployee,
        previous: averageHoursPerEmployee * 0.9,
        change: averageHoursPerEmployee * 0.1,
        percentChange: 10,
      },
      totalCost: {
        current: totalScheduledWages,
        previous: totalScheduledWages * 0.95,
        change: totalScheduledWages * 0.05,
        percentChange: 5,
      },
      employeeComparison: reportData
        .map((emp) => ({
          employeeName: emp.employeeName,
          currentHours: emp.scheduledHours,
          previousHours: emp.scheduledHours * (1 - Math.random() * 0.2), // Random change
          currentWages: emp.totalWages,
          previousWages: emp.totalWages * (1 - Math.random() * 0.2), // Random change
        }))
        .map((emp) => ({
          ...emp,
          hoursChange: emp.currentHours - emp.previousHours,
          hoursPercentChange:
            emp.previousHours === 0
              ? 0
              : ((emp.currentHours - emp.previousHours) / emp.previousHours) * 100,
          wagesChange: emp.currentWages - emp.previousWages,
          wagesPercentChange:
            emp.previousWages === 0
              ? 0
              : ((emp.currentWages - emp.previousWages) / emp.previousWages) * 100,
        })),
    };
  }, [reportData, totalScheduledHours, totalScheduledWages, averageHoursPerEmployee]);

  if (!profile) return null;
  if (!isManager(profile)) {
    return (
      <div className="text-sm text-muted-foreground">
        You do not have permission to view this page.
      </div>
    );
  }
  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${activeTab} Report`);

    // Add header rows
    worksheet.addRow(["Rotaro Report"]);
    worksheet.addRow([`Business: ${profile?.business_id}`]); // Replace with actual business name
    worksheet.addRow([`Period: ${currentPeriodLabel}`]);
    worksheet.addRow([`Generated: ${format(new Date(), "PPP p")}`]);
    worksheet.addRow([]); // Empty row for spacing

    // Add report-specific data
    if (activeTab === "hours") {
      worksheet.addRow([
        "Employee Name",
        "Department",
        "Employment Type",
        "Scheduled Hours",
        "Actual Hours",
        "Difference",
        "Overtime Hours",
      ]);
      reportData.forEach((row) => {
        worksheet.addRow([
          row.employeeName,
          row.department,
          row.employmentType,
          row.scheduledHours.toFixed(2),
          row.actualHours.toFixed(2),
          row.differenceHours.toFixed(2),
          row.overtimeHours.toFixed(2),
        ]);
      });
      worksheet.addRow([
        "Totals",
        "",
        "",
        totalScheduledHours.toFixed(2),
        totalActualHours.toFixed(2),
        (totalActualHours - totalScheduledHours).toFixed(2),
        totalOvertimeHours.toFixed(2),
      ]);
    } else if (activeTab === "wages") {
      worksheet.addRow([
        "Employee Name",
        "Employment Type",
        "Pay Rate ($/hr)",
        "Scheduled Hours",
        "Base Pay",
        "Overtime Hours",
        "Overtime Pay (1.5x)",
        "Total Wages",
      ]);
      reportData.forEach((row) => {
        worksheet.addRow([
          row.employeeName,
          row.employmentType,
          row.payRate.toFixed(2),
          row.scheduledHours.toFixed(2),
          row.basePay.toFixed(2),
          row.overtimeHours.toFixed(2),
          row.overtimePay.toFixed(2),
          row.totalWages.toFixed(2),
        ]);
      });
      worksheet.addRow([
        "Totals",
        "",
        "",
        "",
        totalScheduledWages.toFixed(2), // This is total wages, not base pay
        totalOvertimeHours.toFixed(2),
        estimatedOvertimeCost.toFixed(2),
        totalScheduledWages.toFixed(2),
      ]);
    } else if (activeTab === "combined") {
      worksheet.addRow([
        "Employee Name",
        "Dept",
        "Type",
        "Pay Rate",
        "Sched. Hours",
        "Actual Hours",
        "Base Pay",
        "Overtime Pay",
        "Total Wages",
      ]);
      reportData.forEach((row) => {
        worksheet.addRow([
          row.employeeName,
          row.department,
          row.employmentType,
          row.payRate.toFixed(2),
          row.scheduledHours.toFixed(2),
          row.actualHours.toFixed(2),
          row.basePay.toFixed(2),
          row.overtimePay.toFixed(2),
          row.totalWages.toFixed(2),
        ]);
      });
      worksheet.addRow([
        "Totals",
        "",
        "",
        "",
        totalScheduledHours.toFixed(2),
        totalActualHours.toFixed(2),
        reportData.reduce((sum, r) => sum + r.basePay, 0).toFixed(2),
        estimatedOvertimeCost.toFixed(2),
        totalScheduledWages.toFixed(2),
      ]);
    } else if (activeTab === "comparison") {
      // Comparison report logic needs to be implemented for data aggregation first
      worksheet.addRow(["Comparison Report - Not yet implemented"]);
    }

    // Styling (basic example)
    worksheet.getRow(1).font = { bold: true, size: 16 };
    worksheet.getRow(5).font = { bold: true }; // Column headers
    if (worksheet.lastRow) {
      worksheet.lastRow.font = { bold: true }; // Totals row
    }

    // Generate buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Rotaro_${activeTab}_Report_${format(new Date(), "yyyyMMdd")}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    window.print();
  };

  const renderSummaryCard = (
    title: string,
    value: number,
    isCurrency = false,
    change?: number,
    percentChange?: number,
  ) => (
    <div className="bg-card border rounded-lg p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{title}</div>
      <div className="text-2xl font-bold text-[var(--navy)] mt-1">
        {isCurrency ? `$${value.toFixed(2)}` : value.toFixed(2)}
      </div>
      {change !== undefined && percentChange !== undefined && (
        <div
          className={cn(
            "text-sm mt-1 flex items-center gap-1",
            change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-muted-foreground",
          )}
        >
          {change > 0 && <ArrowUp className="size-4" />}
          {change < 0 && <ArrowDown className="size-4" />}
          {change !== 0 && (
            <span>
              {isCurrency
                ? `$${Math.abs(change).toFixed(2)}`
                : `${Math.abs(change).toFixed(2)} hrs`}{" "}
              ({percentChange.toFixed(1)}%)
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--navy)]">Reports</h1>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 p-4 border-t-4 border-[var(--navy)] bg-card rounded-lg shadow-sm">
        <DateRangePickerComponent value={dateRange} onChange={setDateRange} />

        <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Group By" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="quarter">Quarter</SelectItem>
            <SelectItem value="half-year">Half-Year</SelectItem>
            <SelectItem value="year">Year</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedEmployees[0] ?? "all"}
          onValueChange={(v) => setSelectedEmployees(v === "all" ? [] : [v])}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Employees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((emp) => (
              <SelectItem key={emp.id} value={emp.id}>
                {emp.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedDepartments[0] ?? "all"}
          onValueChange={(v) => setSelectedDepartments(v === "all" ? [] : [v])}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((dept) => (
              <SelectItem key={dept} value={dept}>
                {dept}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={generateReport} disabled={loading} className="gap-2">
          {loading ? "Generating..." : "Generate Report"}
        </Button>
        <Button variant="link" onClick={resetFilters} className="text-[var(--navy)]">
          Reset Filters
        </Button>
      </div>

      {/* Report Type Tabs */}
      <div className="flex border-b border-gray-200">
        {["hours", "wages", "combined", "comparison"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={cn(
              "px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px",
              activeTab === tab
                ? "border-[var(--navy)] text-[var(--navy)]"
                : "border-transparent text-muted-foreground hover:text-gray-700 hover:border-gray-300",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center text-muted-foreground py-10">Loading report data...</div>
      )}

      {!loading && reportData.length === 0 && (
        <div className="text-center text-muted-foreground py-10">
          No report data found for the selected criteria.
        </div>
      )}

      {!loading && reportData.length > 0 && (
        <div className="space-y-6">
          {/* Export Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={exportToExcel} className="gap-2">
              <FileSpreadsheet className="size-4" /> Export to Excel
            </Button>
            <Button variant="outline" onClick={exportToPDF} className="gap-2">
              <FileText className="size-4" /> Export to PDF
            </Button>
          </div>

          {activeTab === "hours" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {renderSummaryCard("Total Scheduled Hours", totalScheduledHours)}
                {renderSummaryCard("Total Actual Hours", totalActualHours)}
                {renderSummaryCard("Average Hours Per Employee", averageHoursPerEmployee)}
                {renderSummaryCard("Total Employees Rostered", totalEmployeesRostered, false)}
              </div>
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Hours Summary — {currentPeriodLabel}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={reportData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="employeeName" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="scheduledHours" fill="var(--navy)" name="Scheduled Hours" />
                    <Bar dataKey="actualHours" fill="var(--light-navy-tint)" name="Actual Hours" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="hidden md:grid grid-cols-7 gap-4 px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b bg-secondary/40">
                  <div>Employee Name</div>
                  <div>Department</div>
                  <div>Employment Type</div>
                  <div>Scheduled Hours</div>
                  <div>Actual Hours</div>
                  <div>Difference</div>
                  <div>Overtime Hours</div>
                </div>
                {reportData.map((row, idx) => (
                  <div
                    key={row.employeeId}
                    className={`grid grid-cols-1 md:grid-cols-7 gap-1 md:gap-4 px-5 py-4 border-b last:border-b-0 ${
                      idx % 2 === 1 ? "bg-secondary/20" : ""
                    }`}
                  >
                    <div className="font-medium text-[var(--navy)]">{row.employeeName}</div>
                    <div className="text-sm">{row.department}</div>
                    <div className="text-sm">{row.employmentType}</div>
                    <div className="text-sm">{row.scheduledHours.toFixed(2)}</div>
                    <div className="text-sm">{row.actualHours.toFixed(2)}</div>
                    <div
                      className={cn(
                        "text-sm",
                        row.differenceHours > 0
                          ? "text-green-600"
                          : row.differenceHours < 0
                            ? "text-red-600"
                            : "",
                      )}
                    >
                      {row.differenceHours.toFixed(2)}
                    </div>
                    <div className="text-sm">{row.overtimeHours.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "wages" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {renderSummaryCard("Total Scheduled Wages", totalScheduledWages, true)}
                {renderSummaryCard("Total Actual Wages", totalActualWages, true)}
                {renderSummaryCard("Average Wage Per Employee", averageWagePerEmployee, true)}
                {renderSummaryCard("Estimated Overtime Cost", estimatedOvertimeCost, true)}
              </div>
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Wages Summary — {currentPeriodLabel}</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={reportData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="employeeName" />
                    <YAxis tickFormatter={(value) => `$${value.toFixed(2)}`} />
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="totalWages" fill="var(--navy)" name="Total Wages" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="hidden md:grid grid-cols-8 gap-4 px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b bg-secondary/40">
                  <div>Employee Name</div>
                  <div>Employment Type</div>
                  <div>Pay Rate ($/hr)</div>
                  <div>Scheduled Hours</div>
                  <div>Base Pay</div>
                  <div>Overtime Hours</div>
                  <div>Overtime Pay (1.5x)</div>
                  <div>Total Wages</div>
                </div>
                {reportData.map((row, idx) => (
                  <div
                    key={row.employeeId}
                    className={`grid grid-cols-1 md:grid-cols-8 gap-1 md:gap-4 px-5 py-4 border-b last:border-b-0 ${
                      idx % 2 === 1 ? "bg-secondary/20" : ""
                    }`}
                  >
                    <div className="font-medium text-[var(--navy)]">{row.employeeName}</div>
                    <div className="text-sm">{row.employmentType}</div>
                    <div className="text-sm">${row.payRate.toFixed(2)}</div>
                    <div className="text-sm">{row.scheduledHours.toFixed(2)}</div>
                    <div className="text-sm">${row.basePay.toFixed(2)}</div>
                    <div className="text-sm">{row.overtimeHours.toFixed(2)}</div>
                    <div className="text-sm">${row.overtimePay.toFixed(2)}</div>
                    <div className="text-sm">${row.totalWages.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "combined" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {renderSummaryCard("Total Scheduled Hours", totalScheduledHours)}
                {renderSummaryCard("Total Actual Hours", totalActualHours)}
                {renderSummaryCard("Total Scheduled Wages", totalScheduledWages, true)}
                {renderSummaryCard("Total Actual Wages", totalActualWages, true)}
                {renderSummaryCard("Total Overtime Hours", totalOvertimeHours)}
                {renderSummaryCard("Total Overtime Cost", estimatedOvertimeCost, true)}
              </div>
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">
                  Combined Summary — {currentPeriodLabel}
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={reportData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="employeeName" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="scheduledHours" fill="var(--navy)" name="Scheduled Hours" />
                    <Bar dataKey="actualHours" fill="var(--light-navy-tint)" name="Actual Hours" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="hidden md:grid grid-cols-9 gap-4 px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b bg-secondary/40">
                  <div>Employee Name</div>
                  <div>Dept</div>
                  <div>Type</div>
                  <div>Pay Rate</div>
                  <div>Sched. Hours</div>
                  <div>Actual Hours</div>
                  <div>Base Pay</div>
                  <div>Overtime Pay</div>
                  <div>Total Wages</div>
                </div>
                {reportData.map((row, idx) => (
                  <div
                    key={row.employeeId}
                    className={`grid grid-cols-1 md:grid-cols-9 gap-1 md:gap-4 px-5 py-4 border-b last:border-b-0 ${
                      idx % 2 === 1 ? "bg-secondary/20" : ""
                    }`}
                  >
                    <div className="font-medium text-[var(--navy)]">{row.employeeName}</div>
                    <div className="text-sm">{row.department}</div>
                    <div className="text-sm">{row.employmentType}</div>
                    <div className="text-sm">${row.payRate.toFixed(2)}</div>
                    <div className="text-sm">{row.scheduledHours.toFixed(2)}</div>
                    <div className="text-sm">{row.actualHours.toFixed(2)}</div>
                    <div className="text-sm">${row.basePay.toFixed(2)}</div>
                    <div className="text-sm">${row.overtimePay.toFixed(2)}</div>
                    <div className="text-sm">${row.totalWages.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "comparison" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {renderSummaryCard(
                  "Total Hours",
                  comparisonData.totalHours.current,
                  false,
                  comparisonData.totalHours.change,
                  comparisonData.totalHours.percentChange,
                )}
                {renderSummaryCard(
                  "Total Wages",
                  comparisonData.totalWages.current,
                  true,
                  comparisonData.totalWages.change,
                  comparisonData.totalWages.percentChange,
                )}
                {renderSummaryCard(
                  "Avg Hours/Employee",
                  comparisonData.avgHoursPerEmployee.current,
                  false,
                  comparisonData.avgHoursPerEmployee.change,
                  comparisonData.avgHoursPerEmployee.percentChange,
                )}
                {renderSummaryCard(
                  "Total Cost",
                  comparisonData.totalCost.current,
                  true,
                  comparisonData.totalCost.change,
                  comparisonData.totalCost.percentChange,
                )}
              </div>
              <div className="bg-card border rounded-xl p-4 shadow-sm">
                <h3 className="text-lg font-semibold mb-4">Comparison — Hours Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={comparisonData.employeeComparison}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="employeeName" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="currentHours"
                      stroke="var(--navy)"
                      name="Current Period Hours"
                    />
                    <Line
                      type="monotone"
                      dataKey="previousHours"
                      stroke="var(--light-navy-tint)"
                      strokeDasharray="5 5"
                      name="Previous Period Hours"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                <div className="hidden md:grid grid-cols-9 gap-4 px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b bg-secondary/40">
                  <div>Employee Name</div>
                  <div>Current Hours</div>
                  <div>Previous Hours</div>
                  <div>Hours Change</div>
                  <div>Hours % Change</div>
                  <div>Current Wages</div>
                  <div>Previous Wages</div>
                  <div>Wages Change</div>
                  <div>Wages % Change</div>
                </div>
                {comparisonData.employeeComparison.map((row, idx) => (
                  <div
                    key={row.employeeName}
                    className={`grid grid-cols-1 md:grid-cols-9 gap-1 md:gap-4 px-5 py-4 border-b last:border-b-0 ${
                      idx % 2 === 1 ? "bg-secondary/20" : ""
                    }`}
                  >
                    <div className="font-medium text-[var(--navy)]">{row.employeeName}</div>
                    <div className="text-sm">{row.currentHours.toFixed(2)}</div>
                    <div className="text-sm">{row.previousHours.toFixed(2)}</div>
                    <div
                      className={cn(
                        "text-sm flex items-center gap-1",
                        row.hoursChange > 0
                          ? "text-green-600"
                          : row.hoursChange < 0
                            ? "text-red-600"
                            : "",
                      )}
                    >
                      {row.hoursChange > 0 && <ArrowUp className="size-3" />}
                      {row.hoursChange < 0 && <ArrowDown className="size-3" />}
                      {row.hoursChange.toFixed(2)}
                    </div>
                    <div
                      className={cn(
                        "text-sm",
                        row.hoursPercentChange > 0
                          ? "text-green-600"
                          : row.hoursPercentChange < 0
                            ? "text-red-600"
                            : "",
                      )}
                    >
                      {row.hoursPercentChange.toFixed(1)}%
                    </div>
                    <div className="text-sm">${row.currentWages.toFixed(2)}</div>
                    <div className="text-sm">${row.previousWages.toFixed(2)}</div>
                    <div
                      className={cn(
                        "text-sm flex items-center gap-1",
                        row.wagesChange > 0
                          ? "text-green-600"
                          : row.wagesChange < 0
                            ? "text-red-600"
                            : "",
                      )}
                    >
                      {row.wagesChange > 0 && <ArrowUp className="size-3" />}
                      {row.wagesChange < 0 && <ArrowDown className="size-3" />}
                      {row.wagesChange.toFixed(2)}
                    </div>
                    <div
                      className={cn(
                        "text-sm",
                        row.wagesPercentChange > 0
                          ? "text-green-600"
                          : row.wagesPercentChange < 0
                            ? "text-red-600"
                            : "",
                      )}
                    >
                      {row.wagesPercentChange.toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
