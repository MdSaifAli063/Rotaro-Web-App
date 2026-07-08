import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-key, x-supabase-auth-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

type EmployeePayload = {
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  role?: string;
  employment_type?: string;
  pay_rate?: number | string | null;
  date_of_birth?: string | null;
  start_date?: string | null;
  skills?: string[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function generateTempPassword() {
  const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000;
  const letters = crypto.randomUUID().replace(/-/g, "").slice(0, 2).toUpperCase();
  return `Rotaro@${digits}${letters}`;
}

async function sendWelcomeEmail(args: {
  to_email: string;
  employee_name: string;
  business_name: string;
  employee_code: string;
  temp_password: string;
  login_url: string;
}) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const emailEnabled = (Deno.env.get("EMAIL_ENABLED") ?? "true").toLowerCase() !== "false";
  if (!emailEnabled || !resendKey) {
    console.log("Email not configured; credentials generated only once.", {
      email: args.to_email,
      employee_code: args.employee_code,
    });
    return { sent: false, reason: "Email is not configured" };
  }

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px">
      <div style="max-width:580px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <div style="background:#1E2A45;color:#fff;padding:28px 32px">
          <h1 style="margin:0;font-size:24px">Rotaro</h1>
          <p style="margin:6px 0 0;color:#cbd5e1">Your staff account is ready</p>
        </div>
        <div style="padding:32px">
          <h2 style="color:#1E2A45;margin:0 0 12px">Welcome, ${args.employee_name}</h2>
          <p style="color:#475569;line-height:1.6">You have been added to <strong>${args.business_name}</strong>. Use the temporary credentials below to sign in. You will be asked to set a new password.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:18px;margin:22px 0">
            <p><strong>Employee ID:</strong> ${args.employee_code}</p>
            <p><strong>Email:</strong> ${args.to_email}</p>
            <p><strong>Temporary password:</strong> <code>${args.temp_password}</code></p>
          </div>
          <a href="${args.login_url}" style="display:block;text-align:center;background:#1E2A45;color:#fff;text-decoration:none;border-radius:8px;padding:14px 18px;font-weight:700">Login to Rotaro</a>
        </div>
      </div>
    </div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_FROM") || "Rotaro <noreply@rotaro.com>",
      to: [args.to_email],
      subject: `Your Rotaro login credentials - ${args.business_name}`,
      html,
    }),
  });

  if (!response.ok) {
    return { sent: false, reason: await response.text() };
  }

  return { sent: true };
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
      error: userError,
    } = await authClient.auth.getUser();
    if (userError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: callerProfile, error: profileError } = await admin
      .from("profiles")
      .select("id, role, business_id")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileError || !callerProfile?.business_id) return json({ error: "Profile not found" }, 404);
    if (!["employer", "manager"].includes(String(callerProfile.role))) {
      return json({ error: "Only employers and managers can add employees" }, 403);
    }

    const body = (await req.json()) as EmployeePayload;
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    const position = body.role?.trim();
    const employmentType = body.employment_type?.trim();

    const fields: Record<string, string> = {};
    if (!name) fields.name = "Name is required";
    if (!email) fields.email = "Email is required";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Invalid email";
    if (!position) fields.role = "Role is required";
    if (!employmentType) fields.employment_type = "Employment type is required";
    if (Object.keys(fields).length) return json({ error: "Validation failed", fields }, 422);

    const businessId = callerProfile.business_id;
    const { data: business } = await admin
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .maybeSingle();

    const { data: subscription } = await admin
      .from("billing_subscriptions")
      .select("plan_key,status")
      .eq("business_id", businessId)
      .maybeSingle();

    const planKey = ["active", "trialing", "manual"].includes(String(subscription?.status ?? "manual"))
      ? String(subscription?.plan_key ?? "starter")
      : "starter";
    const limits: Record<string, number | null> = { starter: 5, professional: 25, business: null };
    const maxEmployees = limits[planKey] ?? 5;
    if (maxEmployees !== null) {
      const { count } = await admin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "active");
      if ((count ?? 0) >= maxEmployees) {
        return json(
          {
            error: `Your ${planKey} plan allows up to ${maxEmployees} employees. Please upgrade to add more staff.`,
            upgrade_required: true,
            current_plan: planKey,
            current_count: count ?? 0,
            max_employees: maxEmployees,
          },
          403,
        );
      }
    }

    const { data: existingEmployee } = await admin
      .from("employees")
      .select("id")
      .eq("business_id", businessId)
      .ilike("email", email!)
      .maybeSingle();
    if (existingEmployee) {
      return json({ error: "An employee with this email already exists in your organisation." }, 409);
    }

    const { data: employeeCode } = await admin.rpc("get_next_employee_code", {
      p_business_id: businessId,
    });
    const tempPassword = generateTempPassword();

    const { data: authUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        name,
        role: "employee",
        business_id: businessId,
        employee_code: employeeCode,
        first_login: true,
      },
    });

    if (createUserError || !authUser.user) {
      return json(
        {
          error: createUserError?.message?.includes("already")
            ? "This email address is already registered in Rotaro."
            : "Failed to create user account.",
        },
        createUserError?.message?.includes("already") ? 409 : 500,
      );
    }

    const userId = authUser.user.id;
    const now = new Date().toISOString();
    const profileInsert = await admin.from("profiles").insert({
      id: userId,
      business_id: businessId,
      name,
      email,
      role: "employee",
      phone: body.phone || null,
      department: body.department || null,
      first_login: true,
      invited_by: caller.id,
      invited_at: now,
    });

    if (profileInsert.error) {
      await admin.auth.admin.deleteUser(userId);
      return json({ error: "Failed to create employee profile." }, 500);
    }

    const { data: employee, error: employeeError } = await admin
      .from("employees")
      .insert({
        business_id: businessId,
        user_id: userId,
        employee_code: employeeCode,
        name,
        email,
        phone: body.phone || null,
        department: body.department || null,
        role: position,
        employment_type: employmentType,
        pay_rate: body.pay_rate ? Number(body.pay_rate) : null,
        date_of_birth: body.date_of_birth || null,
        start_date: body.start_date || new Date().toISOString().slice(0, 10),
        skills: Array.isArray(body.skills) ? body.skills : [],
        status: "active",
        onboarded_at: now,
      })
      .select()
      .single();

    if (employeeError || !employee) {
      await admin.auth.admin.deleteUser(userId);
      await admin.from("profiles").delete().eq("id", userId);
      return json({ error: "Failed to create employee record." }, 500);
    }

    const leaveRows = [
      { leave_type: "annual", total_days: 20 },
      { leave_type: "sick", total_days: 10 },
      { leave_type: "casual", total_days: 5 },
      { leave_type: "unpaid", total_days: 0 },
    ].map((item) => ({
      business_id: businessId,
      employee_id: employee.id,
      leave_type: item.leave_type,
      total_days: item.total_days,
      used_days: 0,
    }));
    await admin.from("leave_balances").upsert(leaveRows, {
      onConflict: "employee_id,leave_type",
    });

    const appUrl = Deno.env.get("APP_URL") || Deno.env.get("EMAIL_APP_URL") || "http://localhost:3000";
    const emailResult = await sendWelcomeEmail({
      to_email: email!,
      employee_name: name!,
      business_name: business?.name || "your organisation",
      employee_code: String(employeeCode),
      temp_password: tempPassword,
      login_url: `${appUrl.replace(/\/$/, "")}/staff-login`,
    });

    return json({
      success: true,
      employee,
      email_sent: emailResult.sent,
      email_reason: emailResult.reason ?? null,
      credentials: {
        employee_code: employeeCode,
        email,
        temp_password: tempPassword,
      },
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
