import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AppPlanKey } from "@/lib/billing/plans";
import { hasPlanAtLeast, useBusinessPlan } from "@/lib/billing/plans";

type PlanGateProps = {
  businessId?: string | null;
  required: AppPlanKey;
  title: string;
  description: string;
  children: ReactNode;
};

export function PlanGate({ businessId, required, title, description, children }: PlanGateProps) {
  const { planKey, access, loading } = useBusinessPlan(businessId);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
        Checking subscription access...
      </div>
    );
  }

  if (hasPlanAtLeast(planKey, required)) return <>{children}</>;

  return (
    <LockedPlanPanel
      currentPlan={access.name}
      required={required}
      title={title}
      description={description}
    />
  );
}

export function LockedPlanPanel({
  currentPlan,
  required,
  title,
  description,
}: {
  currentPlan: string;
  required: AppPlanKey;
  title: string;
  description: string;
}) {
  const requiredName = required === "professional" ? "Professional" : "Business";

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-[var(--navy)]">
            <LockKeyhole className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-[var(--navy)]">{title}</h2>
              <Badge variant="outline">Current: {currentPlan}</Badge>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            <p className="mt-2 text-sm font-medium text-[var(--navy)]">
              Upgrade to {requiredName} to unlock this feature.
            </p>
          </div>
        </div>
        <Link to="/pricing" className="inline-flex shrink-0">
          <Button className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]">
            View plans
          </Button>
        </Link>
      </div>
    </div>
  );
}
