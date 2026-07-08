import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";

export type EmployeeInviteInput = {
  name: string;
  email: string;
  phone?: string | null;
  department?: string | null;
  role: string;
  employment_type: string;
  pay_rate?: number | string | null;
  date_of_birth?: string | null;
  start_date?: string | null;
  skills?: string[];
};

export type InviteCredentials = {
  employee_code: string;
  email: string;
  temp_password: string;
};

export type InviteResult = {
  success: boolean;
  employee?: unknown;
  email_sent: boolean;
  email_reason?: string | null;
  credentials: InviteCredentials;
  error?: string;
  fields?: Record<string, string>;
  upgrade_required?: boolean;
  current_plan?: string;
  current_count?: number;
  max_employees?: number;
};

const staffProxyInputSchema = z.object({
  accessToken: z.string().min(1),
  payload: z.unknown(),
});

function generateTempPassword() {
  const digits = crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000;
  const letters = crypto.randomUUID().replace(/-/g, "").slice(0, 2).toUpperCase();
  return `Rotaro@${digits}${letters}`;
}

function isValidEmail(value?: string | null) {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendInviteEmail(args: {
  to_email: string;
  employee_name: string;
  business_name: string;
  employee_code: string;
  temp_password: string;
  login_url: string;
}) {
  const { getServerConfig } = await import("@/lib/config.server");
  const config = getServerConfig();
  if (!config.email.enabled) {
    return { sent: false, reason: "Email is not configured" };
  }

  const provider = config.email.provider || "resend";
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

  const text = `Welcome, ${args.employee_name}\n\nYou have been added to ${args.business_name}.\nEmployee ID: ${args.employee_code}\nEmail: ${args.to_email}\nTemporary password: ${args.temp_password}\nLogin: ${args.login_url}`;

  const from = config.email.from;
  if (provider === "webhook") {
    if (!config.email.webhookUrl) {
      return { sent: false, reason: "EMAIL_WEBHOOK_URL is missing." };
    }
    const response = await fetch(config.email.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.email.webhookSecret ? { Authorization: `Bearer ${config.email.webhookSecret}` } : {}),
      },
      body: JSON.stringify({
        from,
        to: args.to_email,
        subject: `Your Rotaro login credentials - ${args.business_name}`,
        html,
        text,
      }),
    });
    if (!response.ok) {
      return { sent: false, reason: `Email webhook failed (${response.status}).` };
    }
    return { sent: true };
  }

  if (!config.email.resendApiKey) {
    return { sent: false, reason: "RESEND_API_KEY is missing." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.email.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to_email],
      subject: `Your Rotaro login credentials - ${args.business_name}`,
      html,
      text,
    }),
  });
  if (!response.ok) {
    return { sent: false, reason: await response.text() };
  }
  return { sent: true };
}

async function loadCaller(accessToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Error("Unauthorized");
  }
  return { supabaseAdmin, caller: data.user };
}

export const inviteEmployeeOnServer = createServerFn({ method: "POST" })
  .validator(staffProxyInputSchema)
  .handler(async ({ data }) => {
    const payload = data.payload as EmployeeInviteInput;
    const name = payload.name?.trim();
    const email = payload.email?.trim().toLowerCase();
    const position = payload.role?.trim();
    const employmentType = payload.employment_type?.trim();

    const fields: Record<string, string> = {};
    if (!name) fields.name = "Name is required";
    if (!email) fields.email = "Email is required";
    if (email && !isValidEmail(email)) fields.email = "Invalid email";
    if (!position) fields.role = "Role is required";
    if (!employmentType) fields.employment_type = "Employment type is required";
    if (Object.keys(fields).length) {
      throw Object.assign(new Error("Validation failed"), { fields, status: 422 });
    }

    const { supabaseAdmin, caller } = await loadCaller(data.accessToken);

    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, business_id")
      .eq("id", caller.id)
      .maybeSingle();
    if (profileError || !callerProfile?.business_id) {
      throw new Error("Profile not found");
    }
    if (!["employer", "manager"].includes(String(callerProfile.role))) {
      throw new Error("Only employers and managers can add employees");
    }

    const businessId = callerProfile.business_id;
    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("id, name")
      .eq("id", businessId)
      .maybeSingle();

    const { data: subscription } = await supabaseAdmin
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
      const { count } = await supabaseAdmin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "active");
      if ((count ?? 0) >= maxEmployees) {
        throw Object.assign(
          new Error(`Your ${planKey} plan allows up to ${maxEmployees} employees. Please upgrade to add more staff.`),
          {
            upgrade_required: true,
            current_plan: planKey,
            current_count: count ?? 0,
            max_employees: maxEmployees,
            status: 403,
          },
        );
      }
    }

    const { data: existingEmployee } = await supabaseAdmin
      .from("employees")
      .select("id")
      .eq("business_id", businessId)
      .ilike("email", email!)
      .maybeSingle();
    if (existingEmployee) {
      throw Object.assign(new Error("An employee with this email already exists in your organisation."), { status: 409 });
    }

    const { data: employeeCode } = await supabaseAdmin.rpc("get_next_employee_code", {
      p_business_id: businessId,
    });
    const tempPassword = generateTempPassword();

    const { data: authUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
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
      throw Object.assign(
        new Error(
          createUserError?.message?.includes("already")
            ? "This email address is already registered in Rotaro."
            : "Failed to create user account.",
        ),
        { status: createUserError?.message?.includes("already") ? 409 : 500 },
      );
    }

    const userId = authUser.user.id;
    const now = new Date().toISOString();
    const profileInsert = await supabaseAdmin.from("profiles").insert({
      id: userId,
      business_id: businessId,
      name,
      email,
      role: "employee",
      phone: payload.phone || null,
      department: payload.department || null,
      first_login: true,
      invited_by: caller.id,
      invited_at: now,
    });
    if (profileInsert.error) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error("Failed to create employee profile.");
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .insert({
        business_id: businessId,
        user_id: userId,
        employee_code: employeeCode,
        name,
        email,
        phone: payload.phone || null,
        department: payload.department || null,
        role: position,
        employment_type: employmentType,
        pay_rate: payload.pay_rate ? Number(payload.pay_rate) : null,
        date_of_birth: payload.date_of_birth || null,
        start_date: payload.start_date || new Date().toISOString().slice(0, 10),
        skills: Array.isArray(payload.skills) ? payload.skills : [],
        status: "active",
        onboarded_at: now,
      })
      .select()
      .single();
    if (employeeError || !employee) {
      await supabaseAdmin.from("profiles").delete().eq("id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(employeeError?.message || "Failed to create employee.");
    }

    const appUrl = (await import("@/lib/config.server")).getServerConfig().email.appUrl || "http://localhost:3000";
    const emailResult = await sendInviteEmail({
      to_email: email,
      employee_name: name,
      business_name: business?.name || "your organisation",
      employee_code: employeeCode || "",
      temp_password: tempPassword,
      login_url: `${String(appUrl).replace(/\/$/, "")}/staff-login`,
    });

    return {
      success: true,
      employee,
      email_sent: emailResult.sent,
      email_reason: emailResult.reason ?? null,
      credentials: {
        employee_code: String(employeeCode || ""),
        email,
        temp_password: tempPassword,
      },
    } satisfies InviteResult;
  });

export const resendEmployeeOnServer = createServerFn({ method: "POST" })
  .validator(staffProxyInputSchema.pick({ accessToken: true }).extend({ payload: z.object({ employee_id: z.string().min(1) }) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin, caller } = await loadCaller(data.accessToken);
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, business_id")
      .eq("id", caller.id)
      .maybeSingle();
    if (!callerProfile?.business_id || !["employer", "manager"].includes(String(callerProfile.role))) {
      throw new Error("Forbidden");
    }

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("*")
      .eq("id", data.payload.employee_id)
      .eq("business_id", callerProfile.business_id)
      .maybeSingle();
    if (!employee?.user_id) {
      throw new Error("Employee account not found");
    }

    const tempPassword = generateTempPassword();
    const update = await supabaseAdmin.auth.admin.updateUserById(employee.user_id, {
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
    if (update.error) {
      throw new Error(update.error.message);
    }

    await supabaseAdmin
      .from("profiles")
      .update({
        first_login: true,
        password_changed_at: null,
        invited_by: caller.id,
        invited_at: new Date().toISOString(),
      })
      .eq("id", employee.user_id);

    const { data: business } = await supabaseAdmin
      .from("businesses")
      .select("name")
      .eq("id", callerProfile.business_id)
      .maybeSingle();

    const appUrl = (await import("@/lib/config.server")).getServerConfig().email.appUrl || "http://localhost:3000";
    const emailResult = await sendInviteEmail({
      to_email: employee.email,
      employee_name: employee.name,
      business_name: business?.name || "your organisation",
      employee_code: employee.employee_code || "",
      temp_password: tempPassword,
      login_url: `${String(appUrl).replace(/\/$/, "")}/staff-login`,
    });

    return {
      success: true,
      email_sent: emailResult.sent,
      email_reason: emailResult.reason ?? null,
      credentials: {
        employee_code: String(employee.employee_code || ""),
        email: employee.email,
        temp_password: tempPassword,
      },
    } satisfies InviteResult;
  });

export async function addEmployeeWithInvite(input: EmployeeInviteInput) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session expired. Please sign in again.");
  }
  return inviteEmployeeOnServer({ data: { accessToken: session.access_token, payload: input } });
}

export async function resendEmployeeInvite(employeeId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Your session expired. Please sign in again.");
  }
  return resendEmployeeOnServer({
    data: { accessToken: session.access_token, payload: { employee_id: employeeId } },
  });
}
