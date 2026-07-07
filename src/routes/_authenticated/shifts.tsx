import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { PlanGate } from "@/components/PlanGate";

export const Route = createFileRoute("/_authenticated/shifts")({
  component: ShiftsPage,
});

type Template = {
  id: string;
  business_id: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  department: string | null;
  color: string | null;
  min_staff_required: number | null;
};

const COLORS = ["#1E2A45", "#2563EB", "#16A34A", "#DC2626", "#7C3AED", "#0891B2", "#EA580C"];
const normalizeTime = (value?: string | null) => (value ? value.slice(0, 5) : "");

const empty: Partial<Template> = {
  name: "",
  start_time: "09:00",
  end_time: "17:00",
  break_minutes: 30,
  department: "",
  color: "#1E2A45",
  min_staff_required: 1,
};

function ShiftsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (businessId?: string | null) => {
    if (!businessId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("shift_templates")
      .select("*")
      .eq("business_id", businessId)
      .order("start_time");
    if (error) {
      toast.error(error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data as Template[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
      if (nextProfile?.business_id) {
        await load(nextProfile.business_id);
      } else {
        setLoading(false);
      }
    })();
  }, [load]);

  const canManage = isManager(profile);

  const save = async () => {
    if (!editing || !profile?.business_id) return;
    if (!editing.name) {
      toast.error("Name is required");
      return;
    }
    if (!editing.start_time || !editing.end_time) {
      toast.error("Start and end time are required");
      return;
    }
    if (normalizeTime(editing.end_time) <= normalizeTime(editing.start_time)) {
      toast.error("End time must be after start time");
      return;
    }
    const payload: any = {
      business_id: profile.business_id,
      name: editing.name.trim(),
      start_time: normalizeTime(editing.start_time),
      end_time: normalizeTime(editing.end_time),
      break_minutes: Number(editing.break_minutes ?? 0),
      department: editing.department || null,
      color: editing.color || "#1E2A45",
      min_staff_required: Math.max(1, Number(editing.min_staff_required ?? 1)),
    };
    const res = editing.id
      ? await supabase.from("shift_templates").update(payload).eq("id", editing.id)
      : await supabase.from("shift_templates").insert(payload);
    if (res.error) toast.error(res.error.message);
    else {
      toast.success("Saved");
      setOpen(false);
      setEditing(null);
      load();
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this shift template?")) return;
    const { error } = await supabase.from("shift_templates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  return (
    <PlanGate
      businessId={profile?.business_id}
      required="professional"
      title="Shift Templates are a Professional feature"
      description="Reusable roster presets are included with Professional and Business plans."
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Shift Templates</h1>
            <p className="text-sm text-muted-foreground mt-1">Reusable presets for the roster.</p>
          </div>
          {canManage && (
            <Button
              onClick={() => {
                setEditing({ ...empty });
                setOpen(true);
              }}
              className="bg-[var(--navy)] hover:bg-[var(--navy-light)] w-full sm:w-auto"
            >
              <Plus className="size-4 mr-2" /> New template
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full bg-card border rounded-xl p-12 text-center text-sm text-muted-foreground">
              Loading shift templates...
            </div>
          ) : rows.length === 0 ? (
            <div className="col-span-full bg-card border rounded-xl p-12 text-center text-sm text-muted-foreground">
              No shift templates yet.
            </div>
          ) : null}
          {rows.map((t) => (
            <div key={t.id} className="bg-card border rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full"
                      style={{ background: t.color ?? "#1E2A45" }}
                    />
                    <div className="font-semibold">{t.name}</div>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {normalizeTime(t.start_time)} - {normalizeTime(t.end_time)} - {t.break_minutes}m
                    break
                  </div>
                  {t.department && (
                    <div className="text-xs text-muted-foreground mt-1">Dept: {t.department}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    Min staff: {t.min_staff_required ?? 1}
                  </div>
                </div>
                {canManage && (
                  <div className="flex gap-1">
                    <button
                      className="p-1.5 hover:bg-secondary rounded"
                      onClick={() => {
                        setEditing(t);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button className="p-1.5 hover:bg-secondary rounded" onClick={() => del(t.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Edit template" : "New shift template"}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label>Name *</Label>
                  <Input
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Morning, Evening, Night..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Start time</Label>
                  <Input
                    type="time"
                    value={editing.start_time ?? ""}
                    onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>End time</Label>
                  <Input
                    type="time"
                    value={editing.end_time ?? ""}
                    onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Break (min)</Label>
                  <Input
                    type="number"
                    value={editing.break_minutes ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, break_minutes: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Min staff required</Label>
                  <Input
                    type="number"
                    value={editing.min_staff_required ?? 1}
                    onChange={(e) =>
                      setEditing({ ...editing, min_staff_required: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <Input
                    value={editing.department ?? ""}
                    onChange={(e) => setEditing({ ...editing, department: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <Input
                    type="color"
                    value={editing.color ?? "#1E2A45"}
                    onChange={(e) => setEditing({ ...editing, color: e.target.value })}
                  />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Use ${color}`}
                        className={`size-7 rounded-md border ${
                          (editing.color ?? "#1E2A45").toLowerCase() === color.toLowerCase()
                            ? "ring-2 ring-[var(--navy)] ring-offset-2"
                            : ""
                        }`}
                        style={{ backgroundColor: color }}
                        onClick={() => setEditing({ ...editing, color })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={save} className="bg-[var(--navy)] hover:bg-[var(--navy-light)]">
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PlanGate>
  );
}
