import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, isAfter, isBefore, parseISO } from "date-fns";
import {
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Send,
  Trash2,
  UsersRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PlanGate } from "@/components/PlanGate";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { findEmployeeForUser } from "@/lib/employee";
import { notify, notifyManagers } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/apply-leave")({
  component: ApplyLeavePage,
});

type EmployeeRow = {
  id: string;
  business_id: string;
  employee_code: string | null;
  name: string;
  department: string | null;
  user_id: string | null;
};

type BalanceRow = {
  id: string;
  leave_type: string;
  total_days: number;
  used_days: number;
};

type LeaveRow = {
  id: string;
  business_id: string;
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_days: number;
  reason: string | null;
  status: string;
  created_at: string;
};

type LeaveForm = {
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
};

type ManagerLeaveForm = {
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
};

const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Unpaid"];
const todayKey = format(new Date(), "yyyy-MM-dd");
const defaultLeaveSettings = {
  autoApproveLeave: false,
  autoApproveByType: {} as Record<string, boolean>,
};

const defaultLeaveTotal = (type: string) => {
  const value = type.toLowerCase();
  if (value.includes("annual")) return 20;
  if (value.includes("sick")) return 10;
  if (value.includes("casual")) return 5;
  return 0;
};

function ApplyLeavePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [team, setTeam] = useState<EmployeeRow[]>([]);
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [history, setHistory] = useState<LeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [managerSubmitting, setManagerSubmitting] = useState(false);
  const [leaveSettings, setLeaveSettings] = useState(defaultLeaveSettings);
  const [form, setForm] = useState<LeaveForm>({
    leave_type: "Annual",
    from_date: todayKey,
    to_date: todayKey,
    reason: "",
  });
  const [managerForm, setManagerForm] = useState<ManagerLeaveForm>({
    employee_id: "",
    leave_type: "Annual",
    from_date: todayKey,
    to_date: todayKey,
    reason: "",
  });

  const canManage = profile ? isManager(profile) : false;

  const selectedBalance = useMemo(
    () => findBalance(balances, form.leave_type),
    [balances, form.leave_type],
  );
  const requestedDays = useMemo(
    () => countLeaveDays(form.from_date, form.to_date),
    [form.from_date, form.to_date],
  );
  const selectedTotal = Number(selectedBalance?.total_days ?? defaultLeaveTotal(form.leave_type));
  const selectedUsed = Number(selectedBalance?.used_days ?? 0);
  const selectedRemaining = Math.max(selectedTotal - selectedUsed, 0);
  const exceedsBalance =
    form.leave_type.toLowerCase() !== "unpaid" && requestedDays > selectedRemaining;
  const invalidDateRange = requestedDays < 1;
  const autoApprove =
    leaveSettings.autoApproveLeave === true ||
    leaveSettings.autoApproveByType[form.leave_type] === true;

  const load = useCallback(
    async (
      currentProfile: Profile | null,
      currentEmployee: EmployeeRow | null,
      options: { showLoading?: boolean } = {},
    ) => {
      if (!currentProfile?.business_id) {
        setLoading(false);
        return;
      }

      if (options.showLoading !== false) setLoading(true);
      const settingsPromise = supabase
        .from("settings")
        .select("auto_approve_leave, auto_approve_by_type")
        .eq("business_id", currentProfile.business_id)
        .maybeSingle();

      if (isManager(currentProfile)) {
        const [historyResult, settingsResult, teamResult] = await Promise.all([
          supabase
            .from("leaves")
            .select("*")
            .eq("business_id", currentProfile.business_id)
            .order("created_at", { ascending: false })
            .limit(50),
          settingsPromise,
          supabase
            .from("employees")
            .select("id, business_id, employee_code, name, department, user_id")
            .eq("business_id", currentProfile.business_id)
            .order("name", { ascending: true }),
        ]);

        if (historyResult.error)
          toast.error("Failed to load leave requests: " + historyResult.error.message);
        if (teamResult.error) toast.error("Failed to load employees: " + teamResult.error.message);

        const perType =
          (settingsResult.data?.auto_approve_by_type as Record<string, boolean>) ?? {};
        setLeaveSettings({
          autoApproveLeave: settingsResult.data?.auto_approve_leave === true,
          autoApproveByType: perType,
        });
        setBalances([]);
        setHistory((historyResult.data ?? []) as LeaveRow[]);
        setTeam((teamResult.data ?? []) as EmployeeRow[]);
        setLoading(false);
        return;
      }

      if (!currentEmployee) {
        setLoading(false);
        return;
      }

      const [balanceResult, historyResult, settingsResult] = await Promise.all([
        supabase
          .from("leave_balances")
          .select("id, leave_type, total_days, used_days")
          .eq("business_id", currentProfile.business_id)
          .eq("employee_id", currentEmployee.id)
          .order("leave_type", { ascending: true }),
        supabase
          .from("leaves")
          .select("*")
          .eq("business_id", currentProfile.business_id)
          .eq("employee_id", currentEmployee.id)
          .order("created_at", { ascending: false })
          .limit(30),
        settingsPromise,
      ]);

      if (balanceResult.error)
        toast.error("Failed to load balances: " + balanceResult.error.message);
      if (historyResult.error)
        toast.error("Failed to load leave history: " + historyResult.error.message);

      const perType = (settingsResult.data?.auto_approve_by_type as Record<string, boolean>) ?? {};
      setLeaveSettings({
        autoApproveLeave: settingsResult.data?.auto_approve_leave === true,
        autoApproveByType: perType,
      });
      setBalances((balanceResult.data ?? []) as BalanceRow[]);
      setHistory((historyResult.data ?? []) as LeaveRow[]);
      setLoading(false);
    },
    [],
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

      const { employee: data, error } = await findEmployeeForUser<EmployeeRow>(
        nextProfile.id,
        "id, business_id, employee_code, name, department, user_id",
      );

      if (error) toast.error("Failed to load employee profile: " + error.message);
      if (!data && !isManager(nextProfile)) {
        setLoading(false);
        return;
      }

      const nextEmployee = data ? (data as EmployeeRow) : null;
      setEmployee(nextEmployee);
      await load(nextProfile, nextEmployee);
    })();

    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (!profile?.business_id) return;
    const channel = supabase
      .channel(`apply-leave:${profile.business_id}:${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leaves",
          filter: `business_id=eq.${profile.business_id}`,
        },
        () => load(profile, employee, { showLoading: false }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "leave_balances",
          filter: employee
            ? `employee_id=eq.${employee.id}`
            : `business_id=eq.${profile.business_id}`,
        },
        () => load(profile, employee, { showLoading: false }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee, load, profile]);

  const submit = async () => {
    if (submitting) return;
    if (!employee || !profile?.business_id) return;
    if (invalidDateRange) {
      toast.error("The end date must be on or after the start date");
      return;
    }
    if (isBefore(parseISO(form.from_date), parseISO(todayKey))) {
      toast.error("Start date cannot be in the past");
      return;
    }
    if (exceedsBalance) {
      toast.error("Requested days exceed your available balance");
      return;
    }
    if (!form.reason.trim() && form.leave_type.toLowerCase() !== "casual") {
      toast.error("Please add a short reason for this request");
      return;
    }

    setSubmitting(true);
    try {
      const { data: settings, error: settingsError } = await supabase
        .from("settings")
        .select("auto_approve_leave, auto_approve_by_type")
        .eq("business_id", profile.business_id)
        .maybeSingle();

      if (settingsError) {
        console.error("Apply leave settings load failed:", settingsError.message);
      }

      const perType =
        (settings?.auto_approve_by_type as Record<string, boolean>) ??
        leaveSettings.autoApproveByType;
      const shouldApprove =
        settings?.auto_approve_leave === true ||
        leaveSettings.autoApproveLeave === true ||
        perType[form.leave_type] === true;

      const request = {
        leave_type: form.leave_type,
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason.trim(),
        total_days: requestedDays,
      };

      const { data: leave, error } = await supabase
        .from("leaves")
        .insert({
          business_id: profile.business_id,
          employee_id: employee.id,
          user_id: employee.user_id ?? profile.id,
          leave_type: request.leave_type,
          from_date: request.from_date,
          to_date: request.to_date,
          start_date: request.from_date,
          end_date: request.to_date,
          total_days: request.total_days,
          reason: request.reason || null,
          status: shouldApprove ? "approved" : "pending",
        })
        .select("id")
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      if (shouldApprove) {
        await applyBalanceChange(
          profile.business_id,
          employee.id,
          request.leave_type,
          request.total_days,
        );
      }

      toast.success(shouldApprove ? "Leave auto-approved" : "Leave request submitted");
      setForm({ leave_type: "Annual", from_date: todayKey, to_date: todayKey, reason: "" });
      await load(profile, employee, { showLoading: false });

      void notifyManagers({
        businessId: profile.business_id,
        type: "leave_requested",
        message: `${employee.name} requested ${request.leave_type} leave (${request.from_date} to ${request.to_date}, ${request.total_days} day${request.total_days === 1 ? "" : "s"}).`,
        relatedId: leave.id,
      }).catch((notifyError) => {
        console.error(notifyError);
        toast.error("Leave saved, but manager notification could not be sent.");
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitForEmployee = async () => {
    if (managerSubmitting) return;
    if (!canManage || !profile?.business_id) return;
    if (!managerForm.employee_id) {
      toast.error("Please choose an employee");
      return;
    }
    const requestedDays = countLeaveDays(managerForm.from_date, managerForm.to_date);
    if (requestedDays < 1) {
      toast.error("The end date must be on or after the start date");
      return;
    }
    if (isBefore(parseISO(managerForm.from_date), parseISO(todayKey))) {
      toast.error("Start date cannot be in the past");
      return;
    }
    if (!managerForm.reason.trim() && managerForm.leave_type.toLowerCase() !== "casual") {
      toast.error("Please add a short reason for this request");
      return;
    }

    const target = team.find((item) => item.id === managerForm.employee_id);
    if (!target) {
      toast.error("Selected employee could not be found");
      return;
    }

    setManagerSubmitting(true);
    try {
      const { data: leave, error } = await supabase
        .from("leaves")
        .insert({
          business_id: profile.business_id,
          employee_id: target.id,
          user_id: target.user_id ?? profile.id,
          leave_type: managerForm.leave_type,
          from_date: managerForm.from_date,
          to_date: managerForm.to_date,
          start_date: managerForm.from_date,
          end_date: managerForm.to_date,
          total_days: requestedDays,
          reason: managerForm.reason.trim() || null,
          status: "approved",
        })
        .select("id")
        .single();

      if (error) {
        toast.error(error.message);
        return;
      }

      await applyBalanceChange(
        profile.business_id,
        target.id,
        managerForm.leave_type,
        requestedDays,
      );
      toast.success("Leave added for employee");
      setManagerForm({
        employee_id: team[0]?.id ?? "",
        leave_type: "Annual",
        from_date: todayKey,
        to_date: todayKey,
        reason: "",
      });
      await load(profile, employee, { showLoading: false });

      if (target.user_id) {
        await notify({
          userId: target.user_id,
          businessId: profile.business_id,
          type: "leave_approved",
          message: `${profile.name} added ${managerForm.leave_type} leave for you.`,
          relatedId: leave.id,
        }).catch((notifyError) => {
          console.error(notifyError);
        });
      }
    } finally {
      setManagerSubmitting(false);
    }
  };

  const deleteLeave = async (row: LeaveRow) => {
    if (!profile?.business_id) return;
    if (!window.confirm("Delete this leave request?")) return;

    if (row.status.toLowerCase() === "approved") {
      await applyBalanceChange(
        profile.business_id,
        row.employee_id,
        row.leave_type,
        -row.total_days,
      );
    }

    const { error } = await supabase.from("leaves").delete().eq("id", row.id);
    if (error) {
      toast.error("Unable to delete leave: " + error.message);
      return;
    }

    toast.success("Leave request deleted");
    await load(profile, employee, { showLoading: false });
  };

  if (loading && !employee) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading leave details...
      </div>
    );
  }

  return (
    <PlanGate
      businessId={profile?.business_id}
      required="professional"
      title="Leave Management is a Professional feature"
      description="Employee leave requests, manager-created leave, approval workflows, and leave balances are included with Professional and Business plans."
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="text-sm font-medium text-[var(--navy)]/70">My work</div>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Apply Leave</h1>
            <p className="text-sm text-muted-foreground">
              Submit a leave request, track approvals, and keep your balances clear.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm lg:min-w-[280px]">
            <div className="text-sm font-medium text-muted-foreground">Employee</div>
            <div className="mt-1 text-lg font-semibold text-[var(--navy)]">
              {employee?.name || profile?.name || "Employee"}
            </div>
            <div className="text-sm text-muted-foreground">
              {[employee?.employee_code, employee?.department].filter(Boolean).join(" - ") ||
                "Leave portal"}
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {LEAVE_TYPES.map((type) => (
            <BalanceCard key={type} type={type} balance={findBalance(balances, type)} />
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="border-b p-5">
              <h2 className="text-xl font-semibold text-[var(--navy)]">New leave request</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Managers will receive a notification as soon as you submit.
              </p>
            </div>
            <div className="grid gap-5 p-5 md:grid-cols-2">
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
              <div className="rounded-lg border bg-[#F8FAFD] p-4">
                <div className="text-sm font-medium text-muted-foreground">Approval path</div>
                <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--navy)]">
                  {autoApprove ? (
                    <>
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      Auto-approved
                    </>
                  ) : (
                    <>
                      <Clock3 className="size-4 text-amber-500" />
                      Manager approval required
                    </>
                  )}
                </div>
              </div>
              <Field label="From">
                <Input
                  type="date"
                  min={todayKey}
                  value={form.from_date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      from_date: event.target.value,
                      to_date: isAfter(parseISO(event.target.value), parseISO(current.to_date))
                        ? event.target.value
                        : current.to_date,
                    }))
                  }
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  min={form.from_date || todayKey}
                  value={form.to_date}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, to_date: event.target.value }))
                  }
                />
              </Field>
              <Field label="Reason" className="md:col-span-2">
                <Textarea
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reason: event.target.value }))
                  }
                  rows={4}
                  placeholder="Add a short note for your manager..."
                />
              </Field>
              <div className="md:col-span-2">
                <Button
                  onClick={submit}
                  disabled={submitting || loading || invalidDateRange || exceedsBalance}
                  className="bg-[var(--navy)] hover:bg-[var(--navy-light)]"
                >
                  {submitting ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 size-4" />
                  )}
                  Submit request
                </Button>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarCheck className="size-5 text-[var(--navy)]" />
                <h2 className="text-lg font-semibold text-[var(--navy)]">Request preview</h2>
              </div>
              <div className="mt-5 space-y-4 text-sm">
                <PreviewRow label="Type" value={form.leave_type} />
                <PreviewRow
                  label="Dates"
                  value={`${dateLabel(form.from_date)} - ${dateLabel(form.to_date)}`}
                />
                <PreviewRow
                  label="Total days"
                  value={invalidDateRange ? "Invalid" : String(requestedDays)}
                />
                <PreviewRow
                  label="Balance after"
                  value={
                    form.leave_type.toLowerCase() === "unpaid"
                      ? "Not deducted"
                      : `${Math.max(selectedRemaining - requestedDays, 0)} days`
                  }
                />
              </div>
              {exceedsBalance && (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  This request is more than your available balance.
                </div>
              )}
            </div>

            <Link
              to="/my-roster"
              className="flex items-center justify-between rounded-xl border bg-card p-4 text-sm font-semibold text-[var(--navy)] shadow-sm hover:bg-secondary/40"
            >
              View my roster
              <ArrowUpRight className="size-4" />
            </Link>
          </aside>
        </section>

        <section className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center gap-2 border-b p-5">
            <FileText className="size-5 text-[var(--navy)]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--navy)]">Leave history</h2>
              <p className="text-sm text-muted-foreground">
                Status changes update here automatically.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-secondary/70 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">From</th>
                  <th className="px-5 py-3">To</th>
                  <th className="px-5 py-3">Days</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                      No leave requests yet.
                    </td>
                  </tr>
                ) : (
                  history.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-5 py-3 font-medium text-[var(--navy)]">{row.leave_type}</td>
                      <td className="px-5 py-3">{dateLabel(row.from_date)}</td>
                      <td className="px-5 py-3">{dateLabel(row.to_date)}</td>
                      <td className="px-5 py-3">{row.total_days}</td>
                      <td className="max-w-[260px] truncate px-5 py-3 text-muted-foreground">
                        {row.reason || "-"}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => deleteLeave(row)}
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
        </section>
      </div>
    </PlanGate>
  );
}

function BalanceCard({ type, balance }: { type: string; balance?: BalanceRow }) {
  const total = Number(balance?.total_days ?? defaultLeaveTotal(type));
  const used = Number(balance?.used_days ?? 0);
  const remaining = Math.max(total - used, 0);
  const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {type} leave
      </div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-3xl font-bold text-[var(--navy)]">{remaining}</div>
        <div className="pb-1 text-sm text-muted-foreground">days</div>
      </div>
      <Progress value={percent} className="mt-4 h-2" />
      <div className="mt-3 text-sm text-muted-foreground">
        {used} used of {total} total
      </div>
    </div>
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
      <Label className="text-sm font-medium text-[var(--navy)]">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold text-[var(--navy)]">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const value = status.toLowerCase();
  if (value === "approved") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        <CheckCircle2 className="mr-1 size-3.5" />
        Approved
      </Badge>
    );
  }
  if (value === "rejected" || value === "declined") {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
        <XCircle className="mr-1 size-3.5" />
        Rejected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-amber-50 text-amber-700">
      <Clock3 className="mr-1 size-3.5" />
      Pending
    </Badge>
  );
}

function findBalance(balances: BalanceRow[], type: string) {
  const requestType = type.toLowerCase();
  return balances.find((item) => {
    const balanceType = String(item.leave_type).toLowerCase();
    return balanceType.includes(requestType) || requestType.includes(balanceType);
  });
}

function countLeaveDays(from: string, to: string) {
  if (!from || !to) return 0;
  const start = parseISO(from);
  const end = parseISO(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || isAfter(start, end)) return 0;
  let total = 0;
  for (let day = start; !isAfter(day, end); day = addDays(day, 1)) {
    total += 1;
  }
  return total;
}

async function applyBalanceChange(
  businessId: string,
  employeeId: string,
  leaveType: string,
  totalDays: number,
) {
  if (leaveType.toLowerCase() === "unpaid") return;
  const { data: balanceRows, error: balanceError } = await supabase
    .from("leave_balances")
    .select("*")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId);

  if (balanceError) {
    toast.error("Leave saved, but balance could not be updated: " + balanceError.message);
    return;
  }

  const balance = findBalance((balanceRows ?? []) as BalanceRow[], leaveType);
  if (balance) {
    const { error } = await supabase
      .from("leave_balances")
      .update({ used_days: Math.max(Number(balance.used_days ?? 0) + totalDays, 0) })
      .eq("id", balance.id);
    if (error) toast.error("Leave saved, but balance could not be updated: " + error.message);
    return;
  }

  if (totalDays <= 0) return;

  const { error } = await supabase.from("leave_balances").upsert(
    {
      business_id: businessId,
      employee_id: employeeId,
      leave_type: leaveType,
      total_days: defaultLeaveTotal(leaveType),
      used_days: totalDays,
    },
    {
      onConflict: "employee_id,leave_type",
      ignoreDuplicates: false,
    },
  );
  if (error) toast.error("Leave saved, but balance could not be created: " + error.message);
}

function dateLabel(value: string) {
  if (!value) return "-";
  return format(parseISO(value), "dd MMM yyyy");
}
