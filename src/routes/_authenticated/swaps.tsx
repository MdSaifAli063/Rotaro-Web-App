import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { findEmployeeForUser } from "@/lib/employee";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/swaps")({
  component: SwapsPage,
});

type EmployeeSummary = {
  id: string;
  name: string | null;
  department: string | null;
  user_id: string | null;
};

type SwapRow = {
  id: string;
  business_id: string;
  requester_employee_id: string;
  requester_shift_id: string | null;
  target_employee_id: string;
  target_shift_id: string | null;
  note: string | null;
  status: string;
  created_at: string;
  requester?: EmployeeSummary | null;
  target?: EmployeeSummary | null;
};

function SwapsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<SwapRow[]>([]);

  const load = useCallback(async (nextProfile: Profile | null) => {
    if (!nextProfile) return;
    let query = supabase.from("shift_swaps").select("*").order("created_at", { ascending: false });

    if (nextProfile.business_id) {
      query = query.eq("business_id", nextProfile.business_id);
    }

    if (!isManager(nextProfile)) {
      const { employee, error: employeeError } = await findEmployeeForUser<{ id: string }>(
        nextProfile.id,
        "id",
      );
      if (employeeError) {
        toast.error("Failed to load your employee record: " + employeeError.message);
        setRows([]);
        return;
      }
      if (!employee?.id) {
        setRows([]);
        return;
      }
      query = query.or(
        `requester_employee_id.eq.${employee.id},target_employee_id.eq.${employee.id}`,
      );
    }

    const { data, error } = await query;
    if (error) {
      toast.error("Failed to load shift swaps: " + error.message);
      setRows([]);
      return;
    }

    const swaps = (data ?? []) as SwapRow[];
    const employeeIds = Array.from(
      new Set(swaps.flatMap((swap) => [swap.requester_employee_id, swap.target_employee_id])),
    ).filter(Boolean);
    const { data: employees, error: employeesError } = employeeIds.length
      ? await supabase
          .from("employees")
          .select("id, name, department, user_id")
          .in("id", employeeIds)
      : { data: [], error: null };

    if (employeesError) {
      toast.error("Failed to load swap employee details: " + employeesError.message);
      setRows(swaps);
      return;
    }

    const employeesById = new Map(
      ((employees ?? []) as EmployeeSummary[]).map((employee) => [employee.id, employee]),
    );
    setRows(
      swaps.map((swap) => ({
        ...swap,
        requester: employeesById.get(swap.requester_employee_id) ?? null,
        target: employeesById.get(swap.target_employee_id) ?? null,
      })),
    );
  }, []);

  useEffect(() => {
    (async () => {
      const p = await fetchProfile();
      setProfile(p);
      await load(p);
    })();
  }, [load]);

  const decide = async (row: SwapRow, status: "approved" | "rejected") => {
    const { error } = await supabase.from("shift_swaps").update({ status }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (status === "approved" && row.requester_shift_id && row.target_shift_id) {
      // swap employee_id on the two shifts
      await supabase
        .from("roster_shifts")
        .update({ employee_id: row.target_employee_id })
        .eq("id", row.requester_shift_id);
      await supabase
        .from("roster_shifts")
        .update({ employee_id: row.requester_employee_id })
        .eq("id", row.target_shift_id);
    }
    // notify both
    const { data: reqUser } = await supabase
      .from("employees")
      .select("user_id")
      .eq("id", row.requester_employee_id)
      .maybeSingle();
    if (reqUser?.user_id)
      await notify({
        userId: reqUser.user_id,
        businessId: profile?.business_id,
        type: "swap_" + status,
        message: `Your shift swap request was ${status}.`,
      }).catch((notifyError) => {
        console.error(notifyError);
        toast.error("Swap updated, but requester notification could not be sent.");
      });
    toast.success(`Swap ${status}`);
    load(profile);
  };

  if (!profile) return null;

  const canManage = isManager(profile);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shift Swaps</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {canManage ? "Review and approve shift swap requests." : "Your shift swap requests."}
        </p>
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Requester</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Note</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Created</th>
              {canManage && <th className="px-4 py-3 font-medium text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No swap requests yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{r.requester?.name ?? "-"}</td>
                  <td className="px-4 py-3">{r.target?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.note ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-1 rounded-full capitalize ${
                        r.status === "pending"
                          ? "bg-secondary text-[var(--navy)]"
                          : r.status === "approved"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      {r.status === "pending" && (
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
