import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { PlanGate } from "@/components/PlanGate";
import {
  createStarterShiftTemplates,
  deleteShiftTemplate,
  saveShiftTemplate,
  type ShiftTemplate,
} from "@/lib/api/shift-templates.functions";

export const Route = createFileRoute("/_authenticated/shifts")({
  component: ShiftsPage,
});

type Template = ShiftTemplate;

const COLORS = ["#1E2A45", "#2563EB", "#16A34A", "#DC2626", "#7C3AED", "#0891B2", "#EA580C"];
const normalizeTime = (value?: string | null) => (value ? value.slice(0, 5) : "");
const sortTemplates = (templates: Template[]) =>
  [...templates].sort(
    (left, right) =>
      normalizeTime(left.start_time).localeCompare(normalizeTime(right.start_time)) ||
      left.name.localeCompare(right.name),
  );

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
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [provisioningDefaults, setProvisioningDefaults] = useState(false);
  const templateSyncAttempted = useRef(false);

  const load = useCallback(async (businessId?: string | null) => {
    if (!businessId) {
      setRows([]);
      setLoading(false);
      return;
    }
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
    setRows(sortTemplates((data as Template[]) ?? []));
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

  useEffect(() => {
    if (!profile?.business_id) return;

    const businessId = profile.business_id;
    const channel = supabase
      .channel(`shift-templates-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shift_templates",
          filter: `business_id=eq.${businessId}`,
        },
        () => void load(businessId),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, profile?.business_id]);

  const canManage = isManager(profile);

  const provisionStarterTemplates = useCallback(async () => {
    if (provisioningDefaults) return;
    setProvisioningDefaults(true);
    try {
      const templates = await createStarterShiftTemplates();
      setRows(sortTemplates(templates as Template[]));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create starter templates");
    } finally {
      setProvisioningDefaults(false);
    }
  }, [provisioningDefaults]);

  useEffect(() => {
    if (loading || !canManage || templateSyncAttempted.current) return;
    templateSyncAttempted.current = true;
    void provisionStarterTemplates();
  }, [canManage, loading, provisionStarterTemplates, rows.length]);

  const save = async () => {
    if (!editing || !profile?.business_id || saving) return;
    const name = editing.name?.trim() ?? "";
    if (!name) {
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
    const breakMinutes = Number(editing.break_minutes ?? 0);
    const minimumStaff = Number(editing.min_staff_required ?? 1);
    if (!Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) {
      toast.error("Break must be between 0 and 720 minutes");
      return;
    }
    if (!Number.isInteger(minimumStaff) || minimumStaff < 1 || minimumStaff > 1000) {
      toast.error("Minimum staff must be a whole number between 1 and 1,000");
      return;
    }

    const payload = {
      id: editing.id,
      name,
      start_time: normalizeTime(editing.start_time),
      end_time: normalizeTime(editing.end_time),
      break_minutes: breakMinutes,
      department: editing.department?.trim() || null,
      color: editing.color || "#1E2A45",
      min_staff_required: minimumStaff,
    };

    setSaving(true);
    try {
      const saved = (await saveShiftTemplate(payload)) as Template;
      setRows((current) =>
        sortTemplates([...current.filter((template) => template.id !== saved.id), saved]),
      );
      toast.success(editing.id ? "Shift template updated" : "Shift template created");
      setOpen(false);
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save shift template");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!profile?.business_id || deletingId) return;
    setDeletingId(id);

    try {
      await deleteShiftTemplate(id);
      setRows((current) => current.filter((template) => template.id !== id));
      toast.success("Shift template deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete shift template");
    } finally {
      setDeletingId(null);
    }
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
            <div className="col-span-full flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border bg-card p-8 text-center">
              <div>
                <p className="font-medium text-foreground">
                  {provisioningDefaults
                    ? "Setting up starter templates..."
                    : "No shift templates yet"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Reuse common working hours when building a roster.
                </p>
              </div>
              {canManage && !provisioningDefaults && (
                <Button variant="outline" onClick={() => void provisionStarterTemplates()}>
                  <Plus className="mr-2 size-4" /> Sync templates from roster
                </Button>
              )}
              {provisioningDefaults && <Loader2 className="size-5 animate-spin" />}
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
                      type="button"
                      aria-label={`Edit ${t.name}`}
                      title={`Edit ${t.name}`}
                      className="p-1.5 hover:bg-secondary rounded"
                      onClick={() => {
                        setEditing(t);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${t.name}`}
                      title={`Delete ${t.name}`}
                      disabled={deletingId === t.id}
                      className="p-1.5 hover:bg-secondary rounded disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void del(t.id)}
                    >
                      {deletingId === t.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 text-destructive" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (saving) return;
            setOpen(nextOpen);
            if (!nextOpen) setEditing(null);
          }}
        >
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
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={() => void save()}
                disabled={saving}
                className="bg-[var(--navy)] hover:bg-[var(--navy-light)]"
              >
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PlanGate>
  );
}
