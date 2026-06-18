import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { fetchProfile, type Profile } from "@/lib/auth";
import { notifyManagers } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/apply-leave")({
  component: ApplyLeavePage,
});

const LEAVE_TYPES = ["Annual", "Sick", "Casual", "Unpaid"];

function ApplyLeavePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [empId, setEmpId] = useState<string | null>(null);
  const [empName, setEmpName] = useState<string>("");
  const [balances, setBalances] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [form, setForm] = useState({
    leave_type: "Annual",
    from_date: "",
    to_date: "",
    reason: "",
  });

  useEffect(() => {
    (async () => {
      const p = await fetchProfile();
      setProfile(p);
      if (!p) return;
      const { data: emp } = await supabase
        .from("employees")
        .select("id, name")
        .eq("user_id", p.id)
        .maybeSingle();
      if (emp) {
        setEmpId(emp.id);
        setEmpName(emp.name);
        const [{ data: bal }, { data: hist }] = await Promise.all([
          supabase.from("leave_balances").select("*").eq("employee_id", emp.id),
          supabase
            .from("leaves")
            .select("*")
            .eq("employee_id", emp.id)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        setBalances(bal ?? []);
        setHistory(hist ?? []);
      }
    })();
  }, []);

  const submit = async () => {
    if (!empId || !profile?.business_id) return;
    if (!form.from_date || !form.to_date) {
      toast.error("Pick dates");
      return;
    }
    // check auto-approve settings
    const { data: settings } = await supabase
      .from("settings")
      .select("auto_approve_leave, auto_approve_by_type")
      .eq("business_id", profile.business_id)
      .maybeSingle();
    const perType: any = settings?.auto_approve_by_type ?? {};
    const autoApprove = settings?.auto_approve_leave === true || perType[form.leave_type] === true;

    const { error } = await supabase.from("leaves").insert({
      business_id: profile.business_id,
      employee_id: empId,
      leave_type: form.leave_type,
      from_date: form.from_date,
      to_date: form.to_date,
      reason: form.reason || null,
      status: autoApprove ? "Approved" : "Pending",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await notifyManagers({
      businessId: profile.business_id,
      type: "leave_requested",
      message: `${empName} requested ${form.leave_type} leave (${form.from_date} → ${form.to_date}).`,
    });
    toast.success(autoApprove ? "Leave auto-approved" : "Leave request submitted");
    setForm({ leave_type: "Annual", from_date: "", to_date: "", reason: "" });
    const { data: hist } = await supabase
      .from("leaves")
      .select("*")
      .eq("employee_id", empId)
      .order("created_at", { ascending: false })
      .limit(20);
    setHistory(hist ?? []);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Apply Leave</h1>
        <p className="text-sm text-muted-foreground mt-1">Submit a request and view balances.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {LEAVE_TYPES.map((t) => {
          const b = balances.find((x: any) => x.leave_type === t);
          const remaining = b ? Number(b.total_days) - Number(b.used_days) : 0;
          return (
            <div key={t} className="bg-card border rounded-xl p-4 shadow-sm">
              <div className="text-xs uppercase text-muted-foreground">{t}</div>
              <div className="text-2xl font-semibold text-[var(--navy)] mt-1">{remaining}</div>
              <div className="text-xs text-muted-foreground">days remaining</div>
            </div>
          );
        })}
      </div>

      <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
        <h2 className="font-semibold">New request</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Leave type</Label>
            <Select
              value={form.leave_type}
              onValueChange={(v) => setForm({ ...form, leave_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div />
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              value={form.from_date}
              onChange={(e) => setForm({ ...form, from_date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              value={form.to_date}
              onChange={(e) => setForm({ ...form, to_date: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Reason</Label>
            <Textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              rows={3}
            />
          </div>
        </div>
        <Button onClick={submit} className="bg-[var(--navy)] hover:bg-[var(--navy-light)]">
          Submit request
        </Button>
      </div>

      <div className="bg-card border rounded-xl overflow-x-auto">
        <div className="px-4 py-3 border-b font-semibold text-sm">History</div>
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">From</th>
              <th className="px-4 py-2 font-medium">To</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No history yet.
                </td>
              </tr>
            ) : (
              history.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-2 capitalize">{r.leave_type}</td>
                  <td className="px-4 py-2">{r.from_date}</td>
                  <td className="px-4 py-2">{r.to_date}</td>
                  <td className="px-4 py-2">
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
