import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { UserAvatar, useSignedAvatarUrl } from "@/components/UserAvatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, Phone, Calendar, MapPin, Upload, Eye, EyeOff, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: "employer" | "manager" | "employee";
  business_id: string | null;
  department: string | null;
  created_at: string;
  avatar_url: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  notification_preferences: Record<string, boolean> | null;
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
};

type EmployeeRow = {
  id: string;
  employee_code: string | null;
  department: string | null;
  role: string | null;
  employment_type: string | null;
  start_date: string | null;
  skills: string[] | null;
};

const employerNotifKeys: { key: string; label: string }[] = [
  { key: "leave_submitted", label: "Email me when a leave request is submitted" },
  { key: "swap_requested", label: "Email me when a shift swap is requested" },
  { key: "late_checkin", label: "Email me about late check-ins" },
  { key: "early_checkout", label: "Email me about early check-outs" },
  { key: "long_breaks", label: "Email me about long breaks" },
  { key: "staff_shortage", label: "Email me about staff shortages" },
];

const employeeNotifKeys: { key: string; label: string }[] = [
  { key: "leave_decision", label: "Email me when my leave request is approved or rejected" },
  { key: "swap_decision", label: "Email me when a shift swap is approved or rejected" },
  { key: "upcoming_shift", label: "Email me about my upcoming shifts (1 hour before)" },
  { key: "roster_published", label: "Email me when a new roster is published" },
];

function passwordStrength(pw: string) {
  if (!pw) return { score: 0, label: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: s <= 1 ? "Weak" : s === 2 ? "Medium" : "Strong" };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-6 first:pt-0">
      <h2 className="text-lg font-bold text-[var(--navy)]">{title}</h2>
      <div className="mt-1 h-px bg-[#EEF1F6]" />
      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-sm font-medium text-[var(--navy)]">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function ProfilePage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [business, setBusiness] = useState<BusinessRow | null>(null);
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);

  // Form state — personal
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");

  // Password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Business
  const [bizName, setBizName] = useState("");
  const [abn, setAbn] = useState("");
  const [bizPhone, setBizPhone] = useState("");
  const [bizEmail, setBizEmail] = useState("");
  const [country, setCountry] = useState("");
  const [state, setState] = useState("");
  const [bizLocation, setBizLocation] = useState("");

  // Notifs
  const [notifs, setNotifs] = useState<Record<string, boolean>>({});

  // Avatar
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const isEmployer = profile?.role === "employer" || profile?.role === "manager";
  const notifList = isEmployer ? employerNotifKeys : employeeNotifKeys;
  const previewAvatarUrl = useSignedAvatarUrl(avatarPath);

  const load = async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { data: prof } = await supabase
      .from("profiles")
      .select(
        "id, name, email, role, business_id, department, created_at, avatar_url, phone, date_of_birth, gender, notification_preferences",
      )
      .eq("id", auth.user.id)
      .maybeSingle();
    if (!prof) {
      setLoading(false);
      return;
    }
    const p = prof as unknown as ProfileRow;
    setProfile(p);
    const nameParts = (p.name || "").split(/\s+/);
    setFirstName(nameParts[0] || "");
    setLastName(nameParts.slice(1).join(" "));
    setEmail(p.email || "");
    setPhone(p.phone || "");
    setDob(p.date_of_birth || "");
    setGender(p.gender || "");
    setAvatarPath(p.avatar_url || null);
    setNotifs((p.notification_preferences as Record<string, boolean>) || {});

    if (p.business_id) {
      const { data: biz } = await supabase
        .from("businesses")
        .select(
          "id, name, country, state, location, open_time, close_time, abn, business_phone, business_email",
        )
        .eq("id", p.business_id)
        .maybeSingle();
      if (biz) {
        const b = biz as unknown as BusinessRow;
        setBusiness(b);
        setBizName(b.name || "");
        setAbn(b.abn || "");
        setBizPhone(b.business_phone || "");
        setBizEmail(b.business_email || "");
        setCountry(b.country || "");
        setState(b.state || "");
        setBizLocation(b.location || "");
      }
    }
    if (p.role === "employee") {
      const { data: emp } = await supabase
        .from("employees")
        .select("id, employee_code, department, role, employment_type, start_date, skills")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (emp) setEmployee(emp as unknown as EmployeeRow);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const memberSince = useMemo(() => {
    if (!profile?.created_at) return "";
    return new Date(profile.created_at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [profile]);

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG, or WEBP images are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB.");
      return;
    }
    if (!profile) return;
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", profile.id);
    if (updErr) {
      setUploading(false);
      toast.error(updErr.message);
      return;
    }
    setAvatarPath(path);
    setUploading(false);
    toast.success("Photo updated");
  };

  const removePhoto = async () => {
    if (!profile) return;
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", profile.id);
    if (error) return toast.error(error.message);
    if (avatarPath && !avatarPath.startsWith("http")) {
      await supabase.storage.from("avatars").remove([avatarPath]);
    }
    setAvatarPath(null);
    toast.success("Photo removed");
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "First name is required";
    if (!lastName.trim()) e.lastName = "Last name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email";
    if (newPw || confirmPw) {
      if (!currentPw) e.currentPw = "Enter your current password to change it";
      if (newPw.length < 8) e.newPw = "New password must be at least 8 characters";
      if (newPw !== confirmPw) e.confirmPw = "Passwords do not match";
    }
    if (isEmployer) {
      if (!bizName.trim()) e.bizName = "Business name is required";
      if (!country.trim()) e.country = "Country is required";
      if (!state.trim()) e.state = "State / Region is required";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const onSave = async () => {
    if (!profile) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          name: fullName,
          email,
          phone: phone || null,
          date_of_birth: dob || null,
          gender: gender || null,
          notification_preferences: notifs,
        })
        .eq("id", profile.id);
      if (pErr) throw pErr;

      if (email !== profile.email) {
        const { error: emErr } = await supabase.auth.updateUser({ email });
        if (emErr) throw emErr;
      }

      if (newPw) {
        const { error: pwErr } = await supabase.auth.updateUser({ password: newPw });
        if (pwErr) throw pwErr;
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
      }

      if (isEmployer && business) {
        const { error: bErr } = await supabase
          .from("businesses")
          .update({
            name: bizName,
            abn: abn || null,
            business_phone: bizPhone || null,
            business_email: bizEmail || null,
            country,
            state,
            location: bizLocation || null,
          })
          .eq("id", business.id);
        if (bErr) throw bErr;
      }
      toast.success("Profile updated successfully");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => load();

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" /> Loading profile...
      </div>
    );
  }

  const fullName = `${firstName} ${lastName}`.trim() || profile.name;
  const pwStrength = passwordStrength(newPw);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--navy)]">
          My Profile
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your personal details, security, and notification preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
        {/* Left column: avatar + quick info */}
        <aside className="bg-white border rounded-xl shadow-sm p-6 flex flex-col items-center text-center h-fit">
          <div className="relative">
            {previewAvatarUrl ? (
              <img
                src={previewAvatarUrl}
                alt={fullName}
                className="w-[120px] h-[120px] rounded-full object-cover"
              />
            ) : (
              <UserAvatar name={fullName} email={profile.email} size={120} />
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 className="size-6 text-white animate-spin" />
              </div>
            )}
          </div>
          <h2 className="mt-4 font-bold text-lg text-[var(--navy)] break-words">{fullName}</h2>
          <span className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[var(--navy)] text-white capitalize">
            {profile.role}
          </span>
          {profile.role === "employee" && profile.department && (
            <p className="mt-2 text-sm text-muted-foreground">{profile.department}</p>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={onFileChange}
          />
          <div className="mt-4 flex flex-col items-center gap-1">
            <Button variant="outline" size="sm" onClick={onPickFile} disabled={uploading}>
              <Upload className="size-4" />
              Upload Photo
            </Button>
            {avatarPath && (
              <button
                type="button"
                onClick={removePhoto}
                className="text-xs text-muted-foreground hover:text-[var(--navy)] underline"
              >
                Remove photo
              </button>
            )}
          </div>

          <div className="mt-6 w-full space-y-2 text-left text-sm">
            <div className="flex items-start gap-2 text-muted-foreground min-w-0">
              <Mail className="size-4 shrink-0 mt-0.5" />
              <span className="break-all">{profile.email}</span>
            </div>
            {phone && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <Phone className="size-4 shrink-0 mt-0.5" />
                <span>{phone}</span>
              </div>
            )}
            <div className="flex items-start gap-2 text-muted-foreground">
              <Calendar className="size-4 shrink-0 mt-0.5" />
              <span>Member since {memberSince}</span>
            </div>
            {(isEmployer ? business?.location : business?.location) && (
              <div className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="size-4 shrink-0 mt-0.5" />
                <span>{business?.location}</span>
              </div>
            )}
          </div>
        </aside>

        {/* Right column: form */}
        <div className="bg-white border rounded-xl shadow-sm p-6 sm:p-8">
          <Section title="Personal Details">
            <Field label="First Name" required error={errors.firstName}>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last Name" required error={errors.lastName}>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
            <Field label="Email Address" required error={errors.email} full>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Changing your email may require re-verification.
              </p>
            </Field>
            <Field label="Phone Number">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Date of Birth">
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </Field>
            <Field label="Gender" full>
              <Select value={gender || undefined} onValueChange={setGender}>
                <SelectTrigger>
                  <SelectValue placeholder="Prefer not to say" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prefer_not">Prefer not to say</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="non_binary">Non-binary</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section title="Account Security">
            <Field label="Current Password" required={!!newPw} error={errors.currentPw} full>
              <PasswordInput
                value={currentPw}
                onChange={setCurrentPw}
                show={showCurrent}
                onToggle={() => setShowCurrent((s) => !s)}
              />
            </Field>
            <Field label="New Password" error={errors.newPw}>
              <PasswordInput
                value={newPw}
                onChange={setNewPw}
                show={showNew}
                onToggle={() => setShowNew((s) => !s)}
              />
              {newPw && (
                <div className="mt-2">
                  <div className="h-1.5 rounded-full bg-[#EEF1F6] overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${(pwStrength.score / 4) * 100}%`,
                        background: "var(--navy)",
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{pwStrength.label}</p>
                </div>
              )}
            </Field>
            <Field label="Confirm New Password" error={errors.confirmPw}>
              <PasswordInput
                value={confirmPw}
                onChange={setConfirmPw}
                show={showConfirm}
                onToggle={() => setShowConfirm((s) => !s)}
              />
            </Field>
            <p className="md:col-span-2 text-xs text-muted-foreground">
              Leave password fields blank if you do not want to change your password.
            </p>
          </Section>

          {isEmployer && (
            <Section title="Business Details">
              <Field label="Business Name" required error={errors.bizName} full>
                <Input value={bizName} onChange={(e) => setBizName(e.target.value)} />
              </Field>
              <Field label="ABN / Tax ID">
                <Input value={abn} onChange={(e) => setAbn(e.target.value)} />
              </Field>
              <Field label="Business Phone">
                <Input value={bizPhone} onChange={(e) => setBizPhone(e.target.value)} />
              </Field>
              <Field label="Business Email" full>
                <Input
                  type="email"
                  value={bizEmail}
                  onChange={(e) => setBizEmail(e.target.value)}
                />
              </Field>
              <Field label="Country" required error={errors.country}>
                <Input value={country} onChange={(e) => setCountry(e.target.value)} />
              </Field>
              <Field label="State / Region" required error={errors.state}>
                <Input value={state} onChange={(e) => setState(e.target.value)} />
              </Field>
              <Field label="Business Location / Place Name" full>
                <Input value={bizLocation} onChange={(e) => setBizLocation(e.target.value)} />
              </Field>
              <div className="md:col-span-2 flex items-center justify-between rounded-lg border bg-[#F8F9FB] px-4 py-3">
                <div className="text-sm">
                  <div className="font-medium text-[var(--navy)]">Operating Hours</div>
                  <div className="text-muted-foreground">
                    {business?.open_time || "09:00"} – {business?.close_time || "17:00"}
                  </div>
                </div>
                <Link
                  to="/settings"
                  className="text-sm font-medium text-[var(--navy)] underline"
                >
                  Edit in Settings
                </Link>
              </div>
            </Section>
          )}

          {profile.role === "employee" && (
            <Section title="Employment Details">
              <ReadField label="Employee ID" value={employee?.employee_code || "—"} />
              <ReadField label="Role / Position" value={employee?.role || "—"} />
              <ReadField
                label="Department"
                value={employee?.department || profile.department || "—"}
                hint="Contact your employer to update"
              />
              <ReadField label="Employment Type" value={employee?.employment_type || "—"} />
              <ReadField label="Start Date" value={employee?.start_date || "—"} />
              <ReadField label="Assigned Location" value={business?.location || "—"} />
              <div className="md:col-span-2">
                <Label className="text-sm font-medium text-[var(--navy)]">Skills</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {employee?.skills && employee.skills.length > 0 ? (
                    employee.skills.map((s) => (
                      <span
                        key={s}
                        className="px-3 py-1 rounded-full text-xs font-medium bg-[#EEF1F6] text-[var(--navy)]"
                      >
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No skills assigned</span>
                  )}
                </div>
              </div>
            </Section>
          )}

          <Section title="Notification Preferences">
            <div className="md:col-span-2 space-y-3">
              {notifList.map((n) => (
                <div
                  key={n.key}
                  className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0 border-[#EEF1F6]"
                >
                  <span className="text-sm text-[var(--navy)]">{n.label}</span>
                  <Switch
                    checked={!!notifs[n.key]}
                    onCheckedChange={(v) => setNotifs((p) => ({ ...p, [n.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </Section>

          <div className="mt-8 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving} className="w-full sm:w-auto">
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  show,
  onToggle,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute inset-y-0 right-0 px-3 text-muted-foreground hover:text-[var(--navy)]"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function ReadField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <Label className="text-sm font-medium text-[var(--navy)]">{label}</Label>
      <div className="mt-1.5 rounded-md border bg-[#F8F9FB] px-3 py-2 text-sm text-[var(--navy)]">
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}