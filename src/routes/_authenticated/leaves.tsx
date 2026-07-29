import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Textarea } from "@/components/ui/textarea";
import { PlanGate } from "@/components/PlanGate";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Send, Trash2, UserRoundPlus, XCircle } from "lucide-react";
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
  employee_code?: string | null;
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

type ManagerLeaveForm = {
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
};

const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Unpaid"];
const todayKey = new Date().toISOString().slice(0, 10);

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
  const [team, setTeam] = useState<EmployeeSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ManagerLeaveForm>({
    employee_id: "",
    leave_type: "Annual",
    from_date: todayKey,
    to_date: todayKey,
    reason: "",
  });

  const load = useCallback(async (nextProfile: Profile | null) => {
    let query = supabase
      .from("leaves")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

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

    const managerView = nextProfile ? isManager(nextProfile) : false;
    const employeeIds = Array.from(new Set((leaves ?? []).map((leave) => leave.employee_id)));
    const employeeQuery =
      managerView && nextProfile?.business_id
        ? supabase
            .from("employees")
            .select("id, name, department, employee_code, user_id")
            .eq("business_id", nextProfile.business_id)
            .order("name", { ascending: true })
            .limit(1000)
        : employeeIds.length
          ? supabase
              .from("employees")
              .select("id, name, department, employee_code, user_id")
              .in("id", employeeIds)
          : null;

    const { data: employees, error: empError } = employeeQuery
      ? await employeeQuery
      : { data: [], error: null };

    if (empError) {
      toast.error("Failed to load employee details: " + empError.message);
      setRows((leaves ?? []) as LeaveRow[]);
      return;
    }

    if (managerView) {
      const staff = (employees ?? []) as EmployeeSummary[];
      setTeam(staff);
      setForm((current) => ({
        ...current,
        employee_id: current.employee_id || staff[0]?.id || "",
      }));
    } else {
      setTeam([]);
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

    await applyLeaveBalanceDelta(row.business_id, row.employee_id, row.leave_type, delta);
  };

  const submitForEmployee = async () => {
    if (submitting) return;
    if (!profile?.business_id || !isManager(profile)) return;
    const target = team.find((employee) => employee.id === form.employee_id);
    if (!target) {
      toast.error("Please choose an employee");
      return;
    }
    const days = leaveDays({
      from_date: form.from_date,
      to_date: form.to_date,
      total_days: null,
    });
    if (!form.from_date || !form.to_date || new Date(form.to_date) < new Date(form.from_date)) {
      toast.error("Please choose a valid leave date range");
      return;
    }
    if (!form.reason.trim() && lower(form.leave_type) !== "casual") {
      toast.error("Please add a short note for this leave");
      return;
    }

    setSubmitting(true);
    try {
      const { data: leave, error } = await supabase
        .from("leaves")
        .insert({
          business_id: profile.business_id,
          employee_id: target.id,
          user_id: target.user_id ?? profile.id,
          leave_type: form.leave_type,
          from_date: form.from_date,
          to_date: form.to_date,
          start_date: form.from_date,
          end_date: form.to_date,
          total_days: days,
          reason: form.reason.trim() || null,
          status: "pending",
        })
        .select("id")
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      const { error: approvalError } = await supabase.rpc("manage_leave_request", {
        p_leave_id: leave.id,
        p_action: "approved",
      });
      if (approvalError) {
        toast.error("Leave was created, but could not be approved: " + approvalError.message);
        return;
      }
      toast.success(`Leave added for ${target.name ?? "employee"}`);
      setForm({
        employee_id: target.id,
        leave_type: "Annual",
        from_date: todayKey,
        to_date: todayKey,
        reason: "",
      });

      if (target.user_id) {
        await notify({
          userId: target.user_id,
          businessId: profile.business_id,
          type: "leave_approved",
          message: `${profile.name} added ${form.leave_type} leave for you (${form.from_date} to ${form.to_date}).`,
          relatedId: leave.id,
        }).catch((notifyError) => {
          console.error(notifyError);
          toast.error("Leave saved, but employee notification could not be sent.");
        });
      }

      await load(profile);
    } finally {
      setSubmitting(false);
    }
  };

  const applyLeaveBalanceDelta = async (
    businessId: string,
    employeeId: string,
    leaveType: string,
    delta: number,
  ) => {
    if (lower(leaveType) === "unpaid") return;
    const { data: balances, error: balanceError } = await supabase
      .from("leave_balances")
      .select("*")
      .eq("business_id", businessId)
      .eq("employee_id", employeeId);
    if (balanceError) throw balanceError;

    const balance = (balances ?? []).find((item) => {
      const balanceType = lower(item.leave_type);
      const requestType = lower(leaveType);
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
      const { error } = await supabase.from("leave_balances").upsert(
        {
          business_id: businessId,
          employee_id: employeeId,
          leave_type: leaveType,
          total_days: defaultLeaveTotal(leaveType),
          used_days: delta,
        },
        {
          onConflict: "employee_id,leave_type",
          ignoreDuplicates: false,
        },
      );
      if (error) throw error;
    }
  };

  const decide = async (row: LeaveRow, status: "approved" | "rejected") => {
    const { error } = await supabase.rpc("manage_leave_request", {
      p_leave_id: row.id,
      p_action: status,
    });
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
      }).catch((notifyError) => {
        console.error(notifyError);
        toast.error("Leave updated, but employee notification could not be sent.");
      });
    }
    toast.success(`Leave ${status}`);
    load(profile);
  };

  const deleteLeave = async (row: LeaveRow) => {
    const { error } = await supabase.rpc("manage_leave_request", {
      p_leave_id: row.id,
      p_action: "delete",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Leave request deleted");
    load(profile);
  };

  if (!profile) return null;
  const canManage = isManager(profile);
  return (
    <PlanGate
      businessId={profile.business_id}
      required="professional"
      title="Leave Management is a Professional feature"
      description="Employee leave requests, manager approvals, leave balances, and approval notifications are included with Professional and Business plans."
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm font-semibold text-primary">Workforce</div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-[var(--navy)]">Leave</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {canManage
                ? "Review, approve, and submit employee leave requests."
                : "Track your leave requests and approval status."}
            </p>
          </div>
          {canManage && (
            <div className="rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
              <div className="font-semibold text-[var(--navy)]">{rows.length}</div>
              <div className="text-muted-foreground">requests in view</div>
            </div>
          )}
        </header>

        {canManage && (
          <section className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-start gap-3 border-b p-5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-[var(--navy)]">
                <UserRoundPlus className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[var(--navy)]">
                  Submit leave for an employee
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Employer-created leave is approved immediately and updates the employee balance.
                </p>
              </div>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Employee" className="xl:col-span-2">
                <Select
                  value={form.employee_id}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, employee_id: value }))
                  }
                  disabled={team.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {team.map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {[employee.name, employee.employee_code].filter(Boolean).join(" - ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Leave type">
                <Select
                  value={form.leave_type}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, leave_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="rounded-lg border bg-[#F8FAFD] p-4 text-sm">
                <div className="font-medium text-muted-foreground">Approval</div>
                <div className="mt-2 flex items-center gap-2 font-semibold text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  Approved on submit
                </div>
              </div>
              <Field label="Start">
                <Input
                  type="date"
                  value={form.from_date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      from_date: event.target.value,
                      to_date:
                        new Date(event.target.value) > new Date(current.to_date)
                          ? event.target.value
                          : current.to_date,
                    }))
                  }
                />
              </Field>
              <Field label="End">
                <Input
                  type="date"
                  min={form.from_date}
                  value={form.to_date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, to_date: event.target.value }))
                  }
                />
              </Field>
              <Field label="Notes" className="md:col-span-2">
                <Textarea
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reason: event.target.value }))
                  }
                  rows={3}
                  placeholder="Add the reason or manager note..."
                />
              </Field>
              <div className="flex items-end md:col-span-2 xl:col-span-4">
                <Button
                  onClick={submitForEmployee}
                  disabled={submitting || team.length === 0}
                  className="w-full bg-[var(--navy)] hover:bg-[var(--navy-light)] sm:w-auto"
                >
                  {submitting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 size-4" />
                  )}
                  Submit leave
                </Button>
              </div>
            </div>
          </section>
        )}

        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-col gap-1 border-b p-5">
            <h2 className="text-xl font-semibold text-[var(--navy)]">Leave requests</h2>
            <p className="text-sm text-muted-foreground">
              Updates from employees and managers appear here in realtime.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-secondary/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-semibold">Employee</th>
                  <th className="px-5 py-3 font-semibold">Type</th>
                  <th className="px-5 py-3 font-semibold">From</th>
                  <th className="px-5 py-3 font-semibold">To</th>
                  <th className="px-5 py-3 font-semibold">Reason</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  {canManage && <th className="px-5 py-3 text-right font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? 7 : 6}
                      className="px-5 py-12 text-center text-muted-foreground"
                    >
                      No leave requests.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-5 py-3 font-semibold text-[var(--navy)]">
                        {r.employees?.name ?? "-"}
                        <div className="text-xs font-normal text-muted-foreground">
                          {r.employees?.department ?? r.employees?.employee_code ?? ""}
                        </div>
                      </td>
                      <td className="px-5 py-3 capitalize">{r.leave_type}</td>
                      <td className="px-5 py-3">{r.from_date}</td>
                      <td className="px-5 py-3">{r.to_date}</td>
                      <td className="max-w-xs truncate px-5 py-3 text-muted-foreground">
                        {r.reason ?? "-"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            lower(r.status) === "pending"
                              ? "bg-amber-50 text-amber-700"
                              : lower(r.status) === "approved"
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {lower(r.status) === "approved" && <CheckCircle2 className="size-3.5" />}
                          {(lower(r.status) === "rejected" || lower(r.status) === "declined") && (
                            <XCircle className="size-3.5" />
                          )}
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            {lower(r.status) === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => decide(r, "rejected")}
                                >
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => decide(r, "approved")}
                                  className="bg-[var(--navy)] hover:bg-[var(--navy-light)]"
                                >
                                  Approve
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => deleteLeave(r)}
                            >
                              <Trash2 className="mr-1 size-4" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </PlanGate>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
