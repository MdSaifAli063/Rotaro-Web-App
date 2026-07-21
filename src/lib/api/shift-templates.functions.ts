import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ShiftTemplate = Database["public"]["Tables"]["shift_templates"]["Row"];

export type ShiftTemplateInput = {
  id?: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  department?: string | null;
  color?: string | null;
  min_staff_required: number;
};

const requestSchema = z.object({
  accessToken: z.string().min(1),
});

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  break_minutes: z.number().int().min(0).max(720),
  department: z.string().trim().max(100).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  min_staff_required: z.number().int().min(1).max(1000),
});

const STARTER_TEMPLATES: ShiftTemplateInput[] = [
  {
    name: "Morning Shift",
    start_time: "07:00",
    end_time: "15:00",
    break_minutes: 30,
    department: null,
    color: "#16A34A",
    min_staff_required: 1,
  },
  {
    name: "Split Shift",
    start_time: "09:00",
    end_time: "13:00",
    break_minutes: 0,
    department: null,
    color: "#2563EB",
    min_staff_required: 1,
  },
  {
    name: "Afternoon Shift",
    start_time: "12:00",
    end_time: "20:00",
    break_minutes: 30,
    department: null,
    color: "#7C3AED",
    min_staff_required: 1,
  },
  {
    name: "Evening Shift",
    start_time: "15:00",
    end_time: "22:00",
    break_minutes: 30,
    department: null,
    color: "#EA580C",
    min_staff_required: 1,
  },
];

async function loadManager(accessToken: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !authData.user) throw new Error("Your session expired. Please sign in again.");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("business_id,role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError || !profile?.business_id) throw new Error("Your organization was not found.");
  if (!["employer", "manager"].includes(String(profile.role))) {
    throw new Error("Only employers and managers can manage shift templates.");
  }

  return { supabaseAdmin, businessId: profile.business_id };
}

const scheduleKey = (startTime: string, endTime: string, breakMinutes: number) =>
  `${startTime.slice(0, 5)}|${endTime.slice(0, 5)}|${breakMinutes}`;

function generatedTemplateDetails(startTime: string, endTime: string) {
  const startHour = Number(startTime.slice(0, 2));
  if (startHour >= 5 && startHour < 10) {
    return { name: "Morning Shift", color: "#16A34A" };
  }
  if (startHour >= 10 && startHour < 14) {
    return { name: "Afternoon Shift", color: "#2563EB" };
  }
  if (startHour >= 14 && startHour < 18) {
    return { name: "Evening Shift", color: "#7C3AED" };
  }
  return { name: "Night Shift", color: "#1E2A45" };
}

async function syncTemplatesFromRosters(
  supabaseAdmin: Awaited<ReturnType<typeof loadManager>>["supabaseAdmin"],
  businessId: string,
  includeStarterFallback: boolean,
) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("shift_templates")
    .select("*")
    .eq("business_id", businessId);
  if (existingError) throw new Error(`Unable to load shift templates: ${existingError.message}`);

  const current = (existing ?? []) as ShiftTemplate[];
  const { data: rosterRows, error: rosterError } = await supabaseAdmin
    .from("rosters")
    .select("id")
    .eq("business_id", businessId)
    .order("week_start", { ascending: false })
    .limit(20);
  if (rosterError) throw new Error(`Unable to inspect roster shifts: ${rosterError.message}`);

  const rosterIds = (rosterRows ?? []).map((roster) => roster.id);
  const { data: rosterShifts, error: shiftsError } = rosterIds.length
    ? await supabaseAdmin
        .from("roster_shifts")
        .select("start_time,end_time,break_minutes")
        .in("roster_id", rosterIds)
        .limit(5000)
    : { data: [], error: null };
  if (shiftsError) throw new Error(`Unable to inspect roster shifts: ${shiftsError.message}`);

  const existingSchedules = new Set(
    current.map((template) =>
      scheduleKey(template.start_time, template.end_time, template.break_minutes ?? 0),
    ),
  );
  const usedNames = new Set(current.map((template) => template.name.toLowerCase()));
  const additions = new Map<string, ShiftTemplateInput>();

  for (const shift of rosterShifts ?? []) {
    if (!shift.start_time || !shift.end_time) continue;
    const startTime = shift.start_time.slice(0, 5);
    const endTime = shift.end_time.slice(0, 5);
    const breakMinutes = Number(shift.break_minutes ?? 0);
    const key = scheduleKey(startTime, endTime, breakMinutes);
    if (existingSchedules.has(key) || additions.has(key)) continue;

    const generated = generatedTemplateDetails(startTime, endTime);
    let name = generated.name;
    if (usedNames.has(name.toLowerCase())) name = `${generated.name} (${startTime}-${endTime})`;
    let suffix = 2;
    const baseName = name;
    while (usedNames.has(name.toLowerCase())) name = `${baseName} ${suffix++}`;
    usedNames.add(name.toLowerCase());

    additions.set(key, {
      name,
      start_time: startTime,
      end_time: endTime,
      break_minutes: breakMinutes,
      department: null,
      color: generated.color,
      min_staff_required: 1,
    });
  }

  const templatesToCreate =
    additions.size > 0
      ? [...additions.values()]
      : current.length === 0 && includeStarterFallback
        ? STARTER_TEMPLATES
        : [];
  if (!templatesToCreate.length) return current;

  const { data: created, error: createError } = await supabaseAdmin
    .from("shift_templates")
    .insert(templatesToCreate.map((template) => ({ ...template, business_id: businessId })))
    .select("*");
  if (createError) throw new Error(`Unable to create shift templates: ${createError.message}`);
  return [...current, ...((created ?? []) as ShiftTemplate[])];
}

export const saveShiftTemplateOnServer = createServerFn({ method: "POST" })
  .validator(requestSchema.extend({ template: templateSchema }))
  .handler(async ({ data }) => {
    const { supabaseAdmin, businessId } = await loadManager(data.accessToken);
    const { id, ...input } = data.template;
    if (input.end_time <= input.start_time) throw new Error("End time must be after start time.");

    const result = id
      ? await supabaseAdmin
          .from("shift_templates")
          .update(input)
          .eq("id", id)
          .eq("business_id", businessId)
          .select("*")
          .maybeSingle()
      : await supabaseAdmin
          .from("shift_templates")
          .insert({ ...input, business_id: businessId })
          .select("*")
          .single();

    if (result.error) throw new Error(`Unable to save shift template: ${result.error.message}`);
    if (!result.data) throw new Error("Shift template was not found in your organization.");
    return result.data satisfies ShiftTemplate;
  });

export const deleteShiftTemplateOnServer = createServerFn({ method: "POST" })
  .validator(requestSchema.extend({ templateId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin, businessId } = await loadManager(data.accessToken);
    const { data: deleted, error } = await supabaseAdmin
      .from("shift_templates")
      .delete()
      .eq("id", data.templateId)
      .eq("business_id", businessId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`Unable to delete shift template: ${error.message}`);
    if (!deleted) throw new Error("Shift template was not found in your organization.");
    return { id: deleted.id };
  });

export const createStarterShiftTemplatesOnServer = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin, businessId } = await loadManager(data.accessToken);
    return syncTemplatesFromRosters(supabaseAdmin, businessId, true);
  });

export const syncShiftTemplatesFromRostersOnServer = createServerFn({ method: "POST" })
  .validator(requestSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin, businessId } = await loadManager(data.accessToken);
    return syncTemplatesFromRosters(supabaseAdmin, businessId, false);
  });

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your session expired. Please sign in again.");
  return session.access_token;
}

export async function saveShiftTemplate(template: ShiftTemplateInput) {
  return saveShiftTemplateOnServer({ data: { accessToken: await getAccessToken(), template } });
}

export async function deleteShiftTemplate(templateId: string) {
  return deleteShiftTemplateOnServer({
    data: { accessToken: await getAccessToken(), templateId },
  });
}

export async function createStarterShiftTemplates() {
  return createStarterShiftTemplatesOnServer({ data: { accessToken: await getAccessToken() } });
}

export async function syncShiftTemplatesFromRosters() {
  return syncShiftTemplatesFromRostersOnServer({
    data: { accessToken: await getAccessToken() },
  });
}
