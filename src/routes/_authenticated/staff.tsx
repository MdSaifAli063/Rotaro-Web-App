import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

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
  const [toDelete, setToDelete] = useState<Employee | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await fetchProfile();
      setProfile(p);
      load();
    })();
  }, []);

  const load = async () => {
    const { data } = await supabase
      .from("employees")
      .select("*")
      .order("name");
    setRows((data as Employee[]) ?? []);
  };

  const canManage = isManager(profile);

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
    setEditing({ ...empty });
    setSkillInput("");
    setOpen(true);
  };

  const openEdit = (e: Employee) => {
    setEditing({ ...e, skills: e.skills ?? [] });
    setSkillInput("");
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
    if (!editing.name) {
      toast.error("Name is required");
      return;
    }
    const payload: any = {
      name: editing.name,
      employee_code:
        editing.employee_code ||
        "EMP" + Math.floor(1000 + Math.random() * 9000),
      department: editing.department || null,
      role: editing.role || null,
      skills: editing.skills ?? [],
      email: editing.email || null,
      phone: editing.phone || null,
      employment_type: editing.employment_type || null,
      start_date: editing.start_date || null,
      status: editing.status || "active",
      business_id: profile.business_id,
    };
    let res;
    if (editing.id) {
      res = await supabase.from("employees").update(payload).eq("id", editing.id);
    } else {
      res = await supabase.from("employees").insert(payload);
    }
    if (res.error) toast.error(res.error.message);
    else {
      toast.success(editing.id ? "Employee updated" : "Employee added");
      setOpen(false);
      setEditing(null);
      load();
    }
  };

  const doDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("employees").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Employee deleted");
      setToDelete(null);
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, ID, email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterDept} onValueChange={setFilterDept}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Employee ID</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canManage && <th className="px-4 py-3 font-medium w-32 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No employees yet.
                </td>
              </tr>
            ) : (
              filtered.map((e) => (
                <tr key={e.id} className="border-t hover:bg-secondary/40 cursor-pointer" onClick={() => canManage && openEdit(e)}>
                  <td className="px-4 py-3 font-medium">{e.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{e.employee_code ?? "—"}</td>
                  <td className="px-4 py-3">{e.department ?? "—"}</td>
                  <td className="px-4 py-3">{e.role ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      (e.status ?? "active") === "active"
                        ? "bg-secondary text-[var(--navy)]"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {e.status ?? "active"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <button className="p-1.5 hover:bg-secondary rounded" onClick={() => openEdit(e)}>
                        <Pencil className="size-4" />
                      </button>
                      <button className="p-1.5 hover:bg-secondary rounded ml-1" onClick={() => setToDelete(e)}>
                        <Trash2 className="size-4 text-destructive" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit employee" : "Add employee"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-4 py-2">
              <Field label="Name *">
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <Field label="Employee ID">
                <Input
                  value={editing.employee_code ?? ""}
                  placeholder="Auto-generated if blank"
                  onChange={(e) => setEditing({ ...editing, employee_code: e.target.value })}
                />
              </Field>
              <Field label="Department">
                <Input value={editing.department ?? ""} onChange={(e) => setEditing({ ...editing, department: e.target.value })} />
              </Field>
              <Field label="Role / Position">
                <Input value={editing.role ?? ""} onChange={(e) => setEditing({ ...editing, role: e.target.value })} />
              </Field>
              <Field label="Email">
                <Input type="email" value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </Field>
              <Field label="Phone">
                <Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
              </Field>
              <Field label="Employment type">
                <Select
                  value={editing.employment_type ?? "Full-time"}
                  onValueChange={(v) => setEditing({ ...editing, employment_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-time">Full-time</SelectItem>
                    <SelectItem value="Part-time">Part-time</SelectItem>
                    <SelectItem value="Casual">Casual</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Start date">
                <Input type="date" value={editing.start_date ?? ""} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
              </Field>
              <Field label="Status">
                <Select value={editing.status ?? "active"} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addSkill}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {(editing.skills ?? []).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-xs">
                      {s}
                      <button onClick={() => removeSkill(s)}><X className="size-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-[var(--navy)] hover:bg-[var(--navy-light)]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {toDelete?.name}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
