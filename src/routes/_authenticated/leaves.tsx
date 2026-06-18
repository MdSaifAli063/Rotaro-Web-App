import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
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
  reason: string | null;
  status: string;
  created_at: string;
  employees?: EmployeeSummary | null;
};

function LeavesPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<LeaveRow[]>([]);

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
      await load(nextProfile);
    })();
  }, []);

  const load = async (nextProfile = profile) => {
    let query = supabase.from("leaves").select("*").order("created_at", { ascending: false });

    if (nextProfile?.business_id) {
      query = query.eq("business_id", nextProfile.business_id);
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
  };

  const decide = async (row: LeaveRow, status: "Approved" | "Rejected") => {
    const { error } = await supabase.from("leaves").update({ status }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (row.employees?.user_id) {
      await notify({
        userId: row.employees.user_id,
        businessId: profile?.business_id,
        type: "leave_" + status.toLowerCase(),
        message: `Your ${row.leave_type} leave was ${status.toLowerCase()}.`,
      });
    }
    toast.success(`Leave ${status.toLowerCase()}`);
    load();
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
                  <td className="px-4 py-3 font-medium">{r.employees?.name ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{r.leave_type}</td>
                  <td className="px-4 py-3">{r.from_date}</td>
                  <td className="px-4 py-3">{r.to_date}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                    {r.reason ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        r.status === "Pending"
                          ? "bg-secondary text-[var(--navy)]"
                          : r.status === "Approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {r.status === "Pending" && (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => decide(r, "Rejected")}>
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => decide(r, "Approved")}
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
