import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-api-key, x-supabase-auth-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function generateTempPassword() {
  const digits = (crypto.getRandomValues(new Uint32Array(1))[0] % 9000) + 1000;
  const letters = crypto.randomUUID().replace(/-/g, "").slice(0, 2).toUpperCase();
  return `Rotaro@${digits}${letters}`;
}

async function sendInviteEmail(args: {
  to_email: string;
  employee_name: string;
  business_name: string;
  employee_code: string;
  temp_password: string;
  login_url: string;
}) {
  void args;
  return { sent: false, reason: "EmailJS is handled in the browser." };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });

  try {
    const {
      data: { user: caller },
    } = await authClient.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id, role, business_id")
      .eq("id", caller.id)
      .maybeSingle();

    if (
      !callerProfile?.business_id ||
      !["employer", "manager"].includes(String(callerProfile.role))
    ) {
      return json({ error: "Forbidden" }, 403);
    }

    const { employee_id } = await req.json();
    if (!employee_id) return json({ error: "Employee is required" }, 422);

    const { data: employee } = await admin
      .from("employees")
      .select("*")
      .eq("id", employee_id)
      .eq("business_id", callerProfile.business_id)
      .maybeSingle();

    if (!employee?.user_id) return json({ error: "Employee account not found" }, 404);

    const tempPassword = generateTempPassword();
    const update = await admin.auth.admin.updateUserById(employee.user_id, {
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name: employee.name,
        role: "employee",
        business_id: employee.business_id,
        employee_code: employee.employee_code,
        first_login: true,
      },
    });
    if (update.error) return json({ error: update.error.message }, 500);

    await admin
      .from("profiles")
      .update({
        first_login: true,
        password_changed_at: null,
        invited_by: caller.id,
        invited_at: new Date().toISOString(),
      })
      .eq("id", employee.user_id);

    const { data: business } = await admin
      .from("businesses")
      .select("name")
      .eq("id", callerProfile.business_id)
      .maybeSingle();

    const emailResult = await sendInviteEmail({
      to_email: employee.email,
      employee_name: employee.name,
      business_name: business?.name || "your organisation",
      employee_code: employee.employee_code || "",
      temp_password: tempPassword,
      login_url: "",
    });

    return json({
      success: true,
      email_sent: emailResult.sent,
      email_reason: emailResult.reason ?? null,
      credentials: {
        employee_code: employee.employee_code,
        email: employee.email,
        temp_password: tempPassword,
      },
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
