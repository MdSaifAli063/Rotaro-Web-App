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
    employeeLimit: 0,
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
    locationLimit: 5,
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
  business: {
    key: "business",
    name: "Business",
    employeeLimit: null,
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

export const FREE_TRIAL_ACCESS: PlanAccess = {
  ...PLAN_ACCESS.business,
  key: "starter",
  name: "60-day free trial",
  employeeLimit: 10,
  locationLimit: null,
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
  const [trialActive, setTrialActive] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setTrialActive(false);

    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!mounted) return;

      if (isDemoFullAccessEmail(authData.user?.email)) {
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
        .select("plan_key,status,provider,trial_ends_at,current_period_end")
        .eq("business_id", businessId)
        .maybeSingle();

      if (!mounted) return;
      const row = data as {
        plan_key?: string | null;
        status?: string | null;
        provider?: string | null;
        trial_ends_at?: string | null;
        current_period_end?: string | null;
      } | null;
      const validTrial =
        row?.plan_key === "starter" &&
        row.status === "trialing" &&
        !!row.trial_ends_at &&
        new Date(row.trial_ends_at).getTime() > Date.now();
      const paidActive =
        row?.plan_key !== "starter" &&
        (row?.status === "active" || (row?.status === "manual" && row?.provider === "manual")) &&
        (!row?.current_period_end || new Date(row.current_period_end).getTime() > Date.now());
      setTrialActive(validTrial);
      setPlanKey(
        validTrial ? "business" : paidActive ? normalizePlanKey(row?.plan_key) : "starter",
      );
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [businessId]);

  const access = useMemo(
    () => (trialActive ? FREE_TRIAL_ACCESS : getPlanAccess(planKey)),
    [planKey, trialActive],
  );

  return { planKey, access, trialActive, loading };
}
