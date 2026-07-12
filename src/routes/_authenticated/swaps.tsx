import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  Repeat,
  Trash2,
  UserCheck,
  UserX,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PlanGate } from "@/components/PlanGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/swaps")({
  component: SwapsPage,
});

type EmployeeSummary = {
  id: string;
  business_id?: string | null;
  employee_code?: string | null;
  name: string | null;
  department: string | null;
  user_id: string | null;
};

type ShiftSummary = {
  id: string;
  employee_id: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  total_hours: number | null;
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
  updated_at: string;
  requester?: EmployeeSummary | null;
  target?: EmployeeSummary | null;
  requester_shift?: ShiftSummary | null;
  target_shift?: ShiftSummary | null;
};

type RequestForm = {
  myShiftId: string;
  targetEmployeeId: string;
  targetShiftId: string;
  note: string;
};

type SwapAction = "approved" | "rejected" | "target_accepted" | "target_declined" | "cancelled";

function SwapsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [employee, setEmployee] = useState<EmployeeSummary | null>(null);
  const [rows, setRows] = useState<SwapRow[]>([]);
  const [myShifts, setMyShifts] = useState<ShiftSummary[]>([]);
  const [colleagues, setColleagues] = useState<EmployeeSummary[]>([]);
  const [targetShifts, setTargetShifts] = useState<ShiftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [requestForm, setRequestForm] = useState<RequestForm>({
    myShiftId: "",
    targetEmployeeId: "",
    targetShiftId: "",
    note: "",
  });

  const canManage = profile ? isManager(profile) : false;
  const businessId = profile?.business_id ?? null;
  const requestWindow = useMemo(() => {
    const now = new Date();
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
    };
  }, []);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);

  const loadTargetShifts = useCallback(
    async (employeeId: string) => {
      if (!employeeId) {
        setTargetShifts([]);
        return;
      }
      const { data, error } = await supabase
        .from("roster_shifts")
        .select("id, employee_id, day, start_time, end_time, break_minutes, total_hours")
        .eq("employee_id", employeeId)
        .gte("day", requestWindow.from)
        .lte("day", requestWindow.to)
        .order("day", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) {
        toast.error("Failed to load colleague shifts: " + error.message);
        setTargetShifts([]);
        return;
      }

      setTargetShifts((data ?? []) as ShiftSummary[]);
    },
    [requestWindow.from, requestWindow.to],
  );

  const loadPage = useCallback(async () => {
    const nextProfile = await fetchProfile();
    setProfile(nextProfile);

    if (!nextProfile) {
      setEmployee(null);
      setRows([]);
      setMyShifts([]);
      setColleagues([]);
      setTargetShifts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const nextEmployee = isManager(nextProfile)
      ? null
      : ((
          await findEmployeeForUser<EmployeeSummary>(
            nextProfile.id,
            "id, business_id, employee_code, name, department, user_id",
          )
        ).employee ?? null);

    if (!isManager(nextProfile) && !nextEmployee) {
      setLoading(false);
      toast.error("Failed to load your employee profile.");
      return;
    }

    setEmployee(nextEmployee);

    const swapQuery = supabase
      .from("shift_swaps")
      .select("*")
      .order("created_at", { ascending: false });

    const { data: swapData, error: swapError } = nextProfile.business_id
      ? isManager(nextProfile)
        ? await swapQuery.eq("business_id", nextProfile.business_id)
        : await swapQuery
            .eq("business_id", nextProfile.business_id)
            .or(
              `requester_employee_id.eq.${nextEmployee?.id},target_employee_id.eq.${nextEmployee?.id}`,
            )
      : { data: [], error: null };

    if (swapError) {
      toast.error("Failed to load shift swaps: " + swapError.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const swaps = (swapData ?? []) as SwapRow[];
    const employeeIds = Array.from(
      new Set(swaps.flatMap((swap) => [swap.requester_employee_id, swap.target_employee_id])),
    ).filter(Boolean);
    const shiftIds = Array.from(
      new Set(swaps.flatMap((swap) => [swap.requester_shift_id, swap.target_shift_id])),
    ).filter(Boolean) as string[];

    const [{ data: employees, error: employeesError }, { data: shifts, error: shiftsError }] =
      await Promise.all([
        employeeIds.length
          ? supabase
              .from("employees")
              .select("id, business_id, employee_code, name, department, user_id")
              .in("id", employeeIds)
          : Promise.resolve({ data: [], error: null }),
        shiftIds.length
          ? supabase
              .from("roster_shifts")
              .select("id, employee_id, day, start_time, end_time, break_minutes, total_hours")
              .in("id", shiftIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (employeesError) {
      toast.error("Failed to load swap employee details: " + employeesError.message);
    }
    if (shiftsError) {
      toast.error("Failed to load swap shift details: " + shiftsError.message);
    }

    const employeesById = new Map(
      ((employees ?? []) as EmployeeSummary[]).map((item) => [item.id, item]),
    );
    const shiftsById = new Map(((shifts ?? []) as ShiftSummary[]).map((item) => [item.id, item]));

    setRows(
      swaps.map((swap) => ({
        ...swap,
        requester: employeesById.get(swap.requester_employee_id) ?? null,
        target: employeesById.get(swap.target_employee_id) ?? null,
        requester_shift: swap.requester_shift_id
          ? (shiftsById.get(swap.requester_shift_id) ?? null)
          : null,
        target_shift: swap.target_shift_id ? (shiftsById.get(swap.target_shift_id) ?? null) : null,
      })),
    );

    if (!isManager(nextProfile) && nextEmployee && nextProfile.business_id) {
      const [myShiftResult, colleaguesResult] = await Promise.all([
        supabase
          .from("roster_shifts")
          .select("id, employee_id, day, start_time, end_time, break_minutes, total_hours")
          .eq("employee_id", nextEmployee.id)
          .gte("day", requestWindow.from)
          .lte("day", requestWindow.to)
          .order("day", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase
          .from("employees")
          .select("id, business_id, employee_code, name, department, user_id")
          .eq("business_id", nextProfile.business_id)
          .neq("id", nextEmployee.id)
          .order("name", { ascending: true }),
      ]);

      if (myShiftResult.error) {
        toast.error("Failed to load your shifts: " + myShiftResult.error.message);
      }
      if (colleaguesResult.error) {
        toast.error("Failed to load colleagues: " + colleaguesResult.error.message);
      }

      setMyShifts((myShiftResult.data ?? []) as ShiftSummary[]);
      setColleagues((colleaguesResult.data ?? []) as EmployeeSummary[]);
    } else {
      setMyShifts([]);
      setColleagues([]);
    }

    setLoading(false);
  }, [requestWindow.from, requestWindow.to]);

  useEffect(() => {
    void loadPage();
  }, [loadPage, reloadKey]);

  useEffect(() => {
    if (!businessId) return;
    const channel = supabase
      .channel(`shift-swaps:${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shift_swaps",
          filter: `business_id=eq.${businessId}`,
        },
        () => reload(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [businessId, reload]);

  useEffect(() => {
    if (!requestForm.targetEmployeeId) {
      setTargetShifts([]);
      return;
    }
    void loadTargetShifts(requestForm.targetEmployeeId);
  }, [loadTargetShifts, requestForm.targetEmployeeId]);

  useEffect(() => {
    if (!requestOpen || myShifts.length === 0) return;
    const hasSelection = myShifts.some((shift) => shift.id === requestForm.myShiftId);
    if (!hasSelection) {
      setRequestForm((current) => ({ ...current, myShiftId: myShifts[0].id }));
    }
  }, [myShifts, requestForm.myShiftId, requestOpen]);

  useEffect(() => {
    if (!requestOpen || targetShifts.length === 0) return;
    const hasSelection = targetShifts.some((shift) => shift.id === requestForm.targetShiftId);
    if (!hasSelection) {
      setRequestForm((current) => ({ ...current, targetShiftId: targetShifts[0].id }));
    }
  }, [requestForm.targetShiftId, requestOpen, targetShifts]);

  const summary = useMemo(() => {
    const requesterId = employee?.id ?? null;
    const pendingForManager = rows.filter((row) =>
      ["pending", "target_accepted"].includes(lower(row.status)),
    ).length;
    const waitingOnMe = requesterId
      ? rows.filter(
          (row) => row.target_employee_id === requesterId && lower(row.status) === "pending",
        ).length
      : 0;
    const mySent = requesterId
      ? rows.filter((row) => row.requester_employee_id === requesterId).length
      : 0;
    const approved = rows.filter((row) => lower(row.status) === "approved").length;
    const closed = rows.filter((row) =>
      ["rejected", "target_declined", "cancelled"].includes(lower(row.status)),
    ).length;

    return {
      total: rows.length,
      pendingForManager,
      waitingOnMe,
      mySent,
      approved,
      closed,
    };
  }, [employee?.id, rows]);

  const respond = async (row: SwapRow, action: SwapAction) => {
    setActioningId(row.id);
    const { data, error } = await supabase.rpc(
      "respond_to_shift_swap" as any,
      {
        p_swap_id: row.id,
        p_action: action,
      } as any,
    );
    setActioningId(null);

    if (error) {
      toast.error(error.message);
      return;
    }

    const updated = (data as unknown as SwapRow | null) ?? row;
    const requesterName = updated.requester?.name ?? "Requester";
    const targetName = updated.target?.name ?? "Target employee";

    setRows((current) =>
      current.map((item) =>
        item.id === row.id
          ? {
              ...item,
              status: action,
              updated_at: new Date().toISOString(),
            }
          : item,
      ),
    );

    if (action === "approved") {
      toast.success("Swap approved and shifts updated");
      void Promise.allSettled([
        updated.requester?.user_id
          ? notify({
              userId: updated.requester.user_id,
              businessId,
              type: "swap_approved",
              message: `Your shift swap was approved by the manager.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
        updated.target?.user_id
          ? notify({
              userId: updated.target.user_id,
              businessId,
              type: "swap_approved",
              message: `Your shift swap with ${requesterName} was approved.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
      ]).catch((notifyError) => console.error(notifyError));
    } else if (action === "rejected") {
      toast.success("Swap rejected");
      void Promise.allSettled([
        updated.requester?.user_id
          ? notify({
              userId: updated.requester.user_id,
              businessId,
              type: "swap_rejected",
              message: `Your shift swap request was rejected.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
        updated.target?.user_id
          ? notify({
              userId: updated.target.user_id,
              businessId,
              type: "swap_rejected",
              message: `The shift swap with ${requesterName} was rejected.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
      ]).catch((notifyError) => console.error(notifyError));
    } else if (action === "target_accepted") {
      toast.success("Swap accepted");
      void Promise.allSettled([
        updated.requester?.user_id
          ? notify({
              userId: updated.requester.user_id,
              businessId,
              type: "swap_target_accepted",
              message: `${targetName} accepted your shift swap request.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
        businessId
          ? notifyManagers({
              businessId,
              type: "swap_target_accepted",
              message: `${targetName} accepted a shift swap request and it is ready for approval.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
      ]).catch((notifyError) => console.error(notifyError));
    } else if (action === "target_declined") {
      toast.success("Swap declined");
      void Promise.allSettled([
        updated.requester?.user_id
          ? notify({
              userId: updated.requester.user_id,
              businessId,
              type: "swap_target_declined",
              message: `${targetName} declined your shift swap request.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
        businessId
          ? notifyManagers({
              businessId,
              type: "swap_target_declined",
              message: `${targetName} declined a shift swap request.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
      ]).catch((notifyError) => console.error(notifyError));
    } else if (action === "cancelled") {
      toast.success("Swap cancelled");
      void Promise.allSettled([
        updated.target?.user_id
          ? notify({
              userId: updated.target.user_id,
              businessId,
              type: "swap_cancelled",
              message: `${requesterName} cancelled the shift swap request.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
        businessId
          ? notifyManagers({
              businessId,
              type: "swap_cancelled",
              message: `${requesterName} cancelled a shift swap request.`,
              relatedId: updated.id,
            })
          : Promise.resolve(),
      ]).catch((notifyError) => console.error(notifyError));
    }
  };

  const deleteSwap = async (row: SwapRow) => {
    setActioningId(row.id);
    const { error } = await supabase.from("shift_swaps").delete().eq("id", row.id);
    setActioningId(null);

    if (error) {
      toast.error("Unable to delete shift swap: " + error.message);
      return;
    }

    setRows((current) => current.filter((item) => item.id !== row.id));
    toast.success("Shift swap deleted");
  };

  const submitRequest = async () => {
    if (!profile?.business_id || !employee) return;
    if (!requestForm.myShiftId || !requestForm.targetEmployeeId || !requestForm.targetShiftId) {
      toast.error("Please select your shift, the colleague, and their shift.");
      return;
    }

    const { data, error } = await supabase
      .from("shift_swaps")
      .insert({
        business_id: profile.business_id,
        requester_id: profile.id,
        requester_employee_id: employee.id,
        requester_shift_id: requestForm.myShiftId,
        target_employee_id: requestForm.targetEmployeeId,
        target_shift_id: requestForm.targetShiftId,
        note: requestForm.note || null,
        status: "pending",
      } as any)
      .select("id")
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    const target = colleagues.find((item) => item.id === requestForm.targetEmployeeId);
    const requestLabel = `${employee.name || "An employee"} requested a shift swap.`;

    if (target?.user_id) {
      await notify({
        userId: target.user_id,
        businessId: profile.business_id,
        type: "swap_requested",
        message: `${employee.name || "A colleague"} requested to swap shifts with you.`,
        relatedId: data.id,
      }).catch((notifyError) => console.error(notifyError));
    }

    await notifyManagers({
      businessId: profile.business_id,
      type: "swap_requested",
      message: requestLabel,
      relatedId: data.id,
    }).catch((notifyError) => console.error(notifyError));

    toast.success("Swap request submitted");
    setRequestOpen(false);
    setRequestForm({
      myShiftId: "",
      targetEmployeeId: "",
      targetShiftId: "",
      note: "",
    });
  };

  if (!profile) return null;

  return (
    <PlanGate
      businessId={profile.business_id}
      required="professional"
      title="Shift Swaps are a Professional feature"
      description="Employee swap requests, colleague acceptance, manager approvals, and realtime swap notifications are included with Professional and Business plans."
    >
      <div className="space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Workforce</span>
              <span>/</span>
              <span className="font-semibold text-[var(--navy)]">Shift Swaps</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--navy)]">Swaps</div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)] sm:text-4xl">
                Shift Swaps
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {canManage
                  ? "Review employee swap requests, approve the handover, and keep the roster live."
                  : "Request swaps, answer requests from colleagues, and track what is waiting on you."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!canManage && (
              <Button
                onClick={() => setRequestOpen(true)}
                className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
              >
                <Repeat className="mr-2 size-4" />
                Request swap
              </Button>
            )}
            <Button
              variant="outline"
              onClick={reload}
              disabled={loading}
              className="border-[var(--navy)] text-[var(--navy)] hover:bg-[var(--navy)] hover:text-white"
            >
              <Loader2 className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label={canManage ? "Pending manager review" : "My requests"}
            value={canManage ? summary.pendingForManager : summary.mySent}
            icon={ArrowRightLeft}
          />
          <SummaryCard
            label={canManage ? "Awaiting employee response" : "Waiting on me"}
            value={
              canManage
                ? rows.filter((row) => row.status === "pending").length
                : summary.waitingOnMe
            }
            icon={Clock3}
          />
          <SummaryCard label="Approved" value={summary.approved} icon={CheckCircle2} />
          <SummaryCard label="Closed" value={summary.closed} icon={XCircle} />
        </section>

        <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="border-b bg-[var(--navy)] p-5 text-white">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  {canManage ? "Manager approval queue" : "My swap requests"}
                </h2>
                <p className="mt-2 text-sm text-white/75">
                  {canManage
                    ? "Requests appear here as soon as employees submit them. Approve only after the other employee accepts."
                    : "You can see your outgoing requests and incoming swap requests in one place."}
                </p>
              </div>
              {!canManage && (
                <Badge className="w-fit border-white/20 bg-white/10 text-white hover:bg-white/10">
                  {summary.waitingOnMe} waiting on you
                </Badge>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Requester</th>
                  <th className="px-5 py-3">Requester shift</th>
                  <th className="px-5 py-3">Target</th>
                  <th className="px-5 py-3">Target shift</th>
                  <th className="px-5 py-3">Note</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                      Loading shift swaps...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-muted-foreground">
                      No swap requests yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const isRequester = employee?.id === row.requester_employee_id;
                    const isTarget = employee?.id === row.target_employee_id;
                    const status = lower(row.status);
                    const showManagerActions =
                      canManage && ["pending", "target_accepted"].includes(status);
                    const showTargetActions = !canManage && isTarget && status === "pending";
                    const showRequesterActions =
                      !canManage && isRequester && ["pending", "target_accepted"].includes(status);

                    return (
                      <tr key={row.id} className="border-t align-top">
                        <td className="px-5 py-4">
                          <div className="font-medium text-[var(--navy)]">
                            {row.requester?.name ?? "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.requester?.department ?? "No department"}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <ShiftLabel shift={row.requester_shift} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-medium text-[var(--navy)]">
                            {row.target?.name ?? "-"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.target?.department ?? "No department"}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <ShiftLabel shift={row.target_shift} />
                        </td>
                        <td className="px-5 py-4 text-muted-foreground">{row.note ?? "-"}</td>
                        <td className="px-5 py-4">
                          <SwapStatusBadge status={row.status} />
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            {showTargetActions && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => respond(row, "target_declined")}
                                  disabled={actioningId === row.id}
                                >
                                  <UserX className="mr-2 size-4" />
                                  Decline
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
                                  onClick={() => respond(row, "target_accepted")}
                                  disabled={actioningId === row.id}
                                >
                                  <UserCheck className="mr-2 size-4" />
                                  Accept
                                </Button>
                              </>
                            )}
                            {showRequesterActions && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => respond(row, "cancelled")}
                                disabled={actioningId === row.id}
                              >
                                <XCircle className="mr-2 size-4" />
                                Cancel
                              </Button>
                            )}
                            {showManagerActions && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => respond(row, "rejected")}
                                  disabled={actioningId === row.id}
                                >
                                  Reject
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
                                  onClick={() => respond(row, "approved")}
                                  disabled={actioningId === row.id}
                                >
                                  Approve
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => deleteSwap(row)}
                              disabled={actioningId === row.id}
                            >
                              <Trash2 className="mr-1 size-4" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {!canManage && (
          <RequestDialog
            open={requestOpen}
            setOpen={setRequestOpen}
            myShifts={myShifts}
            colleagues={colleagues}
            targetShifts={targetShifts}
            form={requestForm}
            setForm={setRequestForm}
            submit={submitRequest}
          />
        )}
      </div>
    </PlanGate>
  );
}

function RequestDialog({
  open,
  setOpen,
  myShifts,
  colleagues,
  targetShifts,
  form,
  setForm,
  submit,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  myShifts: ShiftSummary[];
  colleagues: EmployeeSummary[];
  targetShifts: ShiftSummary[];
  form: RequestForm;
  setForm: Dispatch<SetStateAction<RequestForm>>;
  submit: () => Promise<void>;
}) {
  useEffect(() => {
    if (!open || myShifts.length === 0) return;
    const hasSelection = myShifts.some((shift) => shift.id === form.myShiftId);
    if (!hasSelection) {
      setForm((current) => ({ ...current, myShiftId: myShifts[0].id }));
    }
  }, [form.myShiftId, myShifts, open, setForm]);

  useEffect(() => {
    if (!open || targetShifts.length === 0) return;
    const hasSelection = targetShifts.some((shift) => shift.id === form.targetShiftId);
    if (!hasSelection) {
      setForm((current) => ({ ...current, targetShiftId: targetShifts[0].id }));
    }
  }, [form.targetShiftId, open, setForm, targetShifts]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request shift swap</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>My shift</Label>
            <Select
              value={form.myShiftId}
              onValueChange={(value) => setForm((current) => ({ ...current, myShiftId: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select your shift" />
              </SelectTrigger>
              <SelectContent>
                {myShifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {shift.day} - {shiftLabelText(shift)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Colleague</Label>
            <Select
              value={form.targetEmployeeId}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, targetEmployeeId: value, targetShiftId: "" }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a colleague" />
              </SelectTrigger>
              <SelectContent>
                {colleagues.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name ?? "Unnamed employee"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Their shift</Label>
            <Select
              value={form.targetShiftId}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, targetShiftId: value }))
              }
              disabled={!form.targetEmployeeId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select their shift" />
              </SelectTrigger>
              <SelectContent>
                {targetShifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {shift.day} - {shiftLabelText(shift)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              rows={3}
              placeholder="Optional context for the swap"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
          >
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof ArrowRightLeft;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <span className="rounded-md bg-[var(--navy)]/10 p-2 text-[var(--navy)]">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold text-[var(--navy)]">{value}</div>
    </div>
  );
}

function ShiftLabel({ shift }: { shift?: ShiftSummary | null }) {
  if (!shift) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="space-y-1">
      <div className="font-medium text-[var(--navy)]">{shift.day}</div>
      <div className="text-xs text-muted-foreground">{shiftLabelText(shift)}</div>
      <div className="text-[11px] text-muted-foreground">
        {shift.break_minutes ?? 0}m break | {formatHours(Number(shift.total_hours ?? 0))}
      </div>
    </div>
  );
}

function SwapStatusBadge({ status }: { status: string }) {
  const value = lower(status);
  const meta =
    value === "pending"
      ? "bg-amber-100 text-amber-800"
      : value === "target_accepted"
        ? "bg-blue-100 text-blue-800"
        : value === "approved"
          ? "bg-emerald-100 text-emerald-800"
          : value === "target_declined" || value === "rejected"
            ? "bg-red-100 text-red-800"
            : "bg-slate-100 text-slate-700";

  return <Badge className={meta}>{labelForStatus(value)}</Badge>;
}

function labelForStatus(status: string) {
  switch (status) {
    case "pending":
      return "Pending";
    case "target_accepted":
      return "Accepted by employee";
    case "target_declined":
      return "Declined by employee";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return status.replace(/_/g, " ");
  }
}

function shiftLabelText(shift: ShiftSummary) {
  return `${timeLabel(shift.start_time)} to ${timeLabel(shift.end_time)}`;
}

function timeLabel(value?: string | null) {
  return value?.slice(0, 5) ?? "--";
}

function formatHours(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0h";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}h`;
}

function lower(value?: string | null) {
  return String(value ?? "").toLowerCase();
}
