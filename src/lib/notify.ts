import { supabase } from "@/integrations/supabase/client";

export async function notify(opts: {
  userId: string;
  businessId?: string | null;
  type: string;
  message: string;
  relatedId?: string;
}) {
  await supabase.from("notifications").insert({
    user_id: opts.userId,
    business_id: opts.businessId ?? null,
    type: opts.type,
    message: opts.message,
    related_id: opts.relatedId ?? null,
  });
}

export async function notifyManagers(opts: {
  businessId: string;
  type: string;
  message: string;
  relatedId?: string;
}) {
  const { data: mgrs } = await supabase
    .from("profiles")
    .select("id")
    .eq("business_id", opts.businessId)
    .in("role", ["employer", "manager"]);
  if (!mgrs?.length) return;
  await supabase.from("notifications").insert(
    mgrs.map((m: any) => ({
      user_id: m.id,
      business_id: opts.businessId,
      type: opts.type,
      message: opts.message,
      related_id: opts.relatedId ?? null,
    })),
  );
}
