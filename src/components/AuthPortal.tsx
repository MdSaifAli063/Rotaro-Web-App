import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotaroMark } from "@/components/RotaroMark";
import { fetchProfile, isManager } from "@/lib/auth";

export type AuthMode = "signin" | "signup";
export type AuthPlan = "starter" | "professional" | "business";
export type AuthPortalKind = "client" | "staff";

type AuthPortalProps = {
  portal: AuthPortalKind;
  mode?: AuthMode;
  plan?: AuthPlan;
  next?: string;
};

const portalCopy = {
  client: {
    title: "Client login",
    subtitle: "Sign in to manage your workforce, rosters, billing, and company settings.",
    expected: "client",
  },
  staff: {
    title: "Staff login",
    subtitle: "Sign in to view your roster, attendance, leave, swaps, and messages.",
    expected: "staff",
  },
} as const;

export function AuthPortal({ portal, mode = "signin", plan, next }: AuthPortalProps) {
  const navigate = useNavigate();
  const isSignup = mode === "signup";
  const copy = portalCopy[portal];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const afterLogin = next || (isSignup || plan ? "/onboarding" : "/dashboard");

  useEffect(() => {
    if (isSignup && portal !== "client") {
      navigate({ to: "/pricing", replace: true });
    }
  }, [isSignup, navigate, portal]);

  const completeLogin = async () => {
    const profile = await fetchProfile();
    if (portal === "client" && profile && !isManager(profile)) {
      await supabase.auth.signOut();
      throw new Error("This is a staff account. Please use Staff Login.");
    }
    if (portal === "staff" && profile && isManager(profile)) {
      await supabase.auth.signOut();
      throw new Error("This is a client account. Please use Client Login.");
    }
    if (profile?.first_login) {
      navigate({ to: "/change-password" as any });
      return;
    }
    navigate({ to: afterLogin });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { name, role: "employer" },
          },
        });
        if (error) throw error;
        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      await completeLogin();
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
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
          <p className="text-sm text-muted-foreground">Workforce scheduling made simple.</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm sm:p-8">
          <h2 className="mb-1 text-xl font-semibold">
            {isSignup ? "Create your client account" : copy.title}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {isSignup
              ? plan === "starter"
                ? "Create your Starter workspace. You can upgrade any time."
                : "Create your workspace before we open secure checkout."
              : copy.subtitle}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {isSignup && (
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            {!isSignup && (
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  search={{ portal }}
                  className="text-sm font-medium text-[var(--navy)] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? "Please wait..." : isSignup ? "Create account" : "Login"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {isSignup ? (
              <>
                Already have a client account?{" "}
                <Link to="/client-login" className="font-medium text-[var(--navy)] hover:underline">
                  Client login
                </Link>
              </>
            ) : portal === "client" ? (
              <>
                Need a new account?{" "}
                <Link to="/pricing" className="font-medium text-[var(--navy)] hover:underline">
                  Choose a plan first
                </Link>
              </>
            ) : (
              <>
                Are you an employer?{" "}
                <Link to="/client-login" className="font-medium text-[var(--navy)] hover:underline">
                  Client login
                </Link>
              </>
            )}
          </div>
        </div>
        <p className="relative z-10 mt-6 text-center text-xs text-white/80">
          <Link to="/" className="hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
