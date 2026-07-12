import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const EMP_TYPES = ["Full-time", "Part-time", "Casual"];
const BREAKS = [
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hour", value: 60 },
];

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [location, setLocation] = useState("");
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("17:00");
  const [openDays, setOpenDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [numEmployees, setNumEmployees] = useState(5);
  const [minAge, setMinAge] = useState(16);
  const [empTypes, setEmpTypes] = useState<string[]>(EMP_TYPES);
  const [breakOpts, setBreakOpts] = useState<number[]>([15, 30, 60]);

  const toggle = <T,>(arr: T[], v: T, setter: (a: T[]) => void) =>
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data: biz, error } = await supabase
        .from("businesses")
        .insert({
          owner_id: u.user.id,
          name,
          country,
          state,
          location,
          open_time: openTime,
          close_time: closeTime,
          open_days: openDays,
          num_employees: numEmployees,
          min_age: minAge,
          employment_types: empTypes, // Pass as native array
          break_options: [0, ...breakOpts], // Pass as native array
          is_onboarded: true,
        })
        .select()
        .single();
      if (error) throw error;
      const { data: existingProfile, error: profileLoadError } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", u.user.id)
        .maybeSingle();
      if (profileLoadError) throw profileLoadError;

      const profilePayload = {
        id: u.user.id,
        email: u.user.email ?? "",
        name: (u.user.user_metadata?.name as string | undefined) ?? "",
        role: "employer" as const,
        business_id: biz.id,
      };

      const { error: profileError } = existingProfile
        ? await supabase.from("profiles").update({ business_id: biz.id }).eq("id", u.user.id)
        : await supabase.from("profiles").insert(profilePayload);
      if (profileError) throw profileError;

      const { error: settingsError } = await supabase
        .from("settings")
        .insert({ business_id: biz.id });
      if (settingsError) throw settingsError;

      const { error: billingError } = await supabase.from("billing_subscriptions").upsert(
        {
          business_id: biz.id,
          provider: "manual",
          plan_key: "starter",
          plan_name: "Starter",
          status: "active",
          billing_interval: "monthly",
          currency: "AUD",
          amount_cents: 0,
        },
        { onConflict: "business_id" },
      );
      if (billingError) throw billingError;
      toast.success("Business set up!");
      const pendingCheckout = window.localStorage.getItem("rotaro.pendingCheckout");
      navigate({ to: pendingCheckout ? "/pricing" : "/dashboard" });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--navy)]">Set up your business</h1>
          <p className="text-sm text-muted-foreground mt-1">
            A few details so we can tailor Rotaro to you. Step {step} of 3.
          </p>
        </div>
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-secondary"}`}
            />
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="font-semibold text-lg">Business info</h2>
              <div className="space-y-2">
                <Label>Business name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme Cafe"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="Australia"
                  />
                </div>
                <div className="space-y-2">
                  <Label>State / Region</Label>
                  <Input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="VIC"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Location / Place name</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Melbourne CBD"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h2 className="font-semibold text-lg">Hours of operation</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Opening time</Label>
                  <Input
                    type="time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Closing time</Label>
                  <Input
                    type="time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Days open</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggle(openDays, d, setOpenDays)}
                      className={`px-4 h-10 rounded-md border text-sm font-medium transition-colors ${
                        openDays.includes(d)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-secondary"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <h2 className="font-semibold text-lg">Employee settings</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Number of employees</Label>
                  <Input
                    type="number"
                    min={1}
                    value={numEmployees}
                    onChange={(e) => setNumEmployees(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Minimum age</Label>
                  <Input
                    type="number"
                    min={14}
                    value={minAge}
                    onChange={(e) => setMinAge(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Employment types</Label>
                <div className="flex flex-wrap gap-2">
                  {EMP_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(empTypes, t, setEmpTypes)}
                      className={`px-4 h-10 rounded-md border text-sm font-medium transition-colors ${
                        empTypes.includes(t)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-secondary"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Available break options</Label>
                <div className="flex flex-wrap gap-2">
                  {BREAKS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      onClick={() => toggle(breakOpts, b.value, setBreakOpts)}
                      className={`px-4 h-10 rounded-md border text-sm font-medium transition-colors ${
                        breakOpts.includes(b.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background hover:bg-secondary"
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 1}>
              Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !name}>
                Continue
              </Button>
            ) : (
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Finish setup"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
