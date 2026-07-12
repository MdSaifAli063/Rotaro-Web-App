import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppPlanKey = "starter" | "professional" | "business";
export type PlanFeature =
  | "basicRoster"
  | "publishRoster"
  | "downloadRoster"
  | "shiftTemplates"
  | "reports"
  | "holidayImport"
  | "leaveManagement"
  | "pdfExtractor"
  | "finance"
  | "emailToExtract"
  | "customHolidaySetup"
  | "prioritySupport"
  | "phoneSupport";

export type PlanAccess = {
  key: AppPlanKey;
  name: string;
  employeeLimit: number | null;
  locationLimit: number | null;
  features: Record<PlanFeature, boolean>;
};

export const DEMO_FULL_ACCESS_EMAILS = new Set(["employer@rotaro.com"]);

export const PLAN_ACCESS: Record<AppPlanKey, PlanAccess> = {
  starter: {
    key: "starter",
    name: "Starter",
    employeeLimit: 5,
    locationLimit: 1,
    features: {
      basicRoster: true,
      publishRoster: false,
      downloadRoster: false,
      shiftTemplates: false,
      reports: false,
      holidayImport: false,
      leaveManagement: false,
      pdfExtractor: false,
      finance: false,
      emailToExtract: false,
      customHolidaySetup: false,
      prioritySupport: false,
      phoneSupport: false,
    },
  },
  professional: {
    key: "professional",
    name: "Professional",
    employeeLimit: 1000,
    locationLimit: 3,
    features: {
      basicRoster: true,
      publishRoster: true,
      downloadRoster: true,
      shiftTemplates: true,
      reports: true,
      holidayImport: true,
      leaveManagement: true,
      pdfExtractor: true,
      finance: false,
      emailToExtract: false,
      customHolidaySetup: false,
      prioritySupport: true,
      phoneSupport: false,
    },
  },
  business: {
    key: "business",
    name: "Business",
    employeeLimit: 1000,
    locationLimit: null,
    features: {
      basicRoster: true,
      publishRoster: true,
      downloadRoster: true,
      shiftTemplates: true,
      reports: true,
      holidayImport: true,
      leaveManagement: true,
      pdfExtractor: true,
      finance: true,
      emailToExtract: true,
      customHolidaySetup: true,
      prioritySupport: true,
      phoneSupport: true,
    },
  },
};

export const PLAN_ORDER: AppPlanKey[] = ["starter", "professional", "business"];

export function normalizePlanKey(value?: string | null): AppPlanKey {
  if (value === "professional" || value === "business") return value;
  return "starter";
}

export function hasPlanAtLeast(current: AppPlanKey, required: AppPlanKey) {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required);
}

export function getPlanAccess(planKey?: string | null) {
  return PLAN_ACCESS[normalizePlanKey(planKey)];
}

export function canUseFeature(planKey: string | null | undefined, feature: PlanFeature) {
  return getPlanAccess(planKey).features[feature];
}

export function isDemoFullAccessEmail(email?: string | null) {
  return !!email && DEMO_FULL_ACCESS_EMAILS.has(email.trim().toLowerCase());
}

export function useBusinessPlan(businessId?: string | null) {
  const [planKey, setPlanKey] = useState<AppPlanKey>("starter");
  const [demoEmployer, setDemoEmployer] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setDemoEmployer(false);

    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!mounted) return;

      if (isDemoFullAccessEmail(authData.user?.email)) {
        setDemoEmployer(true);
        setPlanKey("professional");
        setLoading(false);
        return;
      }

      if (!businessId) {
        setPlanKey("starter");
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("billing_subscriptions")
        .select("plan_key,status")
        .eq("business_id", businessId)
        .maybeSingle();

      if (!mounted) return;
      const row = data as { plan_key?: string | null; status?: string | null } | null;
      const activeStatus = !row?.status || ["active", "trialing", "manual"].includes(row.status);
      setPlanKey(activeStatus ? normalizePlanKey(row?.plan_key) : "starter");
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [businessId]);

  const access = useMemo(
    () =>
      demoEmployer
        ? { ...getPlanAccess("professional"), employeeLimit: 100 }
        : getPlanAccess(planKey),
    [demoEmployer, planKey],
  );

  return { planKey, access, loading };
}
