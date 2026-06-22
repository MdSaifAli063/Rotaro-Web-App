import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { Clock, LogIn, LogOut, Coffee } from "lucide-react";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

type Record = {
  id: string;
  employee_id: string;
  date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  break_start: string | null;
  break_end: string | null;
  status: string | null;
  total_hours?: number | null;
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const fmtDate = (value = new Date()) =>
  value.toLocaleDateString("en-AU", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const fmtTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "-";
const statusLabel = (value?: string | null) =>
  (value || "-").replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const breakMinutes = (row: Record) =>
  row.break_start && row.break_end
    ? Math.round((new Date(row.break_end).getTime() - new Date(row.break_start).getTime()) / 60000)
    : 0;
const workedHours = (
  row: Record,
  out = row.check_out_time ? new Date(row.check_out_time) : new Date(),
) => {
  if (!row.check_in_time) return 0;
  let minutes = (out.getTime() - new Date(row.check_in_time).getTime()) / 60000;
  minutes -= breakMinutes(row);
  return Math.max(minutes / 60, 0);
};

function AttendancePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [myEmpId, setMyEmpId] = useState<string | null>(null);
  const [today, setToday] = useState<Record | null>(null);

  useEffect(() => {
    (async () => {
      const p = await fetchProfile();
      setProfile(p);
      await load(p);
    })();
  }, []);

  const load = async (p: Profile | null) => {
    if (!p) return;
    const todayStr = todayKey();

    if (isManager(p)) {
      const { data } = await supabase
        .from("attendance_records")
        .select("*, employees(name, employee_code, department)")
        .order("date", { ascending: false })
        .limit(100);
      setRecords(data ?? []);
    } else {
      const { data: emp } = await supabase
        .from("employees")
        .select("id")
        .eq("user_id", p.id)
        .maybeSingle();
      const empId = emp?.id ?? null;
      setMyEmpId(empId);
      if (!empId) return;

      const { data } = await supabase
        .from("attendance_records")
        .select("*")
        .eq("employee_id", empId)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);
      setRecords(data ?? []);
      const t =
        (data ?? []).find(
          (r: Record) => r.date === todayStr && r.check_in_time && !r.check_out_time,
        ) ??
        (data ?? []).find((r: Record) => r.date === todayStr) ??
        null;
      setToday(t);
    }
  };

  const checkIn = async () => {
    if (!myEmpId || !profile?.business_id) return;
    const todayStr = todayKey();
    const { data: existing } = await supabase
      .from("attendance_records")
      .select("*")
      .eq("employee_id", myEmpId)
      .eq("date", todayStr)
      .is("check_out_time", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.check_in_time) {
      toast.info("You are already checked in");
      setToday(existing as Record);
      return;
    }
    const { error } = await supabase.from("attendance_records").insert({
      business_id: profile.business_id,
      employee_id: myEmpId,
      date: todayStr,
      check_in_time: new Date().toISOString(),
      status: "checked_in",
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Checked in");
      load(profile);
    }
  };

  const update = async (patch: Partial<Record>) => {
    if (!today) return;
    const { error } = await supabase.from("attendance_records").update(patch).eq("id", today.id);
    if (error) toast.error(error.message);
    else load(profile);
  };

  const checkOut = async () => {
    if (!today?.check_in_time) return;
    const out = new Date();
    await update({
      check_out_time: out.toISOString(),
      total_hours: workedHours(today, out),
      status: "completed",
    });
  };

  if (!profile) return null;

  if (!isManager(profile)) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Attendance</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track check-in, breaks, and check-out.
          </p>
        </div>

        <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-wrap gap-3 items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Today</div>
            <div className="font-semibold text-lg">{fmtDate()}</div>
            {today && (
              <div className="text-sm text-muted-foreground mt-1">
                {today.check_in_time && <>In {fmtTime(today.check_in_time)}</>}
                {today.check_out_time && <> - Out {fmtTime(today.check_out_time)}</>}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!today?.check_in_time && (
              <Button onClick={checkIn} className="bg-[var(--navy)] hover:bg-[var(--navy-light)]">
                <LogIn className="size-4 mr-2" /> Check in
              </Button>
            )}
            {today?.check_in_time && !today?.break_start && !today?.check_out_time && (
              <Button
                variant="outline"
                onClick={() => update({ break_start: new Date().toISOString() })}
              >
                <Coffee className="size-4 mr-2" /> Start break
              </Button>
            )}
            {today?.break_start && !today?.break_end && (
              <Button
                variant="outline"
                onClick={() => update({ break_end: new Date().toISOString() })}
              >
                <Coffee className="size-4 mr-2" /> End break
              </Button>
            )}
            {today?.check_in_time && !today?.check_out_time && (
              <Button onClick={checkOut}>
                <LogOut className="size-4 mr-2" /> Check out
              </Button>
            )}
          </div>
        </div>

        <div className="bg-card border rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Check In</th>
                <th className="px-4 py-3 font-medium">Check Out</th>
                <th className="px-4 py-3 font-medium">Break</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No history yet.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3">{r.date}</td>
                    <td className="px-4 py-3">{fmtTime(r.check_in_time)}</td>
                    <td className="px-4 py-3">{fmtTime(r.check_out_time)}</td>
                    <td className="px-4 py-3">
                      {r.break_start && r.break_end ? `${breakMinutes(r)}m` : "-"}
                    </td>
                    <td className="px-4 py-3">{statusLabel(r.status)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Manager view
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground mt-1">Recent attendance across your team.</p>
      </div>
      <div className="bg-card border rounded-xl overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Check In</th>
              <th className="px-4 py-3 font-medium">Check Out</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No records yet.
                </td>
              </tr>
            ) : (
              records.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3 font-medium">{r.employees?.name ?? "-"}</td>
                  <td className="px-4 py-3">{r.employees?.department ?? "-"}</td>
                  <td className="px-4 py-3">{fmtTime(r.check_in_time)}</td>
                  <td className="px-4 py-3">{fmtTime(r.check_out_time)}</td>
                  <td className="px-4 py-3">{statusLabel(r.status)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
