import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotaroMark } from "@/components/RotaroMark";
import { supabase } from "@/integrations/supabase/client";

type ForgotPasswordSearch = {
  portal?: "client" | "staff";
};

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): ForgotPasswordSearch => ({
    portal: search.portal === "staff" ? "staff" : "client",
  }),
  head: () => ({
    meta: [
      { title: "Reset password - Rotaro" },
      { name: "description", content: "Request a secure Rotaro password reset link." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { portal = "client" } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const loginPath = portal === "staff" ? "/staff-login" : "/client-login";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    const redirectTo = `${window.location.origin}/reset-password?portal=${portal}`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    setSending(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    setSent(true);
    toast.success("Password reset email sent");
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
          <p className="text-sm text-muted-foreground">
            Secure access to your workforce workspace.
          </p>
        </div>

        <form onSubmit={submit} className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-secondary text-[var(--navy)]">
              <Mail className="size-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-[var(--navy)]">Forgot password?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your {portal === "staff" ? "staff" : "client"} account email and we will send
                a reset link.
              </p>
            </div>
          </div>

          {sent ? (
            <div className="space-y-5">
              <div className="rounded-lg border bg-secondary/40 p-4 text-sm text-muted-foreground">
                If an account exists for{" "}
                <span className="font-medium text-[var(--navy)]">{email}</span>, a password reset
                link has been sent. Check your inbox and spam folder.
              </div>
              <Button
                type="button"
                className="h-11 w-full"
                onClick={() => navigate({ to: loginPath })}
              >
                Return to login
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="recovery-email">Email address</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={sending}>
                {sending ? "Sending reset link..." : "Send reset link"}
              </Button>
            </div>
          )}

          <Link
            to={loginPath}
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[var(--navy)] hover:underline"
          >
            <ArrowLeft className="size-4" /> Back to login
          </Link>
        </form>
      </div>
    </div>
  );
}
