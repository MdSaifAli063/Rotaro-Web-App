import { supabase } from "@/integrations/supabase/client";

export type EmployeeLookupRow = {
  id: string;
  business_id?: string | null;
  employee_code?: string | null;
  name?: string | null;
  department?: string | null;
  role?: string | null;
  user_id?: string | null;
};

export async function findEmployeeForUser<T extends EmployeeLookupRow = EmployeeLookupRow>(
  userId: string,
  columns = "id, business_id, employee_code, name, department, role, user_id",
) {
  const { data, error } = await supabase
    .from("employees")
    .select(columns)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) return { employee: null as T | null, error };
  return { employee: ((data ?? [])[0] ?? null) as unknown as T | null, error: null };
}
