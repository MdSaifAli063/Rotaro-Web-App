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
  business_name?: string;
};

const staffProxyInputSchema = z.object({
  accessToken: z.string().min(1),
  payload: z.unknown(),
});

function generateTempPassword() {
  const digits = (crypto.getRandomValues(new Uint32Array(1))[0] % 9000) + 1000;
  const letters = crypto.randomUUID().replace(/-/g, "").slice(0, 2).toUpperCase();
  return `Rotaro@${digits}${letters}`;
}

function isValidEmail(value?: string | null) {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
      .select("plan_key,status,provider,trial_ends_at,current_period_end")
      .eq("business_id", businessId)
      .maybeSingle();

    const validTrial =
      subscription?.plan_key === "starter" &&
      subscription.status === "trialing" &&
      !!subscription.trial_ends_at &&
      new Date(subscription.trial_ends_at).getTime() > Date.now();
    const paidActive =
      subscription?.plan_key !== "starter" &&
      (subscription?.status === "active" ||
        (subscription?.status === "manual" && subscription?.provider === "manual")) &&
      (!subscription?.current_period_end ||
        new Date(subscription.current_period_end).getTime() > Date.now());
    const planKey = validTrial
      ? "starter"
      : paidActive
        ? String(subscription?.plan_key)
        : "expired";
    const limits: Record<string, number | null> = {
      starter: 10,
      professional: 1000,
      business: null,
      expired: 0,
    };
    const maxEmployees = limits[planKey] ?? 0;
    if (maxEmployees !== null) {
      const { count } = await supabaseAdmin
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .or("status.is.null,status.neq.inactive");
      if ((count ?? 0) >= maxEmployees) {
        throw Object.assign(
          new Error(
            planKey === "expired"
              ? "Your free trial has expired. Choose a paid plan to add staff."
              : `Your ${planKey} plan allows up to ${maxEmployees} employees. Please upgrade to add more staff.`,
          ),
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
      throw Object.assign(
        new Error("An employee with this email already exists in your organisation."),
        { status: 409 },
      );
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

    return {
      success: true,
      employee,
      email_sent: false,
      email_reason: "Invite email is sent from the staff screen.",
      credentials: {
        employee_code: String(employeeCode || ""),
        email,
        temp_password: tempPassword,
      },
      business_name: business?.name || "your organisation",
    } satisfies InviteResult;
  });

export const resendEmployeeOnServer = createServerFn({ method: "POST" })
  .validator(
    staffProxyInputSchema
      .pick({ accessToken: true })
      .extend({ payload: z.object({ employee_id: z.string().min(1) }) }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin, caller } = await loadCaller(data.accessToken);
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, role, business_id")
      .eq("id", caller.id)
      .maybeSingle();
    if (
      !callerProfile?.business_id ||
      !["employer", "manager"].includes(String(callerProfile.role))
    ) {
      throw new Error("Forbidden");
    }

    const { data: employee } = await supabaseAdmin
      .from("employees")
      .select("*")
      .eq("id", data.payload.employee_id)
      .eq("business_id", callerProfile.business_id)
      .maybeSingle();
    if (!employee?.user_id || !employee.email) {
      throw new Error("Employee account or email not found");
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

    return {
      success: true,
      email_sent: false,
      email_reason: "Invite email is sent from the staff screen.",
      credentials: {
        employee_code: String(employee.employee_code || ""),
        email: employee.email,
        temp_password: tempPassword,
      },
      business_name: business?.name || "your organisation",
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
