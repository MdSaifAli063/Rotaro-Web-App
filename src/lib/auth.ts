import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "employer" | "manager" | "employee";

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  business_id: string | null;
  department?: string | null;
};

export function isManager(p: Profile | null) {
  return !!p && (p.role === "employer" || p.role === "manager");
}

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { user, loading };
}

export async function fetchProfile(): Promise<Profile | null> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, name, email, role, business_id, department")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile) {
    return profile as Profile;
  }

  const user = data.user;
  const metadata = user.user_metadata as { name?: string; role?: AppRole } | undefined;
  const role: AppRole = metadata?.role ?? "employee";
  const name = metadata?.name ?? user.email?.split("@")[0] ?? "";

  const fallbackProfile: Profile = {
    id: user.id,
    name,
    email: user.email ?? "",
    role,
    business_id: null,
    department: null,
  };

  const { error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      name,
      email: user.email ?? "",
      role,
      business_id: null,
    });

  if (error) {
    console.warn("Unable to create missing profile row; using fallback profile.", error.message);
  }

  return fallbackProfile;
}
