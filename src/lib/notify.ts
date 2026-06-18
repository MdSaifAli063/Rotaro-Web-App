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
