import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Clock3,
  Copy,
  KeyRound,
  MoreHorizontal,
  Plus,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { useBusinessPlan } from "@/lib/billing/plans";
import { addEmployeeWithInvite, resendEmployeeInvite, type InviteResult } from "@/lib/api/staff";
import { sendEmployeeWelcomeEmail } from "@/lib/emailjs";
import { UserAvatar } from "@/components/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

async function sendInviteWithEmailJs(
  result: InviteResult,
  employeeName: string,
): Promise<InviteResult> {
  try {
    await sendEmployeeWelcomeEmail({
      employee_name: employeeName,
      employee_email: result.credentials.email,
      employee_code: result.credentials.employee_code,
      temp_password: result.credentials.temp_password,
      business_name: result.business_name || "your organisation",
    });
    return { ...result, email_sent: true, email_reason: null };
  } catch (error) {
    console.error("Employee invite email failed:", error);
    return {
      ...result,
      email_sent: false,
      email_reason:
        error instanceof Error
          ? error.message
          : "Email could not be sent. Share these login details manually.",
    };
  }
}

type Employee = {
  id: string;
  business_id: string;
  name: string;
  employee_code: string | null;
  department: string | null;
  role: string | null;
  skills: string[] | null;
  email: string | null;
  phone: string | null;
  employment_type: string | null;
  start_date: string | null;
  status: string | null;
  pay_rate?: number | null;
  date_of_birth?: string | null;
  user_id?: string | null;
  profile_status?: {
    first_login?: boolean | null;
    last_login_at?: string | null;
    invited_at?: string | null;
    avatar_url?: string | null;
  } | null;
};

const empty: Partial<Employee> = {
  name: "",
  employee_code: "",
  department: "",
  role: "",
  skills: [],
  email: "",
  phone: "",
  employment_type: "Full-time",
  start_date: "",
  status: "active",
};

function StaffPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editing, setEditing] = useState<Partial<Employee> | null>(null);
  const [skillInput, setSkillInput] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [resettingInviteFor, setResettingInviteFor] = useState<Employee | null>(null);

  const load = useCallback(
    async (businessId = profile?.business_id) => {
      let query = supabase.from("employees").select("*").order("name").limit(1000);
      if (businessId) query = query.eq("business_id", businessId);
      const { data } = await query;
      const employees: Employee[] = ((data as Employee[]) ?? []).map((employee) => ({
        ...employee,
        profile_status: null,
      }));
      const userIds = employees.map((employee) => employee.user_id).filter(Boolean) as string[];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_login, last_login_at, invited_at, avatar_url")
          .in("id", userIds);
        const profilesById = new Map(
          ((profiles ?? []) as Array<Employee["profile_status"] & { id: string }>).map((item) => [
            item.id,
            item,
          ]),
        );
        employees.forEach((employee) => {
          if (employee.user_id)
            employee.profile_status = profilesById.get(employee.user_id) ?? null;
        });
      }
      setRows(employees);
    },
    [profile?.business_id],
  );

  useEffect(() => {
    (async () => {
      const p = await fetchProfile();
      setProfile(p);
      await load(p?.business_id);
    })();
  }, [load]);

  useEffect(() => {
    if (!profile?.business_id) return;
    const channel = supabase
      .channel(`staff-changes-${profile.business_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "employees",
          filter: `business_id=eq.${profile.business_id}`,
        },
        () => {
          void load(profile.business_id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, profile?.business_id]);

  const canManage = isManager(profile);
  const { access } = useBusinessPlan(profile?.business_id);
  const activeEmployeeCount = rows.filter(
    (row) => (row.status ?? "active").toLowerCase() !== "inactive",
  ).length;

  const departments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.department).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (filterDept !== "all" && r.department !== filterDept) return false;
    if (filterStatus !== "all" && (r.status ?? "active") !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !r.name?.toLowerCase().includes(q) &&
        !r.employee_code?.toLowerCase().includes(q) &&
        !r.email?.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const openCreate = () => {
    if (access.employeeLimit != null && activeEmployeeCount >= access.employeeLimit) {
      toast.error(
        `${access.name} allows up to ${access.employeeLimit} employees. Upgrade to add more staff.`,
      );
      return;
    }
    setEditing({ ...empty });
    setSkillInput("");
    setInviteResult(null);
    setEmailError(null);
    setOpen(true);
  };

  const openEdit = (e: Employee) => {
    setEditing({ ...e, skills: e.skills ?? [] });
    setSkillInput("");
    setInviteResult(null);
    setEmailError(null);
    setOpen(true);
  };

  const addSkill = () => {
    const v = skillInput.trim();
    if (!v) return;
    setEditing((p) => ({ ...p, skills: [...(p?.skills ?? []), v] }));
    setSkillInput("");
  };

  const removeSkill = (s: string) => {
    setEditing((p) => ({ ...p, skills: (p?.skills ?? []).filter((x) => x !== s) }));
  };

  const save = async () => {
    if (!editing || !profile?.business_id) return;
    setEmailError(null);
    if (!editing.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!editing.id && !editing.email?.trim()) {
      setEmailError("Email is required to send login credentials.");
      return;
    }
    if (!editing.role?.trim()) {
      toast.error("Role is required");
      return;
    }
    if (
      !editing.id &&
      access.employeeLimit != null &&
      activeEmployeeCount >= access.employeeLimit
    ) {
      toast.error(
        `${access.name} allows up to ${access.employeeLimit} employees. Upgrade to add more staff.`,
      );
      return;
    }
    setSaving(true);
    const payload = {
      name: editing.name,
      department: editing.department || null,
      role: editing.role || null,
      skills: editing.skills ?? [],
      email: editing.email || null,
      phone: editing.phone || null,
      employment_type: editing.employment_type || null,
      pay_rate: editing.pay_rate || null,
      date_of_birth: editing.date_of_birth || null,
      start_date: editing.start_date || null,
      status: editing.status || "active",
      updated_at: new Date().toISOString(),
    };
    try {
      if (editing.id) {
        const { error } = await supabase
          .from("employees")
          .update(payload as any)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Employee updated");
        setOpen(false);
        setEditing(null);
        await load();
      } else {
        const result = await addEmployeeWithInvite({
          name: editing.name.trim(),
          email: editing.email!.trim(),
          phone: editing.phone || null,
          department: editing.department || null,
          role: editing.role.trim(),
          employment_type: editing.employment_type || "Full-time",
          pay_rate: editing.pay_rate || null,
          date_of_birth: editing.date_of_birth || null,
          start_date: editing.start_date || null,
          skills: editing.skills ?? [],
        });
        const invite = await sendInviteWithEmailJs(result, editing.name.trim());
        setInviteResult(invite);
        toast.success(
          invite.email_sent
            ? "Employee added and invite sent"
            : "Employee added. Share credentials manually.",
        );
        await load();
      }
    } catch (err: any) {
      if (err.fields?.email || err.status === 409) {
        setEmailError(err.fields?.email ?? err.message);
      }
      toast.error(err.message ?? "Unable to save employee");
    } finally {
      setSaving(false);
    }
  };

  const resendInvite = async (employee: Employee) => {
    setResettingInviteFor(employee);
    try {
      const result = await resendEmployeeInvite(employee.id);
      const invite = await sendInviteWithEmailJs(result, employee.name || "Employee");
      setInviteResult(invite);
      setEditing(employee);
      setOpen(true);
      toast.success(invite.email_sent ? "Invite sent" : "Credentials generated. Share manually.");
      await load();
    } catch (err: any) {
      toast.error(err.message ?? "Unable to generate invite");
    } finally {
      setResettingInviteFor(null);
    }
  };

  const updateStatus = async (employee: Employee, status: "active" | "inactive") => {
    const { error } = await supabase
      .from("employees")
      .update({ status, updated_at: new Date().toISOString() } as any)
      .eq("id", employee.id);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "active" ? "Employee reactivated" : "Employee deactivated");
      await load();
    }
  };

  const doDelete = async (employee: Employee) => {
    const { error } = await supabase.from("employees").delete().eq("id", employee.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Employee deleted");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Staff</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} of {rows.length} employees
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="bg-[var(--navy)] hover:bg-[var(--navy-light)]">
            <Plus className="size-4 mr-2" /> Add Employee
          </Button>
        )}
      </div>

      <div className="bg-card border rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[220px] w-full">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, ID, email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full min-w-[1020px] text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Invite status</th>
              <th className="px-4 py-3 font-medium">Last login</th>
              {canManage && <th className="px-4 py-3 font-medium w-24 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={canManage ? 7 : 6}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  No employees yet.
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr
                  key={e.id}
                  className="border-t hover:bg-secondary/40 cursor-pointer"
                  onClick={() => canManage && openEdit(e)}
                >
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={e.name} email={e.email} size={38} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[var(--navy)]">{e.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {e.employee_code ?? "No ID"} {e.email ? `- ${e.email}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{e.department ?? "-"}</td>
                  <td className="px-4 py-3">{e.role ?? "-"}</td>
                  <td className="px-4 py-3">{e.employment_type ?? "-"}</td>
                  <td className="px-4 py-3">
                    <InviteStatus employee={e} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatRelativeLogin(e.profile_status?.last_login_at)}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex size-9 items-center justify-center rounded-md border hover:bg-secondary">
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => openEdit(e)}>
                            <Pencil className="size-4" /> Edit details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={resettingInviteFor?.id === e.id || !e.user_id}
                            onClick={() => resendInvite(e)}
                          >
                            {e.profile_status?.first_login ? (
                              <RotateCcw className="size-4" />
                            ) : (
                              <KeyRound className="size-4" />
                            )}
                            {e.profile_status?.first_login ? "Resend invite" : "Reset password"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {(e.status ?? "active") === "active" ? (
                            <DropdownMenuItem onClick={() => updateStatus(e, "inactive")}>
                              <UserX className="size-4" /> Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => updateStatus(e, "active")}>
                              <UserCheck className="size-4" /> Reactivate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => doDelete(e)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {inviteResult ? "Employee Added" : editing?.id ? "Edit employee" : "Add New Employee"}
            </DialogTitle>
          </DialogHeader>
          {inviteResult ? (
            <InviteSuccess
              result={inviteResult}
              name={editing?.name || "Employee"}
              onAddAnother={() => {
                setEditing({ ...empty });
                setInviteResult(null);
                setEmailError(null);
                setSkillInput("");
              }}
              onDone={() => {
                setOpen(false);
                setEditing(null);
                setInviteResult(null);
              }}
            />
          ) : (
            editing && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                <Field label="Name *">
                  <Input
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    disabled={saving}
                  />
                </Field>
                <Field label="Employee ID">
                  <Input
                    value={editing.employee_code ?? ""}
                    placeholder="Auto-generated"
                    disabled
                  />
                </Field>
                <Field label="Department">
                  <Input
                    value={editing.department ?? ""}
                    onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                    disabled={saving}
                  />
                </Field>
                <Field label="Role / Position">
                  <Input
                    value={editing.role ?? ""}
                    onChange={(e) => setEditing({ ...editing, role: e.target.value })}
                    disabled={saving}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    value={editing.email ?? ""}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                    disabled={saving || !!editing.id}
                  />
                  {emailError && <p className="mt-1 text-xs text-destructive">{emailError}</p>}
                </Field>
                <Field label="Phone">
                  <Input
                    value={editing.phone ?? ""}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                    disabled={saving}
                  />
                </Field>
                <Field label="Pay rate">
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.pay_rate ?? ""}
                    onChange={(e) => setEditing({ ...editing, pay_rate: Number(e.target.value) })}
                    disabled={saving}
                  />
                </Field>
                <Field label="Date of birth">
                  <Input
                    type="date"
                    value={editing.date_of_birth ?? ""}
                    onChange={(e) => setEditing({ ...editing, date_of_birth: e.target.value })}
                    disabled={saving}
                  />
                </Field>
                <Field label="Employment type">
                  <Select
                    value={editing.employment_type ?? "Full-time"}
                    onValueChange={(v) => setEditing({ ...editing, employment_type: v })}
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Full-time">Full-time</SelectItem>
                      <SelectItem value="Part-time">Part-time</SelectItem>
                      <SelectItem value="Casual">Casual</SelectItem>
                      <SelectItem value="Contract">Contract</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Start date">
                  <Input
                    type="date"
                    value={editing.start_date ?? ""}
                    onChange={(e) => setEditing({ ...editing, start_date: e.target.value })}
                    disabled={saving}
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={editing.status ?? "active"}
                    onValueChange={(v) => setEditing({ ...editing, status: v })}
                    disabled={saving}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="col-span-2">
                  <Label className="text-sm">Skills</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      placeholder="Add a skill and press Enter"
                      disabled={saving}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSkill();
                        }
                      }}
                    />
                    <Button type="button" variant="outline" onClick={addSkill}>
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(editing.skills ?? []).map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-xs"
                      >
                        {s}
                        <button onClick={() => removeSkill(s)}>
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                {!editing.id && (
                  <div className="col-span-1 rounded-xl border bg-secondary/50 p-4 sm:col-span-2">
                    <div className="text-sm font-semibold text-[var(--navy)]">
                      Auto-generated after submit
                    </div>
                    <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                      <div>Employee ID: EMP001, EMP002...</div>
                      <div>Temporary password generated after submit</div>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
          {!inviteResult && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={save}
                disabled={saving}
                className="bg-[var(--navy)] hover:bg-[var(--navy-light)]"
              >
                {saving
                  ? editing?.id
                    ? "Saving..."
                    : "Creating employee..."
                  : editing?.id
                    ? "Save changes"
                    : "Add Employee & Send Invite"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function InviteStatus({ employee }: { employee: Employee }) {
  const firstLogin = employee.profile_status?.first_login;
  const invitedAt = employee.profile_status?.invited_at;

  if (!employee.user_id) {
    return <span className="text-xs text-muted-foreground">Not invited</span>;
  }

  if (firstLogin) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        <Clock3 className="size-3.5" />
        Invite pending
      </span>
    );
  }

  return (
    <div className="space-y-0.5">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="size-3.5" />
        Active
      </span>
      <div className="text-[11px] text-muted-foreground">
        {invitedAt ? `Invited ${formatRelativeLogin(invitedAt)}` : "Invite sent"}
      </div>
    </div>
  );
}

function formatRelativeLogin(value?: string | null) {
  if (!value) return "Never";
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "Never";
  const diff = Date.now() - time;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function InviteSuccess({
  result,
  name,
  onAddAnother,
  onDone,
}: {
  result: InviteResult;
  name: string;
  onAddAnother: () => void;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyCredentials = async () => {
    const text = `Name: ${name}\nEmail: ${result.credentials.email}\nEmployee ID: ${result.credentials.employee_code}\nTemporary password: ${result.credentials.temp_password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Credentials copied");
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <div className="font-semibold">Invite created for {name}</div>
            <div className="mt-1 text-sm text-emerald-800">
              {result.email_sent
                ? `Temporary login details were emailed to ${result.credentials.email}.`
                : result.email_reason || "Email was not sent, but credentials were generated."}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border bg-secondary/30 p-4 text-sm sm:grid-cols-2">
        <div>
          <div className="text-muted-foreground">Employee ID</div>
          <div className="font-medium text-[var(--navy)]">{result.credentials.employee_code}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Login email</div>
          <div className="font-medium text-[var(--navy)]">{result.credentials.email}</div>
        </div>
        <div className="sm:col-span-2">
          <div className="text-muted-foreground">Temporary password</div>
          <div className="flex flex-wrap items-center gap-2 font-medium text-[var(--navy)]">
            <span className="rounded-md bg-background px-2 py-1">
              {result.credentials.temp_password}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={copyCredentials}>
              <Copy className="mr-2 size-4" />
              {copied ? "Copied" : "Copy details"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onAddAnother}>
          <Plus className="mr-2 size-4" />
          Add another
        </Button>
        <Button
          type="button"
          className="bg-[var(--navy)] hover:bg-[var(--navy-light)]"
          onClick={onDone}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
