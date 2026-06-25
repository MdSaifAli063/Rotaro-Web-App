import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { findEmployeeForUser } from "@/lib/employee";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/leaves")({
  component: LeavesPage,
});

type EmployeeSummary = {
  id: string;
  name: string | null;
  department: string | null;
  user_id: string | null;
};

type LeaveRow = {
  id: string;
  business_id: string;
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_days?: number | null;
  reason: string | null;
  status: string;
  created_at: string;
  employees?: EmployeeSummary | null;
};

const lower = (value?: string | null) => String(value ?? "").toLowerCase();

const statusLabel = (value?: string | null) =>
  (value || "pending").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const leaveDays = (row: Pick<LeaveRow, "from_date" | "to_date" | "total_days">) => {
  if (row.total_days && Number(row.total_days) > 0) return Number(row.total_days);
  const start = new Date(`${row.from_date}T00:00:00`);
  const end = new Date(`${row.to_date}T00:00:00`);
  return Math.max(Math.floor((end.getTime() - start.getTime()) / 86400000) + 1, 1);
};

const defaultLeaveTotal = (type: string) => {
  const value = lower(type);
  if (value.includes("annual")) return 20;
  if (value.includes("sick")) return 10;
  if (value.includes("casual")) return 5;
  return 0;
};

function LeavesPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<LeaveRow[]>([]);

  const load = useCallback(async (nextProfile: Profile | null) => {
    let query = supabase.from("leaves").select("*").order("created_at", { ascending: false });

    if (nextProfile?.business_id) {
      query = query.eq("business_id", nextProfile.business_id);
    }

    if (nextProfile && !isManager(nextProfile)) {
      const { employee, error: employeeError } = await findEmployeeForUser<{ id: string }>(
        nextProfile.id,
        "id",
      );
      if (employeeError) {
        toast.error("Failed to load your employee record: " + employeeError.message);
        setRows([]);
        return;
      }
      query = employee?.id ? query.eq("employee_id", employee.id) : query.eq("employee_id", "");
    }

    const { data: leaves, error } = await query;
    if (error) {
      toast.error("Failed to load leave requests: " + error.message);
      setRows([]);
      return;
    }

    const employeeIds = Array.from(new Set((leaves ?? []).map((leave) => leave.employee_id)));
    const { data: employees, error: empError } = employeeIds.length
      ? await supabase
          .from("employees")
          .select("id, name, department, user_id")
          .in("id", employeeIds)
      : { data: [], error: null };

    if (empError) {
      toast.error("Failed to load employee details: " + empError.message);
      setRows((leaves ?? []) as LeaveRow[]);
      return;
    }

    const employeesById = new Map((employees ?? []).map((employee) => [employee.id, employee]));
    setRows(
      ((leaves ?? []) as LeaveRow[]).map((leave) => ({
        ...leave,
        employees: employeesById.get(leave.employee_id) ?? null,
      })),
    );
  }, []);

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
      await load(nextProfile);
    })();
  }, [load]);

  useEffect(() => {
    if (!profile?.business_id) return;
    const channel = supabase
      .channel(`leaves:${profile.business_id}:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leaves",
          filter: `business_id=eq.${profile.business_id}`,
        },
        () => load(profile),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_balances",
          filter: `business_id=eq.${profile.business_id}`,
        },
        () => load(profile),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, profile]);

  const adjustLeaveBalance = async (row: LeaveRow, nextStatus: "approved" | "rejected") => {
    const previousStatus = lower(row.status);
    const days = leaveDays(row);
    let delta = 0;

    if (nextStatus === "approved" && previousStatus !== "approved") delta = days;
    if (nextStatus === "rejected" && previousStatus === "approved") delta = -days;
    if (!delta) return;

    const { data: balances, error: balanceError } = await supabase
      .from("leave_balances")
      .select("*")
      .eq("business_id", row.business_id)
      .eq("employee_id", row.employee_id);
    if (balanceError) throw balanceError;

    const balance = (balances ?? []).find((item) => {
      const balanceType = lower(item.leave_type);
      const requestType = lower(row.leave_type);
      return balanceType.includes(requestType) || requestType.includes(balanceType);
    });

    if (balance) {
      const used_days = Math.max(Number(balance.used_days ?? 0) + delta, 0);
      const { error } = await supabase
        .from("leave_balances")
        .update({ used_days })
        .eq("id", balance.id);
      if (error) throw error;
      return;
    }

    if (delta > 0) {
      const { error } = await supabase.from("leave_balances").insert({
        business_id: row.business_id,
        employee_id: row.employee_id,
        leave_type: row.leave_type,
        total_days: defaultLeaveTotal(row.leave_type),
        used_days: delta,
      });
      if (error) throw error;
    }
  };

  const decide = async (row: LeaveRow, status: "approved" | "rejected") => {
    try {
      await adjustLeaveBalance(row, status);
    } catch (error: any) {
      toast.error("Failed to update leave balance: " + (error.message ?? "Unknown error"));
      return;
    }

    const { error } = await supabase.from("leaves").update({ status }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (row.employees?.user_id) {
      await notify({
        userId: row.employees.user_id,
        businessId: profile?.business_id,
        type: "leave_" + status,
        message: `Your ${row.leave_type} leave was ${status}.`,
        relatedId: row.id,
      });
    }
    toast.success(`Leave ${status}`);
    load(profile);
  };

  if (!profile) return null;
  const canManage = isManager(profile);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Requests</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {canManage ? "Approve or reject employee leave." : "Your leave history."}
        </p>
      </div>
      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">From</th>
              <th className="px-4 py-3 font-medium">To</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No leave requests.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.employees?.name ?? "-"}</td>
                  <td className="px-4 py-3 capitalize">{r.leave_type}</td>
                  <td className="px-4 py-3">{r.from_date}</td>
                  <td className="px-4 py-3">{r.to_date}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                    {r.reason ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        lower(r.status) === "pending"
                          ? "bg-secondary text-[var(--navy)]"
                          : lower(r.status) === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {lower(r.status) === "pending" && (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => decide(r, "rejected")}>
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => decide(r, "approved")}
                            className="bg-[var(--navy)] hover:bg-[var(--navy-light)]"
                          >
                            Approve
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
