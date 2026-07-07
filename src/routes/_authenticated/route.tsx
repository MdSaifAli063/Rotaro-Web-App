import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, type Profile } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/client-login", search: { next: undefined } });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await fetchProfile();
        if (!p) {
          throw new Error("Unable to load your profile. Please sign in again.");
        }
        setProfile(p);
        if (p.role === "employer" && !p.business_id) {
          navigate({ to: "/onboarding" });
        }
      } catch (err: any) {
        setError(err.message ?? "Unable to load your profile.");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading your workspace…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 text-center">
        <div className="max-w-sm bg-card border rounded-xl p-8 shadow-sm">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => {
              supabase.auth.signOut();
              navigate({ to: "/client-login", search: { next: undefined }, replace: true });
            }}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  // Onboarding route renders its own layout (no sidebar)
  if (!profile.business_id && profile.role === "employer") {
    return <Outlet />;
  }

  return (
    <AppShell profile={profile}>
      <Outlet />
    </AppShell>
  );
}
