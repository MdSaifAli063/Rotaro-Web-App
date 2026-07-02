import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ChangeEvent, type ElementType } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  Settings,
  ShieldCheck,
  Store,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { useSignedStorageUrl } from "@/components/UserAvatar";

export const Route = createFileRoute("/_authenticated/organization")({
  component: OrganizationPage,
});

type BusinessRow = {
  id: string;
  owner_id: string;
  name: string;
  country: string | null;
  state: string | null;
  location: string | null;
  open_days: string[] | null;
  open_time: string | null;
  close_time: string | null;
  min_age: number | null;
  employment_types: string[] | null;
  break_options: number[] | null;
  num_employees: number | null;
  overtime_after_hours: number | null;
  overtime_multiplier: number | null;
  abn: string | null;
  business_phone: string | null;
  business_email: string | null;
  timezone: string | null;
  logo_url: string | null;
  is_onboarded: boolean;
};

type SettingsRow = {
  auto_approve_leave: boolean;
  auto_approve_by_type: Record<string, boolean> | null;
};

type StatsState = {
  employees: number;
  sites: number;
  shifts: number;
  leaves: number;
};

const emptyStats: StatsState = {
  employees: 0,
  sites: 0,
  shifts: 0,
  leaves: 0,
};

function OrganizationPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [stats, setStats] = useState<StatsState>(emptyStats);
  const [siteLocations, setSiteLocations] = useState<string[]>([]);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingLogo, setSavingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoPreviewUrl] = useSignedStorageUrl("avatars", logoPath);
  const canEdit = profile?.role === "employer";

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const nextProfile = await fetchProfile();
        if (!active) return;
        setProfile(nextProfile);

        if (!nextProfile) {
          setLoading(false);
          return;
        }

        if (!isManager(nextProfile)) {
          navigate({ to: "/dashboard", replace: true });
          return;
        }

        if (!nextProfile.business_id) {
          setLoading(false);
          return;
        }

        const businessId = nextProfile.business_id;
        const [
          { data: biz, error: bizError },
          { count: employeeCount, error: employeeError },
          { data: rosters, error: rosterError },
          { count: pendingLeaveCount, error: leaveError },
          { data: settingsRow, error: settingsError },
        ] = await Promise.all([
          supabase
            .from("businesses")
            .select(
              "id, owner_id, name, country, state, location, open_days, open_time, close_time, min_age, employment_types, break_options, num_employees, overtime_after_hours, overtime_multiplier, abn, business_phone, business_email, timezone, logo_url, is_onboarded",
            )
            .eq("id", businessId)
            .maybeSingle(),
          supabase
            .from("employees")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId),
          supabase.from("rosters").select("id, location").eq("business_id", businessId),
          supabase
            .from("leaves")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId)
            .eq("status", "pending"),
          supabase
            .from("settings")
            .select("auto_approve_leave, auto_approve_by_type")
            .eq("business_id", businessId)
            .maybeSingle(),
        ]);

        if (!active) return;

        if (bizError) toast.error(bizError.message);
        if (employeeError) toast.error(employeeError.message);
        if (rosterError) toast.error(rosterError.message);
        if (leaveError) toast.error(leaveError.message);
        if (settingsError) toast.error(settingsError.message);

        const nextBusiness = (biz as BusinessRow | null) ?? null;
        const rosterIds = (rosters ?? []).map((row) => row.id);
        const { count: shiftCount, error: shiftError } = rosterIds.length
          ? await supabase
              .from("roster_shifts")
              .select("id", { count: "exact", head: true })
              .in("roster_id", rosterIds)
          : { count: 0, error: null };

        if (shiftError) toast.error(shiftError.message);

        setBusiness(nextBusiness);
        setSettings((settingsRow as SettingsRow | null) ?? null);
        setLogoPath(nextBusiness?.logo_url ?? null);
        setStats({
          employees: employeeCount ?? 0,
          sites: uniqueLocations(nextBusiness, rosters ?? []).length,
          shifts: shiftCount ?? 0,
          leaves: pendingLeaveCount ?? 0,
        });
        setSiteLocations(uniqueLocations(nextBusiness, rosters ?? []));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load organization.";
        toast.error(message);
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [navigate]);

  const openPicker = () => fileRef.current?.click();

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !business) return;
    if (!canEdit) {
      toast.error("Only the employer can change organization branding.");
      return;
    }
    if (!profile?.id) {
      toast.error("Profile is still loading. Please try again in a moment.");
      return;
    }
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"].includes(file.type)) {
      toast.error("Use SVG, JPG, PNG, or WEBP images.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Logo must be smaller than 5MB.");
      return;
    }
    setSavingLogo(true);
    const previous = logoPath;
    const ext = file.name.split(".").pop() || "png";
    const path = `${profile.id}/org-logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setSavingLogo(false);
      toast.error(uploadError.message);
      return;
    }

    const { error: updateError } = await supabase
      .from("businesses")
      .update({ logo_url: path })
      .eq("id", business.id);

    if (updateError) {
      await supabase.storage.from("avatars").remove([path]);
      setSavingLogo(false);
      toast.error(updateError.message);
      return;
    }

    if (previous && !previous.startsWith("http")) {
      await supabase.storage.from("avatars").remove([previous]).catch(() => undefined);
    }

    setLogoPath(path);
    setSavingLogo(false);
    toast.success("Organization logo updated");
  };

  const removeLogo = async () => {
    if (!business) return;
    if (!canEdit) {
      toast.error("Only the employer can change organization branding.");
      return;
    }
    const current = logoPath;
    const { error } = await supabase.from("businesses").update({ logo_url: null }).eq("id", business.id);
    if (error) return toast.error(error.message);
    if (current && !current.startsWith("http")) {
      await supabase.storage.from("avatars").remove([current]).catch(() => undefined);
    }
    setLogoPath(null);
    toast.success("Organization logo removed");
  };

  const openDays = business?.open_days?.length ? business.open_days : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const employmentTypes = business?.employment_types?.length
    ? business.employment_types
    : ["Full-time", "Part-time", "Casual"];

  if (loading) {
    return <OrganizationSkeleton />;
  }

  if (!profile || !business) {
    return (
      <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground shadow-sm">
        Organization details are not available yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="text-sm font-medium text-[var(--navy)]/70">Company</div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Organization</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage your company profile, location defaults, roster rules, and organization logo
            from one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/settings"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--navy)] px-4 py-2.5 text-sm font-medium text-[var(--navy)] hover:bg-secondary"
          >
            Open settings
            <ArrowUpRight className="size-4" />
          </Link>
          <button
            type="button"
            onClick={openPicker}
            disabled={!canEdit || savingLogo}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--navy)] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[var(--navy-light)] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {savingLogo ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Upload logo
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={stats.employees} icon={Users} />
        <StatCard label="Sites" value={stats.sites} icon={Store} />
        <StatCard label="Shifts" value={stats.shifts} icon={CalendarDays} />
        <StatCard label="Leave pending" value={stats.leaves} icon={Clock3} />
      </section>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-4">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--navy)] text-white shadow-sm">
              {logoPreviewUrl ? (
                <img
                  src={logoPreviewUrl}
                  alt={business.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Building2 className="size-8" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold text-[var(--navy)]">{business.name}</h2>
              <p className="text-sm text-muted-foreground">
                {business.location || "Primary location not set"}
                {business.country ? ` · ${business.country}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Owner: {profile.name || profile.email} · Plan: Business
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
              className="hidden"
              onChange={uploadLogo}
            />
            {logoPath && (
              <button
                type="button"
                onClick={removeLogo}
                disabled={!canEdit || savingLogo}
                className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="size-4" />
                Remove logo
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <DetailCard label="Organization name" value={business.name} />
          <DetailCard label="ABN / Tax ID" value={business.abn || "Not set"} />
          <DetailCard label="Primary location" value={business.location || "Not set"} />
          <DetailCard label="Contact email" value={business.business_email || "Not set"} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <InfoPanel
          title="Region & timezone"
          icon={MapPin}
          description="Used for holidays, roster dates, and attendance timestamps."
        >
          <TwoColumnField label="Country" value={business.country || "Not set"} />
          <TwoColumnField label="State / region" value={business.state || "Not set"} />
          <TwoColumnField label="Timezone" value={business.timezone || "Not set"} />
          <TwoColumnField label="Business phone" value={business.business_phone || "Not set"} />
        </InfoPanel>

        <InfoPanel
          title="Operating hours"
          icon={Clock3}
          description="Default working windows for roster planning and attendance expectations."
        >
          <TwoColumnField
            label="Hours"
            value={`${business.open_time || "09:00"} - ${business.close_time || "17:00"}`}
          />
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Open days
            </div>
            <div className="flex flex-wrap gap-2">
              {openDays.map((day) => (
                <span
                  key={day}
                  className="rounded-full border bg-[#F8FAFD] px-3 py-1 text-xs font-medium text-[var(--navy)]"
                >
                  {day}
                </span>
              ))}
            </div>
          </div>
        </InfoPanel>

        <InfoPanel
          title="Workforce rules"
          icon={ShieldCheck}
          description="Roster planning defaults and workforce preferences."
        >
          <TwoColumnField label="Minimum employee age" value={String(business.min_age ?? 16)} />
          <TwoColumnField
            label="Overtime after"
            value={
              business.overtime_after_hours != null
                ? `${business.overtime_after_hours}h / week`
                : "Not set"
            }
          />
          <TwoColumnField
            label="Overtime multiplier"
            value={
              business.overtime_multiplier != null
                ? `${Number(business.overtime_multiplier).toFixed(2)}x`
                : "Not set"
            }
          />
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Employment types
            </div>
            <div className="flex flex-wrap gap-2">
              {employmentTypes.map((type) => (
                <span
                  key={type}
                  className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-[var(--navy)]"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </InfoPanel>

        <InfoPanel
          title="Organization policies"
          icon={ShieldCheck}
          description="Leave automation and break defaults."
        >
          <TwoColumnField
            label="Auto-approve leave"
            value={settings?.auto_approve_leave ? "Enabled" : "Disabled"}
          />
          <TwoColumnField
            label="Break options"
            value={business.break_options?.length ? business.break_options.join(", ") : "Not set"}
          />
          <TwoColumnField
            label="Planned team size"
            value={business.num_employees != null ? String(business.num_employees) : "Not set"}
          />
          <div className="text-sm text-muted-foreground">
            Changes made in Settings are reflected here automatically.
          </div>
        </InfoPanel>

        <InfoPanel
          title="Sites & locations"
          icon={Building2}
          description="Locations connected to this business and upcoming roster coverage."
        >
          {siteLocations.length ? (
            <div className="space-y-3">
              {siteLocations.map((site) => (
                <div
                  key={site}
                  className="flex items-center justify-between rounded-xl border bg-[#F8FAFD] px-4 py-3"
                >
                  <div>
                    <div className="font-medium text-[var(--navy)]">{site}</div>
                    <div className="text-xs text-muted-foreground">Linked to active rosters</div>
                  </div>
                  <MapPin className="size-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed bg-[#F8FAFD] px-4 py-3 text-sm text-muted-foreground">
              Add a primary location in Settings to start building your sites list.
            </div>
          )}
        </InfoPanel>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h3 className="text-xl font-semibold text-[var(--navy)]">Quick links</h3>
            <p className="text-sm text-muted-foreground">
              Jump straight into the parts of the app that are linked to this organization.
            </p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <QuickLink to="/staff" label="Staff directory" icon={Users} />
            <QuickLink to="/roster" label="Create roster" icon={CalendarDays} />
            <QuickLink to="/holidays" label="Holiday calendar" icon={CalendarDays} />
            <QuickLink to="/billing" label="Billing & plan" icon={CreditCard} />
            <QuickLink to="/settings" label="App settings" icon={Settings} />
            <QuickLink to="/dashboard" label="Dashboard" icon={Store} />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h3 className="text-xl font-semibold text-[var(--navy)]">Branding</h3>
            <p className="text-sm text-muted-foreground">A logo here will be used across Rotaro.</p>
          </div>
          <div className="space-y-4 p-5">
            <div className="rounded-xl border bg-[#F8FAFD] p-4">
              <div className="text-sm font-semibold text-[var(--navy)]">Current logo</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex size-12 items-center justify-center overflow-hidden rounded-xl bg-[var(--navy)] text-white">
                  {logoPreviewUrl ? (
                    <img src={logoPreviewUrl} alt={business.name} className="h-full w-full object-cover" />
                  ) : (
                    <Building2 className="size-6" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-[var(--navy)]">{business.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {logoPath ? "Saved and ready" : "No logo uploaded yet"}
                  </div>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Uploading a company logo here automatically updates your settings card and other
              business screens.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function OrganizationSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-24 animate-pulse rounded bg-secondary" />
        <div className="h-8 w-56 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-secondary" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border bg-white" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-xl border bg-white" />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-64 animate-pulse rounded-xl border bg-white" />
        <div className="h-64 animate-pulse rounded-xl border bg-white" />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ElementType;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-3xl font-bold text-[var(--navy)]">{value}</div>
        </div>
        <div className="flex size-11 items-center justify-center rounded-xl bg-[#EEF3FA] text-[var(--navy)]">
          <Icon className="size-5" />
        </div>
      </div>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-[#F8FAFD] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 break-words text-sm font-medium text-[var(--navy)]">{value}</div>
    </div>
  );
}

function InfoPanel({
  title,
  icon: Icon,
  description,
  children,
}: {
  title: string;
  icon: ElementType;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b px-5 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF3FA] text-[var(--navy)]">
          <Icon className="size-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-[var(--navy)]">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function TwoColumnField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-[#F8FAFD] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-sm font-medium text-[var(--navy)]">{value}</div>
    </div>
  );
}

function QuickLink({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: ElementType;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-xl border bg-[#F8FAFD] px-4 py-3 transition-colors hover:border-[var(--navy)] hover:bg-white"
    >
      <span className="flex items-center gap-3 text-sm font-medium text-[var(--navy)]">
        <Icon className="size-4 text-[var(--navy)]" />
        {label}
      </span>
      <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </Link>
  );
}

function uniqueLocations(business: BusinessRow | null, rosters: { location: string | null }[]) {
  const values = new Set<string>();
  if (business?.location) values.add(business.location);
  rosters.forEach((row) => {
    if (row.location) values.add(row.location);
  });
  return Array.from(values);
}
