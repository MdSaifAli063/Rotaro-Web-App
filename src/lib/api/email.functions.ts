import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getServerConfig } from "../config.server";

const notificationEmailSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1),
  businessId: z.string().min(1).nullable().optional(),
  type: z.string().min(1),
  message: z.string().min(1),
  relatedId: z.string().nullable().optional(),
  subject: z.string().optional(),
});

type ProfileRecipient = {
  id: string;
  name: string | null;
  email: string | null;
  notification_preferences?: Record<string, boolean> | null;
};

type BusinessSummary = {
  id: string;
  name: string | null;
  business_email?: string | null;
};

export const sendNotificationEmails = createServerFn({ method: "POST" })
  .validator(notificationEmailSchema)
  .handler(async ({ data }) => {
    const config = getServerConfig();
    if (!config.email.enabled) return { sent: 0, skipped: "disabled" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userIds = Array.from(new Set(data.userIds.filter(Boolean)));
    if (!userIds.length) return { sent: 0, skipped: "no_recipients" as const };

    const { data: profileRows, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, notification_preferences")
      .in("id", userIds);
    if (profilesError) throw new Error(profilesError.message);

    const recipients = ((profileRows ?? []) as ProfileRecipient[])
      .filter((profile) => isValidEmail(profile.email))
      .filter((profile) => isEmailPreferenceAllowed(profile, data.type));
    if (!recipients.length) return { sent: 0, skipped: "no_emails" as const };

    const business = data.businessId
      ? await loadBusiness(data.businessId, supabaseAdmin)
      : null;
    const subject = data.subject || subjectForType(data.type, business?.name);
    const url = actionUrl(config.email.appUrl, data.type, data.relatedId);
    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        sendOneEmail({
          provider: config.email.provider,
          resendApiKey: config.email.resendApiKey,
          webhookUrl: config.email.webhookUrl,
          webhookSecret: config.email.webhookSecret,
          from: config.email.from,
          replyTo: config.email.replyTo || business?.business_email || undefined,
          to: recipient.email!,
          subject,
          html: renderEmailHtml({
            recipientName: recipient.name,
            businessName: business?.name,
            message: data.message,
            type: data.type,
            url,
          }),
          text: renderEmailText({
            businessName: business?.name,
            message: data.message,
            url,
          }),
          metadata: {
            userId: recipient.id,
            businessId: data.businessId ?? null,
            type: data.type,
            relatedId: data.relatedId ?? null,
          },
        }),
      ),
    );

    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length === results.length) {
      const first = failed[0] as PromiseRejectedResult;
      throw new Error(first.reason?.message ?? "Email delivery failed.");
    }

    return {
      sent: results.filter((result) => result.status === "fulfilled").length,
      failed: failed.length,
    };
  });

async function loadBusiness(businessId: string, supabaseAdmin: any): Promise<BusinessSummary | null> {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("id, name, business_email")
    .eq("id", businessId)
    .maybeSingle();
  if (error) return null;
  return data as BusinessSummary | null;
}

function isValidEmail(value?: string | null) {
  return !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isEmailPreferenceAllowed(profile: ProfileRecipient, type: string) {
  const prefs = (profile.notification_preferences ?? {}) as Record<string, boolean>;
  const key =
    type.includes("leave") && !type.includes("leave_requested")
      ? "leave_decision"
      : type.includes("leave_requested")
        ? "leave_submitted"
        : type.includes("swap_requested")
          ? "swap_requested"
          : type.includes("swap")
            ? "swap_decision"
            : type.includes("attendance")
              ? "late_checkin"
              : type.includes("roster")
                ? "roster_published"
                : type.includes("upcoming_shift")
                  ? "upcoming_shift"
                  : null;
  if (!key) return true;
  return prefs[key] !== false;
}

function subjectForType(type: string, businessName?: string | null) {
  const prefix = businessName || "Rotaro";
  if (type.includes("roster")) return `${prefix}: roster update`;
  if (type.includes("leave")) return `${prefix}: leave update`;
  if (type.includes("swap")) return `${prefix}: shift swap update`;
  if (type.includes("attendance")) return `${prefix}: attendance update`;
  if (type.includes("message")) return `${prefix}: new message`;
  if (type.includes("holiday")) return `${prefix}: holiday update`;
  return `${prefix}: workspace update`;
}

function actionUrl(appUrl?: string | null, type?: string, relatedId?: string | null) {
  if (!appUrl) return undefined;
  const base = appUrl.startsWith("http") ? appUrl : `https://${appUrl}`;
  const path = type?.includes("roster")
    ? "/my-roster"
    : type?.includes("leave_requested")
      ? "/leaves"
      : type?.includes("leave")
        ? "/apply-leave"
        : type?.includes("swap")
          ? "/swaps"
          : type?.includes("attendance")
            ? "/attendance"
            : type?.includes("message")
              ? "/messages"
              : type?.includes("holiday")
                ? "/holidays"
                : "/";
  const url = new URL(path, base);
  if (relatedId) url.searchParams.set("ref", relatedId);
  return url.toString();
}

function renderEmailHtml({
  recipientName,
  businessName,
  message,
  type,
  url,
}: {
  recipientName?: string | null;
  businessName?: string | null;
  message: string;
  type: string;
  url?: string;
}) {
  const title = escapeHtml(subjectForType(type, businessName));
  const greeting = recipientName ? `Hi ${escapeHtml(recipientName)},` : "Hi,";
  const action = url
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#17233b;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">Open in Rotaro</a></p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fb;font-family:Arial,sans-serif;color:#17233b">
    <div style="max-width:620px;margin:0 auto;padding:28px 16px">
      <div style="background:#ffffff;border:1px solid #dfe5ee;border-radius:12px;overflow:hidden">
        <div style="background:#17233b;color:#ffffff;padding:20px 24px;font-size:18px;font-weight:700">Rotaro</div>
        <div style="padding:24px">
          <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">${title}</h1>
          <p style="margin:0 0 14px">${greeting}</p>
          <p style="font-size:15px;line-height:1.6;margin:0;color:#33415c">${escapeHtml(message)}</p>
          ${action}
          <p style="margin:28px 0 0;font-size:12px;color:#7b879d">This email was sent because this update happened in your Rotaro workspace.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function renderEmailText({
  businessName,
  message,
  url,
}: {
  businessName?: string | null;
  message: string;
  url?: string;
}) {
  return `${businessName || "Rotaro"} update\n\n${message}${url ? `\n\nOpen: ${url}` : ""}`;
}

async function sendOneEmail(options: {
  provider: string;
  resendApiKey?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  metadata: Record<string, string | null>;
}) {
  if (options.provider === "webhook") {
    if (!options.webhookUrl) throw new Error("EMAIL_WEBHOOK_URL is missing.");
    const response = await fetch(options.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(options.webhookSecret ? { Authorization: `Bearer ${options.webhookSecret}` } : {}),
      },
      body: JSON.stringify(options),
    });
    if (!response.ok) throw new Error(`Email webhook failed (${response.status}).`);
    return;
  }

  if (!options.resendApiKey) throw new Error("RESEND_API_KEY is missing.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: options.from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      reply_to: options.replyTo,
    }),
  });
  if (!response.ok) throw new Error(`Resend email failed (${response.status}).`);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
