import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { RotaroMark } from "@/components/RotaroMark";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Rotaro" },
      { name: "description", content: "Sign in to manage your team rosters with Rotaro." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [role, setRole] = useState<"employer" | "employee">("employer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { name, role },
          },
        });
        if (error) throw error;

        const user = data?.user;
        if (user) {
          const { error: profileError } = await supabase.from("profiles").insert({
            id: user.id,
            name,
            email,
            role,
            business_id: null,
          });
          if (profileError) {
            console.warn("Failed to create initial profile row:", profileError.message);
          }
        }

        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4">
      <div className="auth-angle" />
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <RotaroMark className="size-10" />
            <h1 className="text-3xl font-bold text-[var(--navy)] tracking-tight">Rotaro</h1>
          </div>
          <p className="text-muted-foreground text-sm mt-1">Workforce scheduling made simple.</p>
        </div>
        <div className="bg-card border rounded-xl shadow-sm p-8">
          <h2 className="text-xl font-semibold mb-1">
            {mode === "signin" ? "Please sign in" : "Create your account"}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            {mode === "signin" ? "Welcome back." : "Get started in under a minute."}
          </p>
          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label>Full name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>I am a…</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["employer", "employee"] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`h-10 rounded-md border text-sm font-medium capitalize transition-colors ${
                          role === r
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-secondary"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
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
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "Please wait…" : mode === "signin" ? "Login" : "Create account"}
            </Button>
          </form>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                New here?{" "}
                <button
                  className="text-[var(--navy)] font-medium hover:underline"
                  onClick={() => setMode("signup")}
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  className="text-[var(--navy)] font-medium hover:underline"
                  onClick={() => setMode("signin")}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-white/80 mt-6 relative z-10">
          <Link to="/" className="hover:underline">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
