type EmailJsResult = { status: number; text: string };

type WelcomeEmailParams = {
  employee_name: string;
  employee_email: string;
  employee_code: string;
  temp_password: string;
  business_name: string;
};

type LeaveStatusEmailParams = {
  employee_name: string;
  employee_email: string;
  leave_status: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  total_days: number | string;
};

type RosterPublishedEmailParams = {
  employee_name: string;
  employee_email: string;
  week_dates: string;
  shift_details: string;
};

type PasswordChangedEmailParams = {
  employee_name: string;
  employee_email: string;
};

type ShiftSwapEmailParams = {
  employee_name: string;
  employee_email: string;
  swap_status: string;
  shift_date: string;
  your_shift: string;
  swap_with: string;
};

type PublicInquiryEmailParams = {
  source: "contact" | "support" | "newsletter";
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company?: string;
  country?: string;
  enquiryType?: string;
  issueType?: string;
  message?: string;
  interests?: string[];
};

type NotificationEmailParams = {
  userIds: string[];
  businessId?: string | null;
  type: string;
  message: string;
  relatedId?: string | null;
  subject?: string;
};

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;
const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) || "http://localhost:3000";
const PUBLIC_TO_EMAIL = import.meta.env.VITE_EMAILJS_PUBLIC_TO_EMAIL as string | undefined;

let initialized = false;

function appUrl(path: string) {
  return `${APP_URL.replace(/\/$/, "")}${path}`;
}

function missing(templateId?: string) {
  return !SERVICE_ID || !PUBLIC_KEY || !templateId;
}

async function send(templateId: string | undefined, params: Record<string, unknown>) {
  if (missing(templateId)) {
    console.warn("EmailJS not configured - skipping email", {
      templateId,
      to: params.employee_email || params.to_email,
    });
    return { status: 0, text: "skipped - not configured" } satisfies EmailJsResult;
  }

  const emailjs = await import("@emailjs/browser");
  if (!initialized) {
    emailjs.default.init({ publicKey: PUBLIC_KEY });
    initialized = true;
  }
  return emailjs.default.send(SERVICE_ID!, templateId!, params);
}

export async function sendEmployeeWelcomeEmail(params: WelcomeEmailParams) {
  return send(import.meta.env.VITE_EMAILJS_WELCOME_TEMPLATE_ID as string | undefined, {
    ...params,
    to_email: params.employee_email,
    login_url: appUrl("/staff-login"),
    reply_to: PUBLIC_TO_EMAIL || "support@rotaro.com",
  });
}

export async function sendLeaveStatusEmail(params: LeaveStatusEmailParams) {
  return send(import.meta.env.VITE_EMAILJS_LEAVE_TEMPLATE_ID as string | undefined, {
    ...params,
    to_email: params.employee_email,
    total_days: `${params.total_days} day(s)`,
    login_url: appUrl("/apply-leave"),
  });
}

export async function sendRosterPublishedEmail(params: RosterPublishedEmailParams) {
  return send(import.meta.env.VITE_EMAILJS_ROSTER_TEMPLATE_ID as string | undefined, {
    ...params,
    to_email: params.employee_email,
    login_url: appUrl("/my-roster"),
  });
}

export async function sendPasswordChangedEmail(params: PasswordChangedEmailParams) {
  return send(import.meta.env.VITE_EMAILJS_PASSWORD_TEMPLATE_ID as string | undefined, {
    ...params,
    to_email: params.employee_email,
    login_url: appUrl("/staff-login"),
  });
}

export async function sendShiftSwapStatusEmail(params: ShiftSwapEmailParams) {
  return send(import.meta.env.VITE_EMAILJS_LEAVE_TEMPLATE_ID as string | undefined, {
    employee_name: params.employee_name,
    employee_email: params.employee_email,
    to_email: params.employee_email,
    leave_status: params.swap_status,
    leave_type: "Shift Swap",
    from_date: params.shift_date,
    to_date: params.shift_date,
    total_days: `${params.your_shift} <-> ${params.swap_with}`,
    login_url: appUrl("/swaps"),
  });
}

export async function sendRosterPublishedToAll(
  employees: Array<{ name: string; email: string; shift_details: string }>,
  week_dates: string,
) {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const employee of employees) {
    try {
      await sendRosterPublishedEmail({
        employee_name: employee.name,
        employee_email: employee.email,
        week_dates,
        shift_details: employee.shift_details,
      });
      sent += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      failed += 1;
      errors.push(`Failed to send to ${employee.email}: ${String(error)}`);
      console.error("Roster email failed:", error);
    }
  }

  return { sent, failed, errors };
}

export async function sendPublicInquiryEmail({ data }: { data: PublicInquiryEmailParams }) {
  const templateId =
    (import.meta.env.VITE_EMAILJS_PUBLIC_TEMPLATE_ID as string | undefined) ||
    (import.meta.env.VITE_EMAILJS_PASSWORD_TEMPLATE_ID as string | undefined);
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  const sourceLabel =
    data.source === "support"
      ? "Support request"
      : data.source === "newsletter"
        ? "Newsletter signup"
        : "Contact enquiry";

  await send(templateId, {
    employee_name: fullName || data.email,
    employee_email: PUBLIC_TO_EMAIL || data.email,
    to_email: PUBLIC_TO_EMAIL || data.email,
    subject: `Rotaro ${sourceLabel}: ${fullName || data.email}`,
    source: data.source,
    from_name: fullName,
    from_email: data.email,
    phone: data.phone || "",
    company: data.company || "",
    country: data.country || "",
    enquiry_type: data.enquiryType || data.issueType || "",
    interests: data.interests?.join(", ") || "",
    message: data.message || "",
    reply_to: data.email,
    login_url: appUrl("/"),
  });

  return { sent: true };
}

export async function sendNotificationEmails({ data }: { data: NotificationEmailParams }) {
  const templateId =
    (import.meta.env.VITE_EMAILJS_NOTIFICATION_TEMPLATE_ID as string | undefined) ||
    (import.meta.env.VITE_EMAILJS_LEAVE_TEMPLATE_ID as string | undefined);
  if (missing(templateId) || !data.userIds.length) {
    return { sent: 0, skipped: "disabled" as const };
  }

  const { supabase } = await import("@/integrations/supabase/client");
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, name, email, notification_preferences")
    .in("id", Array.from(new Set(data.userIds)));
  if (error) throw error;

  const recipients = (profiles ?? []).filter((profile) => {
    const email = String(profile.email ?? "");
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  });

  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      send(templateId, {
        employee_name: recipient.name || recipient.email,
        employee_email: recipient.email,
        to_email: recipient.email,
        subject: data.subject || subjectForType(data.type),
        notification_type: data.type,
        message: data.message,
        login_url: appUrl(actionPath(data.type)),
        related_id: data.relatedId || "",
        leave_status: data.message,
        leave_type: subjectForType(data.type),
        from_date: "",
        to_date: "",
        total_days: "",
      }),
    ),
  );

  return {
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

function subjectForType(type: string) {
  if (type.includes("roster")) return "Roster update";
  if (type.includes("leave")) return "Leave update";
  if (type.includes("swap")) return "Shift swap update";
  if (type.includes("attendance")) return "Attendance update";
  if (type.includes("message")) return "New message";
  return "Workspace update";
}

function actionPath(type: string) {
  if (type.includes("roster")) return "/my-roster";
  if (type.includes("leave_requested")) return "/leaves";
  if (type.includes("leave")) return "/apply-leave";
  if (type.includes("swap")) return "/swaps";
  if (type.includes("attendance")) return "/attendance";
  if (type.includes("message")) return "/messages";
  return "/";
}
