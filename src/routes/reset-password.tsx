import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotaroMark } from "@/components/RotaroMark";
import { supabase } from "@/integrations/supabase/client";
import { NO_INDEX_META } from "@/lib/seo";

type ResetPasswordSearch = {
  portal?: "client" | "staff";
};

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    portal: search.portal === "staff" ? "staff" : "client",
  }),
  head: () => ({
    meta: [{ title: "Choose a new password - Rotaro" }, ...NO_INDEX_META],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { portal = "client" } = Route.useSearch();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);
  const loginPath = portal === "staff" ? "/staff-login" : "/client-login";

  useEffect(() => {
    let active = true;
    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      if (data.session) {
        setReady(true);
      } else {
        toast.error("This reset link is invalid or has expired. Request a new one.");
        navigate({ to: "/forgot-password", search: { portal }, replace: true });
      }
    };

    void syncSession();
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && active) setReady(true);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [navigate, portal]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      toast.error("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    toast.success("Password updated. Please sign in.");
    navigate({ to: loginPath, replace: true });
  };

  return (
    <div className="relative flex min-h-svh items-center justify-center px-3 py-6 sm:px-4">
      <div className="auth-angle" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <RotaroMark className="size-10" />
            <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Rotaro</h1>
          </div>
          <p className="text-sm text-muted-foreground">Create a new secure password.</p>
        </div>

        <form onSubmit={submit} className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-[var(--navy)]">
              <KeyRound className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--navy)]">Set new password</h2>
              <p className="mt-1 text-sm text-muted-foreground">Use at least 8 characters.</p>
            </div>
          </div>

          {!ready ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Verifying your reset link...
            </p>
          ) : (
            <div className="space-y-5">
              <PasswordInput
                id="new-password"
                label="New password"
                value={password}
                show={showPassword}
                onToggle={() => setShowPassword((current) => !current)}
                onChange={setPassword}
              />
              <PasswordInput
                id="confirm-password"
                label="Confirm new password"
                value={confirmation}
                show={showConfirmation}
                onToggle={() => setShowConfirmation((current) => !current)}
                onChange={setConfirmation}
              />
              <Button type="submit" className="h-11 w-full" disabled={saving}>
                {saving ? "Updating password..." : "Update password"}
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  show,
  onToggle,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  show: boolean;
  onToggle: () => void;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={8}
          required
          className="pr-10"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-[var(--navy)]"
          aria-label={show ? `Hide ${label}` : `Show ${label}`}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
