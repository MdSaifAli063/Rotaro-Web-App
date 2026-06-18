import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Repeat } from "lucide-react";
import { toast } from "sonner";
import { fetchProfile, type Profile } from "@/lib/auth";
import { notifyManagers } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/my-roster")({
  component: MyRosterPage,
});

function MyRosterPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [emp, setEmp] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [colleagues, setColleagues] = useState<any[]>([]);
  const [colleagueShifts, setColleagueShifts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [swap, setSwap] = useState({
    my_shift_id: "",
    target_emp_id: "",
    target_shift_id: "",
    note: "",
  });

  useEffect(() => {
    (async () => {
      const p = await fetchProfile();
      setProfile(p);
      if (!p) return;
      const { data: e } = await supabase
        .from("employees")
        .select("*")
        .eq("user_id", p.id)
        .maybeSingle();
      if (!e) return;
      setEmp(e);
      const [{ data: s }, { data: c }] = await Promise.all([
        supabase
          .from("roster_shifts")
          .select("*, rosters!inner(status)")
          .eq("employee_id", e.id)
          .gte("day", new Date().toISOString().slice(0, 10))
          .order("day"),
        supabase
          .from("employees")
          .select("id, name")
          .eq("business_id", p.business_id ?? "")
          .neq("id", e.id),
      ]);
      setShifts(s ?? []);
      setColleagues(c ?? []);
    })();
  }, []);

  const loadColleagueShifts = async (empId: string) => {
    const { data } = await supabase
      .from("roster_shifts")
      .select("*")
      .eq("employee_id", empId)
      .gte("day", new Date().toISOString().slice(0, 10))
      .order("day");
    setColleagueShifts(data ?? []);
  };

  const submitSwap = async () => {
    if (!emp || !profile?.business_id) return;
    if (!swap.my_shift_id || !swap.target_emp_id || !swap.target_shift_id) {
      toast.error("Please select all shifts");
      return;
    }
    const { error } = await supabase.from("shift_swaps").insert({
      business_id: profile.business_id,
      requester_employee_id: emp.id,
      requester_shift_id: swap.my_shift_id,
      target_employee_id: swap.target_emp_id,
      target_shift_id: swap.target_shift_id,
      note: swap.note || null,
      status: "pending",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await notifyManagers({
      businessId: profile.business_id,
      type: "swap_requested",
      message: `${emp.name} requested a shift swap.`,
    });
    toast.success("Swap request submitted");
    setOpen(false);
    setSwap({ my_shift_id: "", target_emp_id: "", target_shift_id: "", note: "" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Roster</h1>
          <p className="text-sm text-muted-foreground mt-1">Your upcoming shifts.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Repeat className="size-4 mr-2" /> Request swap
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Request shift swap</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>My shift</Label>
                <Select
                  value={swap.my_shift_id}
                  onValueChange={(v) => setSwap({ ...swap, my_shift_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {shifts.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.day} · {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Colleague</Label>
                <Select
                  value={swap.target_emp_id}
                  onValueChange={(v) => {
                    setSwap({ ...swap, target_emp_id: v, target_shift_id: "" });
                    loadColleagueShifts(v);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a colleague" />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagues.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Their shift</Label>
                <Select
                  value={swap.target_shift_id}
                  onValueChange={(v) => setSwap({ ...swap, target_shift_id: v })}
                  disabled={!swap.target_emp_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select their shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {colleagueShifts.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.day} · {s.start_time?.slice(0, 5)}–{s.end_time?.slice(0, 5)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Note (optional)</Label>
                <Textarea
                  value={swap.note}
                  onChange={(e) => setSwap({ ...swap, note: e.target.value })}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={submitSwap}
                className="bg-[var(--navy)] hover:bg-[var(--navy-light)]"
              >
                Submit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Day</th>
              <th className="px-4 py-3 font-medium">Start</th>
              <th className="px-4 py-3 font-medium">End</th>
              <th className="px-4 py-3 font-medium">Break</th>
              <th className="px-4 py-3 font-medium">Hours</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  No upcoming shifts.
                </td>
              </tr>
            ) : (
              shifts.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-3">{s.day}</td>
                  <td className="px-4 py-3">{s.start_time?.slice(0, 5) ?? "—"}</td>
                  <td className="px-4 py-3">{s.end_time?.slice(0, 5) ?? "—"}</td>
                  <td className="px-4 py-3">{s.break_minutes ?? 0}m</td>
                  <td className="px-4 py-3">{s.total_hours ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
