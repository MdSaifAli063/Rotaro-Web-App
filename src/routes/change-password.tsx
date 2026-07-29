import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff, LockKeyhole, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotaroMark } from "@/components/RotaroMark";
import { changeFirstLoginPassword, fetchProfile, isManager, type Profile } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { NO_INDEX_META } from "@/lib/seo";

export const Route = createFileRoute("/change-password")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Change password - Rotaro" }, ...NO_INDEX_META],
  }),
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate({ to: "/staff-login", replace: true });
        return;
      }

      const p = await fetchProfile();
      if (!p) {
        await supabase.auth.signOut();
        navigate({ to: "/staff-login", replace: true });
        return;
      }

      if (!p.first_login) {
        navigate({ to: isManager(p) ? "/dashboard" : "/my-roster", replace: true });
        return;
      }

      setProfile(p);
      setLoadingProfile(false);
    })();
  }, [navigate]);

  const requirements = useMemo(
    () => [
      { label: "At least 8 characters", ok: password.length >= 8 },
      { label: "One uppercase letter", ok: /[A-Z]/.test(password) },
      { label: "One number", ok: /[0-9]/.test(password) },
      { label: "One special character (@#$!%*?&)", ok: /[@#$!%*?&]/.test(password) },
    ],
    [password],
  );

  const met = requirements.filter((item) => item.ok).length;
  const strength = ["Weak", "Weak", "Fair", "Strong", "Very strong"][met] ?? "Weak";
  const canSubmit = met === requirements.length && password === confirm && confirm.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    try {
      await changeFirstLoginPassword(password, confirm);
      toast.success("Password set. Welcome to Rotaro.");
      setTimeout(() => {
        navigate({
          to: profile && isManager(profile) ? "/dashboard" : "/my-roster",
          replace: true,
        });
      }, 800);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to set password");
      setSaving(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading your account...
      </div>
    );
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center px-3 py-8 sm:px-4">
      <div className="auth-angle" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <RotaroMark className="size-10" />
            <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Rotaro</h1>
          </div>
          <p className="text-sm text-muted-foreground">Set your secure staff password.</p>
        </div>

        <form onSubmit={submit} className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-[var(--navy)]">
              <LockKeyhole className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--navy)]">Set Your Password</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Welcome to Rotaro. Create a secure password to continue.
              </p>
            </div>
          </div>

          {profile && (
            <div className="mb-5 rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-[var(--navy)]">
              {profile.name} - {profile.email}
            </div>
          )}

          <div className="space-y-5">
            <PasswordField
              label="New password"
              value={password}
              show={showPassword}
              setShow={setShowPassword}
              onChange={setPassword}
            />

            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full ${index < met ? "bg-[var(--navy)]" : "bg-secondary"}`}
                    style={{ opacity: index < met ? 0.35 + index * 0.2 : 1 }}
                  />
                ))}
              </div>
              <div className="text-right text-xs font-medium text-muted-foreground">{strength}</div>
            </div>

            <div className="space-y-2 rounded-lg border bg-secondary/30 p-3">
              {requirements.map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex size-5 items-center justify-center rounded-full ${
                      item.ok ? "bg-[var(--navy)] text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.ok ? <Check className="size-3" /> : <X className="size-3" />}
                  </span>
                  <span className={item.ok ? "text-[var(--navy)]" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <PasswordField
              label="Confirm password"
              value={confirm}
              show={showConfirm}
              setShow={setShowConfirm}
              onChange={setConfirm}
            />

            {confirm && password !== confirm && (
              <p className="text-sm text-destructive">Passwords do not match</p>
            )}

            <Button type="submit" className="h-11 w-full" disabled={!canSubmit || saving}>
              {saving ? "Saving your password..." : "Set Password & Continue"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  show,
  setShow,
  onChange,
}: {
  label: string;
  value: string;
  show: boolean;
  setShow: (show: boolean) => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-10"
          required
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-[var(--navy)]"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
