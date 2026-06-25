import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  Building2,
  CreditCard,
  Globe,
  Languages,
  Loader2,
  Plug,
  Shield,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type ThemeMode = "light";
type LanguageCode = "en" | "hi" | "es" | "fr" | "ar";
type GeneralNotificationKey =
  | "system_announcements"
  | "holiday_announcements"
  | "broadcast_messages"
  | "policy_updates"
  | "maintenance_alerts";
type ActivityNotificationKey =
  | "leave_requests"
  | "schedule_changes"
  | "payroll_finance_updates"
  | "mentions_in_activity"
  | "new_employee_onboarding"
  | "task_reminders";

type SettingsBlob = {
  theme: ThemeMode;
  language: LanguageCode;
  date_format: "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
  notifications: Record<GeneralNotificationKey | ActivityNotificationKey, boolean>;
  security: {
    two_factor: boolean;
    session_timeout_minutes: number;
    password_rotation_days: number;
    strong_password_required: boolean;
  };
  integrations: {
    stripe_billing_url: string;
    razorpay_billing_url: string;
    smtp_enabled: boolean;
    smtp_host: string;
    smtp_port: number;
    smtp_from: string;
    google_client_id: string;
    webhook_url: string;
  };
};

type BusinessRow = {
  id: string;
  name: string;
  country: string | null;
  state: string | null;
  location: string | null;
  open_time: string | null;
  close_time: string | null;
  abn: string | null;
  business_phone: string | null;
  business_email: string | null;
  timezone: string | null;
  min_age: number | null;
  employment_types: string[] | null;
};

const leaveTypeLabels = ["Annual", "Sick", "Casual", "Unpaid"];
const languageLabels: Record<LanguageCode, string> = {
  en: "English",
  hi: "Hindi",
  es: "Spanish",
  fr: "French",
  ar: "Arabic",
};

const defaultSettings = (): SettingsBlob => ({
  theme: "light",
  language: "en",
  date_format: "DD/MM/YYYY",
  notifications: {
    system_announcements: true,
    holiday_announcements: true,
    broadcast_messages: true,
    policy_updates: true,
    maintenance_alerts: true,
    leave_requests: true,
    schedule_changes: true,
    payroll_finance_updates: true,
    mentions_in_activity: true,
    new_employee_onboarding: true,
    task_reminders: true,
  },
  security: {
    two_factor: false,
    session_timeout_minutes: 60,
    password_rotation_days: 90,
    strong_password_required: true,
  },
  integrations: {
    stripe_billing_url: "",
    razorpay_billing_url: "",
    smtp_enabled: false,
    smtp_host: "",
    smtp_port: 587,
    smtp_from: "",
    google_client_id: "",
    webhook_url: "",
  },
});

function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tab, setTab] = useState("company");

  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [location, setLocation] = useState("");
  const [abn, setAbn] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");

  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("17:00");
  const [timezone, setTimezone] = useState("Australia/Sydney");
  const [minAge, setMinAge] = useState("16");
  const [employmentTypesText, setEmploymentTypesText] = useState("Full-time, Part-time, Casual");
  const [autoApproveLeave, setAutoApproveLeave] = useState(false);
  const [autoApproveByType, setAutoApproveByType] = useState<Record<string, boolean>>({});

  const [prefs, setPrefs] = useState<SettingsBlob>(defaultSettings());

  const canManageWorkspace = useMemo(
    () => profile?.role === "employer" || profile?.role === "manager",
    [profile],
  );
  const selectedLanguage = prefs.language;

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
      if (!nextProfile) {
        setLoading(false);
        return;
      }
      if (nextProfile && !isManager(nextProfile)) setTab("general");
      const { data: profilePrefs } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", nextProfile.id)
        .maybeSingle();

      const personalPrefs = mergePrefs(
        defaultSettings(),
        profilePrefs?.notification_preferences as Partial<SettingsBlob> | null,
      );
      setPrefs(personalPrefs);

      if (!nextProfile?.business_id) {
        setLoading(false);
        return;
      }

      setBusinessId(nextProfile.business_id);
      const [{ data: biz, error: bizError }, { data: settings, error: settingsError }] =
        await Promise.all([
          supabase
            .from("businesses")
            .select(
              "id, name, country, state, location, open_time, close_time, abn, business_phone, business_email, timezone, min_age, employment_types",
            )
            .eq("id", nextProfile.business_id)
            .maybeSingle(),
          supabase
            .from("settings")
            .select("auto_approve_leave, auto_approve_by_type, notification_settings")
            .eq("business_id", nextProfile.business_id)
            .maybeSingle(),
        ]);

      if (bizError) toast.error(bizError.message);
      if (settingsError) toast.error(settingsError.message);

      if (biz) {
        const row = biz as unknown as BusinessRow;
        setBusiness(row);
        setCompanyName(row.name || "");
        setCountry(row.country || "");
        setState(row.state || "");
        setLocation(row.location || "");
        setAbn(row.abn || "");
        setBusinessPhone(row.business_phone || "");
        setBusinessEmail(row.business_email || "");
        setOpenTime(row.open_time || "09:00");
        setCloseTime(row.close_time || "17:00");
        setTimezone(row.timezone || "Australia/Sydney");
        setMinAge(String(row.min_age ?? 16));
        setEmploymentTypesText(
          (row.employment_types ?? ["Full-time", "Part-time", "Casual"]).join(", "),
        );
      }

      if (settings && isManager(nextProfile)) {
        setAutoApproveLeave(!!settings.auto_approve_leave);
        setAutoApproveByType((settings.auto_approve_by_type as Record<string, boolean>) ?? {});
        setPrefs(
          mergePrefs(
            defaultSettings(),
            settings.notification_settings as Partial<SettingsBlob> | null,
          ),
        );
      }

      setLoading(false);
    })();
  }, []);

  const saveCompany = async () => {
    if (!businessId) return;
    setSaving("company");
    const { error } = await supabase
      .from("businesses")
      .update({
        name: companyName.trim(),
        country: country.trim() || null,
        state: state.trim() || null,
        location: location.trim() || null,
        abn: abn.trim() || null,
        business_phone: businessPhone.trim() || null,
        business_email: businessEmail.trim() || null,
      })
      .eq("id", businessId);
    setSaving(null);
    if (error) return toast.error(error.message);
    await reloadBusiness();
    toast.success("Company information saved");
  };

  const saveGeneral = async () => {
    if (!businessId) return;
    setSaving("general");
    const employmentTypes = splitList(employmentTypesText);
    const { error: businessError } = await supabase
      .from("businesses")
      .update({
        open_time: openTime,
        close_time: closeTime,
        timezone: timezone.trim() || null,
        min_age: Number.isFinite(Number(minAge)) ? Number(minAge) : 16,
        employment_types: employmentTypes,
      })
      .eq("id", businessId);
    const { error: settingsError } = await supabase.from("settings").upsert({
      business_id: businessId,
      auto_approve_leave: autoApproveLeave,
      auto_approve_by_type: autoApproveByType,
    });
    setSaving(null);
    if (businessError) return toast.error(businessError.message);
    if (settingsError) return toast.error(settingsError.message);
    await reloadAll();
    toast.success("General settings saved");
  };

  const saveEmployeeGeneral = async () => {
    await savePrefs({ date_format: prefs.date_format }, "General settings saved");
  };

  const savePrefs = async (
    patch: Partial<SettingsBlob>,
    toastMessage: string,
    storageKeys?: { language?: LanguageCode },
  ) => {
    if (!profile) return;
    const next = mergePrefs(prefs, patch);
    setPrefs(next);
    setSaving("prefs");
    if (isManager(profile) && !businessId && !profile.business_id) {
      setSaving(null);
      toast.error("Business settings are not available yet.");
      return;
    }

    const { error } = isManager(profile)
      ? await supabase.from("settings").upsert({
          business_id: (businessId ?? profile.business_id) as string,
          auto_approve_leave: autoApproveLeave,
          auto_approve_by_type: autoApproveByType,
          notification_settings: next,
        })
      : await supabase
          .from("profiles")
          .update({ notification_preferences: next })
          .eq("id", profile.id);

    setSaving(null);
    if (error) return toast.error(error.message);
    if (storageKeys?.language) localStorage.setItem("rotaro-language", storageKeys.language);
    window.dispatchEvent(new Event("rotaro-settings-changed"));
    toast.success(toastMessage);
  };

  const saveNotifications = async () => {
    await savePrefs({ notifications: prefs.notifications }, "Notification settings saved");
  };

  const clearNotifications = async () => {
    const cleared = Object.fromEntries(
      Object.keys(defaultSettings().notifications).map((key) => [key, false]),
    ) as SettingsBlob["notifications"];
    await savePrefs({ notifications: cleared }, "Notification settings cleared");
  };

  const saveSecurity = async () => {
    await savePrefs({ security: prefs.security }, "Security settings saved");
  };

  const saveIntegrations = async () => {
    await savePrefs({ integrations: prefs.integrations }, "Integration settings saved");
  };

  const saveLanguage = async () => {
    await savePrefs({ language: prefs.language }, "Language saved", { language: prefs.language });
    document.documentElement.lang = prefs.language;
  };

  const reloadBusiness = async () => {
    if (!businessId) return;
    const { data } = await supabase
      .from("businesses")
      .select(
        "id, name, country, state, location, open_time, close_time, abn, business_phone, business_email, timezone, min_age, employment_types",
      )
      .eq("id", businessId)
      .maybeSingle();
    if (data) {
      const row = data as unknown as BusinessRow;
      setBusiness(row);
      setCompanyName(row.name || "");
      setCountry(row.country || "");
      setState(row.state || "");
      setLocation(row.location || "");
      setAbn(row.abn || "");
      setBusinessPhone(row.business_phone || "");
      setBusinessEmail(row.business_email || "");
    }
  };

  const reloadAll = async () => {
    if (!businessId) return;
    const [{ data: biz }, { data: settings }] = await Promise.all([
      supabase
        .from("businesses")
        .select(
          "id, name, country, state, location, open_time, close_time, abn, business_phone, business_email, timezone, min_age, employment_types",
        )
        .eq("id", businessId)
        .maybeSingle(),
      supabase
        .from("settings")
        .select("auto_approve_leave, auto_approve_by_type, notification_settings")
        .eq("business_id", businessId)
        .maybeSingle(),
    ]);
    if (biz) setBusiness(biz as unknown as BusinessRow);
    if (settings) {
      setAutoApproveLeave(!!settings.auto_approve_leave);
      setAutoApproveByType((settings.auto_approve_by_type as Record<string, boolean>) ?? {});
      setPrefs(
        mergePrefs(
          defaultSettings(),
          settings.notification_settings as Partial<SettingsBlob> | null,
        ),
      );
    }
  };

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Loading settings...
      </div>
    );
  }

  const updateNotification = (
    key: GeneralNotificationKey | ActivityNotificationKey,
    value: boolean,
  ) => {
    setPrefs((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: value },
    }));
  };

  const updateSecurity = (key: keyof SettingsBlob["security"], value: string | boolean) => {
    setPrefs((prev) => ({
      ...prev,
      security: {
        ...prev.security,
        [key]: typeof value === "boolean" ? value : Number(value),
      },
    }));
  };

  const updateIntegration = (
    key: keyof SettingsBlob["integrations"],
    value: string | boolean | number,
  ) => {
    setPrefs((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [key]: value,
      },
    }));
  };

  const autoApproveOptions = leaveTypeLabels.map((type) => ({
    key: type.toLowerCase(),
    label: type,
    enabled: !!autoApproveByType[type],
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-sm font-medium text-[var(--navy)]/70">Preferences</div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize system preferences and configurations.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border bg-white p-1.5 shadow-sm">
          {canManageWorkspace && <TabsTrigger value="company">Company Information</TabsTrigger>}
          <TabsTrigger value="general">General Information</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {canManageWorkspace && <TabsTrigger value="billing">Billing</TabsTrigger>}
          <TabsTrigger value="security">Security</TabsTrigger>
          {canManageWorkspace && <TabsTrigger value="integrations">Integrations</TabsTrigger>}
          <TabsTrigger value="language">Language</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-4">
          <SettingsCard
            title="Company Information"
            description="Manage the core business details used across the portal."
            icon={Building2}
            action={
              <Button
                onClick={saveCompany}
                disabled={saving === "company"}
                className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
              >
                {saving === "company" && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save
              </Button>
            }
          >
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="rounded-xl border bg-[#F8FAFD] p-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--navy)] text-white shadow-sm">
                  <Building2 className="size-9" />
                </div>
                <div className="mt-4 text-sm text-muted-foreground">
                  Company logo and brand image can be added later without changing the rest of the
                  settings flow.
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <SettingField label="Company name">
                  <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                </SettingField>
                <SettingField label="ABN / Tax ID">
                  <Input value={abn} onChange={(e) => setAbn(e.target.value)} />
                </SettingField>
                <SettingField label="Business phone">
                  <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} />
                </SettingField>
                <SettingField label="Business email">
                  <Input
                    type="email"
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                  />
                </SettingField>
                <SettingField label="Country">
                  <Input value={country} onChange={(e) => setCountry(e.target.value)} />
                </SettingField>
                <SettingField label="State / Region">
                  <Input value={state} onChange={(e) => setState(e.target.value)} />
                </SettingField>
                <SettingField label="Office address" className="md:col-span-2">
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} />
                </SettingField>
              </div>
            </div>
          </SettingsCard>
        </TabsContent>

        <TabsContent value="general" className="space-y-4">
          <SettingsCard
            title="General Information"
            description="Workforce rules and display preferences."
            icon={WandSparkles}
            action={
              <Button
                onClick={canManageWorkspace ? saveGeneral : saveEmployeeGeneral}
                disabled={saving === "general" || saving === "prefs"}
                className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
              >
                {(saving === "general" || saving === "prefs") && (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                )}
                Save
              </Button>
            }
          >
            {canManageWorkspace ? (
              <div className="grid gap-4">
                <SwitchRow
                  title="Auto-approve leave requests"
                  description="When enabled, new leave requests can be approved automatically."
                  checked={autoApproveLeave}
                  onCheckedChange={setAutoApproveLeave}
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <SettingField label="Open time">
                    <Input
                      type="time"
                      value={openTime}
                      onChange={(e) => setOpenTime(e.target.value)}
                    />
                  </SettingField>
                  <SettingField label="Close time">
                    <Input
                      type="time"
                      value={closeTime}
                      onChange={(e) => setCloseTime(e.target.value)}
                    />
                  </SettingField>
                  <SettingField label="Timezone">
                    <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
                  </SettingField>
                  <SettingField label="Minimum age">
                    <Input
                      type="number"
                      min={0}
                      value={minAge}
                      onChange={(e) => setMinAge(e.target.value)}
                    />
                  </SettingField>
                  <SettingField label="Employment types" className="md:col-span-2">
                    <Input
                      value={employmentTypesText}
                      onChange={(e) => setEmploymentTypesText(e.target.value)}
                      placeholder="Full-time, Part-time, Casual"
                    />
                  </SettingField>
                </div>

                <div className="rounded-xl border bg-[#F8FAFD] p-4">
                  <div className="mb-3 text-sm font-semibold text-[var(--navy)]">
                    Auto-approve by leave type
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {autoApproveOptions.map((option) => (
                      <SwitchRow
                        key={option.key}
                        title={option.label}
                        description={`Auto-approve ${option.label.toLowerCase()} leave`}
                        checked={option.enabled}
                        onCheckedChange={(checked) =>
                          setAutoApproveByType((current) => ({
                            ...current,
                            [option.label]: checked,
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-6">
                <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                  <div>
                    <div className="text-sm font-semibold text-[var(--navy)]">Date format</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      How dates appear in lists and exports.
                    </p>
                  </div>
                  <Select
                    value={prefs.date_format}
                    onValueChange={(value) =>
                      setPrefs((prev) => ({
                        ...prev,
                        date_format: value as SettingsBlob["date_format"],
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 border-t pt-5 md:grid-cols-[260px_minmax(0,1fr)]">
                  <div>
                    <div className="text-sm font-semibold text-[var(--navy)]">Profile</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Update your name and account details.
                    </p>
                  </div>
                  <div>
                    <Link
                      to="/profile"
                      className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-[var(--navy)] hover:bg-secondary"
                    >
                      Open profile
                      <ArrowUpRight className="size-4" />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </SettingsCard>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <SettingsCard
            title="Notification settings"
            description="Manage which notifications you receive and how you stay updated."
            icon={Bell}
            action={
              <Button
                onClick={saveNotifications}
                disabled={saving === "prefs"}
                className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
              >
                {saving === "prefs" && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save
              </Button>
            }
          >
            <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-[var(--navy)]">
                  General notifications
                </div>
                <p className="text-sm text-muted-foreground">Platform and company-wide updates.</p>
              </div>
              <div className="rounded-xl border bg-[#F8FAFD] p-4">
                <div className="space-y-4">
                  <SwitchRow
                    title="System announcements"
                    description="Platform updates and important service notices."
                    checked={prefs.notifications.system_announcements}
                    onCheckedChange={(checked) =>
                      updateNotification("system_announcements", checked)
                    }
                  />
                  <SwitchRow
                    title="Holiday announcements"
                    description="When public or company holidays are added."
                    checked={prefs.notifications.holiday_announcements}
                    onCheckedChange={(checked) =>
                      updateNotification("holiday_announcements", checked)
                    }
                  />
                  <SwitchRow
                    title="Broadcast messages"
                    description="Company-wide messages from HR."
                    checked={prefs.notifications.broadcast_messages}
                    onCheckedChange={(checked) => updateNotification("broadcast_messages", checked)}
                  />
                  <SwitchRow
                    title="Policy updates"
                    description="Changes to leave or attendance policies."
                    checked={prefs.notifications.policy_updates}
                    onCheckedChange={(checked) => updateNotification("policy_updates", checked)}
                  />
                  <SwitchRow
                    title="Maintenance alerts"
                    description="Scheduled downtime or maintenance windows."
                    checked={prefs.notifications.maintenance_alerts}
                    onCheckedChange={(checked) => updateNotification("maintenance_alerts", checked)}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="text-sm font-semibold text-[var(--navy)]">
                  Activity notifications
                </div>
                <p className="text-sm text-muted-foreground">Day-to-day workforce events.</p>
              </div>
              <div className="rounded-xl border bg-[#F8FAFD] p-4">
                <div className="space-y-4">
                  <SwitchRow
                    title="Leave requests"
                    description="New, approved, or declined leave activity."
                    checked={prefs.notifications.leave_requests}
                    onCheckedChange={(checked) => updateNotification("leave_requests", checked)}
                  />
                  <SwitchRow
                    title="Schedule changes"
                    description="Roster publishes and shift updates."
                    checked={prefs.notifications.schedule_changes}
                    onCheckedChange={(checked) => updateNotification("schedule_changes", checked)}
                  />
                  <SwitchRow
                    title="Payroll and finance updates"
                    description="Finance module and payroll-related alerts."
                    checked={prefs.notifications.payroll_finance_updates}
                    onCheckedChange={(checked) =>
                      updateNotification("payroll_finance_updates", checked)
                    }
                  />
                  <SwitchRow
                    title="Mentions in activity"
                    description="When you are referenced in notifications."
                    checked={prefs.notifications.mentions_in_activity}
                    onCheckedChange={(checked) =>
                      updateNotification("mentions_in_activity", checked)
                    }
                  />
                  <SwitchRow
                    title="New employee onboarding"
                    description="When staff accounts are provisioned."
                    checked={prefs.notifications.new_employee_onboarding}
                    onCheckedChange={(checked) =>
                      updateNotification("new_employee_onboarding", checked)
                    }
                  />
                  <SwitchRow
                    title="Task reminders"
                    description="Pending approvals and follow-ups."
                    checked={prefs.notifications.task_reminders}
                    onCheckedChange={(checked) => updateNotification("task_reminders", checked)}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border bg-[#F8FAFD] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  In-app: saved. Email: SMTP optional - set EMAIL_ENABLED on server for email
                  alerts.
                </p>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={clearNotifications}
                  disabled={saving === "prefs"}
                >
                  Clear all
                </Button>
              </div>
            </div>
          </SettingsCard>
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <SettingsCard
            title="Billing"
            description="Manage plan links, provider setup, and subscription access."
            icon={CreditCard}
            action={
              <Link
                to="/billing"
                className="inline-flex items-center gap-2 rounded-md bg-[var(--navy)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--navy-light)]"
              >
                Open billing
                <ArrowUpRight className="size-4" />
              </Link>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border bg-[#F8FAFD] p-4">
                <div className="text-sm font-semibold text-[var(--navy)]">Plan control</div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Rotaro will hand off to your Stripe or Razorpay billing link after sign-in.
                </p>
                <div className="mt-4">
                  <Link
                    to="/pricing"
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--navy)] px-4 py-2 text-sm font-medium text-[var(--navy)] hover:bg-secondary"
                  >
                    View pricing
                    <ArrowUpRight className="size-4" />
                  </Link>
                </div>
              </div>
              <div className="rounded-xl border bg-[#F8FAFD] p-4">
                <div className="text-sm font-semibold text-[var(--navy)]">Provider status</div>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <div>
                    Stripe checkout URL:{" "}
                    {prefs.integrations.stripe_billing_url ? "Configured" : "Not set"}
                  </div>
                  <div>
                    Razorpay checkout URL:{" "}
                    {prefs.integrations.razorpay_billing_url ? "Configured" : "Not set"}
                  </div>
                </div>
                <div className="mt-4">
                  <Link
                    to="/billing"
                    className="inline-flex items-center gap-2 rounded-md bg-[var(--navy)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--navy-light)]"
                  >
                    Manage subscription
                    <ArrowUpRight className="size-4" />
                  </Link>
                </div>
              </div>
            </div>
          </SettingsCard>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <SettingsCard
            title="Security"
            description="Account access and session information."
            icon={Shield}
            action={
              canManageWorkspace ? (
                <Button
                  onClick={saveSecurity}
                  disabled={saving === "prefs"}
                  className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
                >
                  {saving === "prefs" && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Save
                </Button>
              ) : undefined
            }
          >
            <div className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                <div>
                  <div className="text-sm font-semibold text-[var(--navy)]">Signed in as</div>
                  <p className="mt-1 text-sm text-muted-foreground">Your Rotaro account.</p>
                </div>
                <ReadOnlyField label="Email" value={profile.email} />
              </div>
              <div className="grid gap-4 border-t pt-5 md:grid-cols-[260px_minmax(0,1fr)]">
                <div>
                  <div className="text-sm font-semibold text-[var(--navy)]">Role</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Permissions for this workspace.
                  </p>
                </div>
                <ReadOnlyField label="Access level" value={profile.role.toUpperCase()} />
              </div>
              {canManageWorkspace && (
                <div className="grid gap-4 border-t pt-5 md:grid-cols-2">
                  <SettingField label="Session timeout (minutes)">
                    <Input
                      type="number"
                      min={5}
                      value={prefs.security.session_timeout_minutes}
                      onChange={(e) => updateSecurity("session_timeout_minutes", e.target.value)}
                    />
                  </SettingField>
                  <SettingField label="Password rotation days">
                    <Input
                      type="number"
                      min={0}
                      value={prefs.security.password_rotation_days}
                      onChange={(e) => updateSecurity("password_rotation_days", e.target.value)}
                    />
                  </SettingField>
                  <SwitchRow
                    title="Require strong password"
                    description="Encourage longer passwords with symbols and numbers."
                    checked={prefs.security.strong_password_required}
                    onCheckedChange={(checked) =>
                      updateSecurity("strong_password_required", checked)
                    }
                  />
                  <SwitchRow
                    title="Two-factor authentication"
                    description="Mark 2FA as enabled for this workspace."
                    checked={prefs.security.two_factor}
                    onCheckedChange={(checked) => updateSecurity("two_factor", checked)}
                  />
                </div>
              )}
              <div className="grid gap-4 border-t pt-5 md:grid-cols-[260px_minmax(0,1fr)]">
                <div>
                  <div className="text-sm font-semibold text-[var(--navy)]">
                    Password and sign-in
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Update credentials or linked Google account.
                  </p>
                </div>
                <Link
                  to="/profile"
                  className="inline-flex items-center gap-2 rounded-md border border-[var(--navy)] px-4 py-2 text-sm font-medium text-[var(--navy)] hover:bg-secondary"
                >
                  Manage in Profile
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
            </div>
          </SettingsCard>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <SettingsCard
            title="Integrations"
            description="Connect billing, email, and sign-in services."
            icon={Plug}
            action={
              <Button
                onClick={saveIntegrations}
                disabled={saving === "prefs"}
                className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
              >
                {saving === "prefs" && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <SwitchRow
                title="SMTP email enabled"
                description="Server-side email for alerts and notifications."
                checked={prefs.integrations.smtp_enabled}
                onCheckedChange={(checked) => updateIntegration("smtp_enabled", checked)}
              />
              <ReadOnlyField
                label="Google Sign-In"
                value="Configure GOOGLE_CLIENT_ID on the server for login"
              />
              <SettingField label="SMTP host">
                <Input
                  value={prefs.integrations.smtp_host}
                  onChange={(e) => updateIntegration("smtp_host", e.target.value)}
                />
              </SettingField>
              <SettingField label="SMTP port">
                <Input
                  type="number"
                  value={prefs.integrations.smtp_port}
                  onChange={(e) => updateIntegration("smtp_port", Number(e.target.value))}
                />
              </SettingField>
              <SettingField label="Email from address">
                <Input
                  value={prefs.integrations.smtp_from}
                  onChange={(e) => updateIntegration("smtp_from", e.target.value)}
                />
              </SettingField>
              <SettingField label="Google client ID">
                <Input
                  value={prefs.integrations.google_client_id}
                  onChange={(e) => updateIntegration("google_client_id", e.target.value)}
                />
              </SettingField>
              <SettingField label="Webhook URL" className="md:col-span-2">
                <Input
                  value={prefs.integrations.webhook_url}
                  onChange={(e) => updateIntegration("webhook_url", e.target.value)}
                />
              </SettingField>
            </div>
          </SettingsCard>
        </TabsContent>

        <TabsContent value="language" className="space-y-4">
          <SettingsCard
            title="Language"
            description="Interface language preferences."
            icon={Languages}
            action={
              <Button
                onClick={saveLanguage}
                disabled={saving === "prefs"}
                className="bg-[var(--navy)] text-white hover:bg-[var(--navy-light)]"
              >
                {saving === "prefs" && <Loader2 className="mr-2 size-4 animate-spin" />}
                Save
              </Button>
            }
          >
            <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
              <div>
                <div className="text-sm font-semibold text-[var(--navy)]">Display language</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  More languages will be added in future releases.
                </p>
              </div>
              <div>
                <Select
                  value={selectedLanguage}
                  onValueChange={(value) =>
                    setPrefs((prev) => ({ ...prev, language: value as LanguageCode }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(languageLabels).map(([code, label]) => (
                      <SelectItem key={code} value={code}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-3 text-sm text-muted-foreground">
                  Rotaro is currently available in English. Regional date and time formats are
                  configured under General and Company tabs.
                </p>
              </div>
            </div>
          </SettingsCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#EEF3FA] text-[var(--navy)]">
            <Icon className="size-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[var(--navy)]">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="space-y-6 px-5 py-5">{children}</div>
    </section>
  );
}

function SettingField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-sm font-medium text-[var(--navy)]">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label className="text-sm font-medium text-[var(--navy)]">{label}</Label>
      <div className="mt-1.5 rounded-md border bg-[#F8FAFD] px-3 py-2 text-sm text-[var(--navy)]">
        {value}
      </div>
    </div>
  );
}

function SwitchRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-[#F8FAFD] px-4 py-3">
      <div className="min-w-0">
        <div className="font-medium text-[var(--navy)]">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function mergePrefs(
  base: SettingsBlob,
  raw: Partial<SettingsBlob> | null | undefined,
): SettingsBlob {
  if (!raw) return base;
  return {
    theme: "light",
    language: raw.language ?? base.language,
    date_format: raw.date_format ?? base.date_format,
    notifications: { ...base.notifications, ...(raw.notifications ?? {}) },
    security: { ...base.security, ...(raw.security ?? {}) },
    integrations: { ...base.integrations, ...(raw.integrations ?? {}) },
  };
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
