import { supabase } from "@/integrations/supabase/client";

type NotificationInsert = {
  user_id: string;
  business_id: string | null;
  type: string;
  message: string;
  related_id: string | null;
};

export async function notify(opts: {
  userId: string;
  businessId?: string | null;
  type: string;
  message: string;
  relatedId?: string;
}) {
  if (opts.businessId) {
    const allowed = await isUserNotificationAllowed(opts.userId, opts.type);
    if (!allowed) return;
  }
  const { error } = await supabase.from("notifications").insert({
    user_id: opts.userId,
    business_id: opts.businessId ?? null,
    type: opts.type,
    message: opts.message,
    related_id: opts.relatedId ?? null,
  });

  if (error) {
    throw new Error(`Unable to create notification: ${error.message}`);
  }
}

export async function notifyManagers(opts: {
  businessId: string;
  type: string;
  message: string;
  relatedId?: string;
}) {
  const allowed = await isBusinessNotificationAllowed(opts.businessId, opts.type);
  if (!allowed) return;
  const { data: managers, error: managersError } = await supabase
    .from("profiles")
    .select("id")
    .eq("business_id", opts.businessId)
    .in("role", ["employer", "manager"]);

  if (managersError) {
    throw new Error(`Unable to find managers for notification: ${managersError.message}`);
  }

  const rows: NotificationInsert[] = (managers ?? []).map((manager) => ({
    user_id: manager.id,
    business_id: opts.businessId,
    type: opts.type,
    message: opts.message,
    related_id: opts.relatedId ?? null,
  }));

  if (!rows.length) return;

  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    throw new Error(`Unable to create manager notifications: ${error.message}`);
  }
}

async function isUserNotificationAllowed(userId: string, type: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("notification_preferences")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return true;
  const prefs = (data.notification_preferences as Record<string, boolean>) ?? {};
  const key =
    type.includes("leave") && !type.includes("leave_requested")
      ? "leave_decision"
      : type.includes("swap")
        ? "swap_decision"
        : type.includes("roster")
          ? "roster_published"
          : type.includes("upcoming_shift")
            ? "upcoming_shift"
            : null;
  if (!key) return true;
  return prefs[key] !== false;
}

async function isBusinessNotificationAllowed(businessId: string, type: string) {
  const { data, error } = await supabase
    .from("settings")
    .select("notification_settings")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error || !data) return true;
  const prefs = (data.notification_settings as Record<string, any>) ?? {};
  const notifications = (prefs.notifications as Record<string, boolean>) ?? {};
  const key = type.includes("leave")
    ? "leave_requests"
    : type.includes("swap") || type.includes("attendance")
      ? "schedule_changes"
      : type.includes("roster")
        ? "schedule_changes"
        : type.includes("holiday")
          ? "holiday_announcements"
          : type.includes("announcement")
            ? "system_announcements"
            : null;
  if (!key) return true;
  return notifications[key] !== false;
}
