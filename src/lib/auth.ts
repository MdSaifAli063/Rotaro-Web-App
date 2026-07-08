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
  first_login?: boolean | null;
  password_changed_at?: string | null;
  last_login_at?: string | null;
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
    .from("profiles" as any)
    .select(
      "id, name, email, role, business_id, department, first_login, password_changed_at, last_login_at",
    )
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile) {
    const typed = profile as Profile;
    void supabase
      .from("profiles" as any)
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", data.user.id);
    return typed;
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
    first_login: false,
  };

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    name,
    email: user.email ?? "",
    role,
    business_id: null,
  });

  if (error) {
    console.error(
      "Profile auto-creation failed. Check if 'profiles' table schema matches 'types.ts':",
      error.message,
    );
  }

  return fallbackProfile;
}

export async function changeFirstLoginPassword(newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) {
    throw new Error("Passwords do not match");
  }
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[@#$!%*?&]/.test(newPassword)) {
    throw new Error("Password must include uppercase, number, and special character.");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;

  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await supabase
      .from("profiles" as any)
      .update({
        first_login: false,
        password_changed_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      })
      .eq("id", data.user.id);
  }

  return { success: true };
}
