import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/holidays")({
  component: HolidaysPage,
});

type Holiday = {
  id: string;
  business_id: string;
  holiday_date: string;
  holiday_name: string;
  country: string | null;
  state: string | null;
  plant?: string | null;
  is_national: boolean;
  is_paid: boolean;
  is_custom: boolean;
  source?: string | null;
  created_at: string;
};

type AddForm = {
  holiday_date: string;
  holiday_name: string;
  is_national: boolean;
  plant: string;
  is_paid: boolean;
};

type CsvRow = {
  holiday_date: string;
  holiday_name: string;
  plant: string | null;
  is_national: boolean;
};

type NagerHolidayRow = {
  date?: string;
  localName?: string;
  name?: string;
  countryCode?: string;
  global?: boolean;
  counties?: string[] | null;
  source?: string;
};

type CountryOption = {
  countryCode: string;
  name: string;
};

type SortKey = "holiday_date" | "holiday_name";

const NAVY = "var(--navy)";
const CURRENT_YEAR = new Date().getFullYear();
const COMMON_COUNTRIES = "IN, AU, NZ, US, GB, CA";
const DEFAULT_CSV =
  "2025-12-25,Christmas,,Y\n2025-01-01,New Year's Day,,Y\n2025-04-25,ANZAC Day,,Y";
const allPlantsValue = "__all_plants__";
const PRIORITY_COUNTRIES = new Set(["IN", "AU"]);
const FALLBACK_COUNTRIES: CountryOption[] = [
  { countryCode: "IN", name: "India" },
  { countryCode: "AU", name: "Australia" },
  { countryCode: "NZ", name: "New Zealand" },
  { countryCode: "US", name: "United States" },
  { countryCode: "GB", name: "United Kingdom" },
  { countryCode: "CA", name: "Canada" },
  { countryCode: "SG", name: "Singapore" },
  { countryCode: "AE", name: "United Arab Emirates" },
];

function HolidaysPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importingNager, setImportingNager] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [country, setCountry] = useState("AU");
  const [markPaid, setMarkPaid] = useState(true);
  const [csvPaid, setCsvPaid] = useState(true);
  const [csvText, setCsvText] = useState("");
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("holiday_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [visibleRows, setVisibleRows] = useState(30);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<AddForm>({
    holiday_date: "",
    holiday_name: "",
    is_national: true,
    plant: "",
    is_paid: true,
  });

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
    })();
  }, []);

  useEffect(() => {
    let active = true;

    const loadCountries = async () => {
      setCountriesLoading(true);
      try {
        const response = await fetch("https://date.nager.at/api/v3/AvailableCountries", {
          headers: { Accept: "application/json" },
        });
        const body = await response.text();
        let countries: CountryOption[] = [];

        if (response.ok && body.trim()) {
          const parsed = JSON.parse(body) as Array<{ countryCode?: string; name?: string }>;
          if (Array.isArray(parsed)) {
            countries = parsed
              .filter((item) => item.countryCode && item.name)
              .map((item) => ({
                countryCode: String(item.countryCode).toUpperCase(),
                name: String(item.name),
              }));
          }
        }

        if (!countries.length) {
          countries = FALLBACK_COUNTRIES;
        }

        const ordered = orderCountries(countries);
        if (active) setCountryOptions(ordered);
      } catch {
        if (active) setCountryOptions(orderCountries(FALLBACK_COUNTRIES));
      } finally {
        if (active) setCountriesLoading(false);
      }
    };

    void loadCountries();

    return () => {
      active = false;
    };
  }, []);

  const loadHolidays = useCallback(async () => {
    if (!profile?.business_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .eq("business_id", profile.business_id)
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)
      .order("holiday_date", { ascending: true });

    if (error) {
      toast.error("Failed to load holidays: " + error.message);
      setHolidays([]);
    } else {
      setHolidays((data ?? []) as Holiday[]);
    }
    setLoading(false);
  }, [profile?.business_id, year]);

  useEffect(() => {
    if (profile?.business_id) loadHolidays();
  }, [loadHolidays, profile?.business_id]);

  useEffect(() => {
    if (!profile?.business_id) return;
    const channel = supabase
      .channel(`holidays:${profile.business_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "holidays",
          filter: `business_id=eq.${profile.business_id}`,
        },
        loadHolidays,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadHolidays, profile?.business_id]);

  const plants = useMemo(() => {
    const values = new Set<string>();
    holidays.forEach((holiday) => {
      if (holiday.plant) values.add(holiday.plant);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [holidays]);

  const years = useMemo(() => {
    const values = new Set<number>([
      CURRENT_YEAR - 1,
      CURRENT_YEAR,
      CURRENT_YEAR + 1,
      CURRENT_YEAR + 2,
      year,
    ]);
    holidays.forEach((holiday) => values.add(Number(holiday.holiday_date.slice(0, 4))));
    return Array.from(values).sort((a, b) => a - b);
  }, [holidays, year]);

  const sortedHolidays = useMemo(() => {
    return [...holidays].sort((a, b) => {
      const left = String(a[sortKey] ?? "");
      const right = String(b[sortKey] ?? "");
      const result = left.localeCompare(right);
      return sortDir === "asc" ? result : -result;
    });
  }, [holidays, sortDir, sortKey]);

  const visibleHolidays = sortedHolidays.slice(0, visibleRows);

  if (!profile) return null;
  if (!isManager(profile)) {
    return (
      <div className="text-sm text-muted-foreground">
        You do not have permission to view this page.
      </div>
    );
  }

  const validateHoliday = () => {
    const errors: Record<string, string> = {};
    if (!isValidDate(form.holiday_date))
      errors.holiday_date = "Enter a valid date between 2000 and 2100.";
    if (form.holiday_name.trim().length < 2)
      errors.holiday_name = "Holiday name must be at least 2 characters.";
    if (form.holiday_name.trim().length > 150)
      errors.holiday_name = "Holiday name must be 150 characters or less.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const addHoliday = async () => {
    if (!profile.business_id || !validateHoliday()) return;
    setSaving(true);
    const duplicate = await findDuplicate(
      profile.business_id,
      form.holiday_date,
      form.holiday_name,
    );
    if (duplicate) {
      setFieldErrors({ holiday_name: `This holiday already exists for ${form.holiday_date}.` });
      toast.error(`This holiday already exists for ${form.holiday_date}.`);
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("holidays").insert({
      business_id: profile.business_id,
      holiday_date: form.holiday_date,
      holiday_name: form.holiday_name.trim(),
      country: country.toUpperCase(),
      state: null,
      plant: form.is_national ? null : form.plant || null,
      is_national: form.is_national,
      is_paid: form.is_paid,
      is_custom: true,
      source: "manual",
    } as any);

    setSaving(false);
    if (error) {
      toast.error(readableError(error.message));
      return;
    }
    toast.success("Holiday added");
    setForm({ holiday_date: "", holiday_name: "", is_national: true, plant: "", is_paid: true });
    loadHolidays();
  };

  const importNager = async () => {
    if (!profile.business_id) return;
    const nextCountry = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(nextCountry)) {
      toast.error("Country must be a 2-letter ISO code.");
      return;
    }
    if (year < 2000 || year > 2100) {
      toast.error("Year must be between 2000 and 2100.");
      return;
    }

    setImportingNager(true);
    try {
      const rows = await fetchNagerHolidays(year, nextCountry);
      if (rows.length === 0) {
        toast.info(`No holidays found for ${nextCountry} ${year}. Check country code.`);
        return;
      }

      const seen = new Set<string>();
      const payload = rows.flatMap((row) => {
        const holidayDate = String(row.date ?? "");
        const holidayName = String(row.localName || row.name || "").trim();
        if (!isValidDate(holidayDate) || holidayName.length < 2) return [];
        const key = `${holidayDate}:${holidayName.toLowerCase()}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          {
            business_id: profile.business_id,
            holiday_date: holidayDate,
            holiday_name: holidayName,
            country: nextCountry,
            state: row.counties?.[0] ?? null,
            plant: null,
            is_national: row.global !== false,
            is_paid: markPaid,
            is_custom: false,
            source: row.source ?? "nager_api",
          },
        ];
      });
      if (payload.length === 0) {
        toast.info(`No usable holidays found for ${nextCountry} ${year}.`);
        return;
      }
      const { error } = await supabase
        .from("holidays")
        .upsert(payload as any, { onConflict: "business_id,holiday_date,holiday_name" });
      if (error) throw error;
      toast.success(`${payload.length} holidays imported for ${nextCountry} ${year}`);
      loadHolidays();
    } catch (error: any) {
      toast.error(
        error.name === "AbortError"
          ? "Connection error. Please check your internet connection."
          : readableError(error.message),
      );
    } finally {
      setImportingNager(false);
    }
  };

  const importCsv = async () => {
    if (!profile.business_id) return;
    const parsed = parseCsv(csvText);
    setCsvErrors(parsed.errors);
    if (parsed.errors.length) {
      toast.error(`CSV has ${parsed.errors.length} error${parsed.errors.length === 1 ? "" : "s"}.`);
      return;
    }
    if (!parsed.rows.length) {
      toast.error("Paste at least one holiday row.");
      return;
    }
    setImportingCsv(true);
    const payload = parsed.rows.map((row) => ({
      business_id: profile.business_id,
      ...row,
      country: country.toUpperCase(),
      state: null,
      is_paid: csvPaid,
      is_custom: true,
      source: "csv_import",
    }));
    const { error } = await supabase
      .from("holidays")
      .upsert(payload as any, { onConflict: "business_id,holiday_date,holiday_name" });
    setImportingCsv(false);
    if (error) {
      toast.error(readableError(error.message));
      return;
    }
    toast.success(`${payload.length} holidays imported successfully`);
    setCsvText("");
    loadHolidays();
  };

  const togglePaid = async (holiday: Holiday) => {
    setTogglingId(holiday.id);
    const { error } = await supabase
      .from("holidays")
      .update({ is_paid: !holiday.is_paid } as any)
      .eq("id", holiday.id)
      .eq("business_id", profile.business_id ?? "");
    setTogglingId(null);
    if (error) toast.error("Failed to update holiday: " + error.message);
    else loadHolidays();
  };

  const deleteHoliday = async (holiday: Holiday) => {
    setDeletingId(holiday.id);
    const { error } = await supabase
      .from("holidays")
      .delete()
      .eq("id", holiday.id)
      .eq("business_id", profile.business_id ?? "");
    setDeletingId(null);
    setConfirmDeleteId(null);
    if (error) toast.error("Failed to delete holiday: " + error.message);
    else {
      toast.success("Holiday deleted");
      loadHolidays();
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((old) => (old === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="text-sm text-muted-foreground">
          <span className="text-[var(--navy)]">Operations</span> /{" "}
          <span className="font-semibold text-[var(--navy)]">Holidays</span>
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Holidays</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage public holidays, imports, and location-specific dates.
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--navy)]">Add Holiday</h2>
          <div className="mt-4 grid gap-4">
            <Field label="Date" error={fieldErrors.holiday_date}>
              <Input
                type="date"
                value={form.holiday_date}
                onChange={(e) => setForm({ ...form, holiday_date: e.target.value })}
              />
            </Field>
            <Field label="Holiday Name" error={fieldErrors.holiday_name}>
              <Input
                value={form.holiday_name}
                maxLength={150}
                onChange={(e) => setForm({ ...form, holiday_name: e.target.value })}
                placeholder="Christmas Day"
              />
            </Field>
            <CheckRow
              checked={form.is_national}
              onCheckedChange={(checked) =>
                setForm({ ...form, is_national: checked, plant: checked ? "" : form.plant })
              }
              label="National holiday"
            />
            {!form.is_national && (
              <Field label="Plant">
                <Select
                  value={form.plant || allPlantsValue}
                  onValueChange={(value) =>
                    setForm({ ...form, plant: value === allPlantsValue ? "" : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All plants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={allPlantsValue}>All plants</SelectItem>
                    {plants.map((plant) => (
                      <SelectItem key={plant} value={plant}>
                        {plant}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <CheckRow
              checked={form.is_paid}
              onCheckedChange={(checked) => setForm({ ...form, is_paid: checked })}
              label="Paid holiday"
            />
            <Button
              onClick={addHoliday}
              disabled={saving}
              className="w-full bg-[var(--navy)] text-white hover:bg-[var(--navy-light)] sm:w-fit"
            >
              {saving ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}{" "}
              Add
            </Button>
          </div>
        </section>

        <section className="rounded-lg border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-[var(--navy)]">
            Import public holidays (Nager API)
          </h2>
          <div className="mt-4 grid gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Country">
                <Select
                  value={country}
                  onValueChange={(value) => setCountry(value.toUpperCase())}
                  disabled={countriesLoading && countryOptions.length === 0}
                >
                  <SelectTrigger className="w-full sm:w-60">
                    <SelectValue
                      placeholder={countriesLoading ? "Loading countries..." : "Select country"}
                    />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {countryOptions.map((item) => (
                      <SelectItem key={item.countryCode} value={item.countryCode}>
                        {item.name} ({item.countryCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <YearStepper year={year} setYear={setYear} />
              <CheckRow checked={markPaid} onCheckedChange={setMarkPaid} label="Mark as paid" />
            </div>
            <Button
              variant="outline"
              onClick={importNager}
              disabled={importingNager}
              className="w-full border-[var(--navy)] text-[var(--navy)] sm:w-fit"
            >
              {importingNager && <Loader2 className="mr-2 size-4 animate-spin" />} Fetch {year}
            </Button>
            <p className="text-xs text-muted-foreground">
              India and Australia are listed first. Common codes: {COMMON_COUNTRIES}.{" "}
              <a
                className="font-medium text-[var(--navy)] underline"
                href="https://date.nager.at/Country"
                target="_blank"
                rel="noreferrer"
              >
                View all supported countries
              </a>
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--navy)]">Bulk Import (CSV)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Format: date,name,plant_code,national(Y/N)
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">2025-12-25,Christmas,,Y</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={downloadTemplate}
            className="border-[var(--navy)] text-[var(--navy)]"
          >
            <Download className="mr-2 size-4" /> Download CSV Template
          </Button>
        </div>
        <Textarea
          className="mt-4 min-h-32 font-mono"
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={DEFAULT_CSV}
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CheckRow
            checked={csvPaid}
            onCheckedChange={setCsvPaid}
            label="Mark imported rows as paid"
          />
          <Button
            onClick={importCsv}
            disabled={importingCsv}
            className="w-full bg-[var(--navy)] text-white hover:bg-[var(--navy-light)] sm:w-fit"
          >
            {importingCsv && <Loader2 className="mr-2 size-4 animate-spin" />} Import
          </Button>
        </div>
        {csvErrors.length > 0 && <ErrorList errors={csvErrors} />}
      </section>

      <section className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-bold text-[var(--navy)]">Holidays {year}</h2>
          <Select
            value={String(year)}
            onValueChange={(value) => {
              setYear(Number(value));
              setVisibleRows(30);
            }}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((item) => (
                <SelectItem key={item} value={String(item)}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="sticky top-0 bg-secondary text-left">
              <tr>
                <SortableHeader
                  label="Date"
                  active={sortKey === "holiday_date"}
                  dir={sortDir}
                  onClick={() => toggleSort("holiday_date")}
                />
                <SortableHeader
                  label="Name"
                  active={sortKey === "holiday_name"}
                  dir={sortDir}
                  onClick={() => toggleSort("holiday_name")}
                />
                <th className="px-4 py-3 font-medium">Plant</th>
                <th className="px-4 py-3 font-medium">National</th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : visibleHolidays.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No holidays found for {year}. Import public holidays or add a custom holiday
                    above.
                  </td>
                </tr>
              ) : (
                visibleHolidays.map((holiday) => (
                  <tr key={holiday.id} className="border-t hover:bg-[#F3F6FA]">
                    <td className="sticky left-0 bg-inherit px-4 py-3 font-medium text-[var(--navy)]">
                      {holiday.holiday_date}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--navy)]">
                      {holiday.holiday_name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{holiday.plant || "-"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {holiday.is_national ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="font-medium text-[var(--navy)] disabled:opacity-50"
                        disabled={togglingId === holiday.id}
                        onClick={() => togglePaid(holiday)}
                      >
                        {togglingId === holiday.id
                          ? "Saving..."
                          : holiday.is_paid
                            ? "Paid"
                            : "Unpaid"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {confirmDeleteId === holiday.id ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Delete?</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-red-600 text-red-600"
                            disabled={deletingId === holiday.id}
                            onClick={() => deleteHoliday(holiday)}
                          >
                            Delete
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(holiday.id)}
                          aria-label={`Delete ${holiday.holiday_name}`}
                        >
                          <Trash2 className="size-4 text-red-600" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {visibleRows < sortedHolidays.length && (
          <div className="border-t p-4 text-center">
            <Button
              variant="outline"
              onClick={() => setVisibleRows((old) => old + 30)}
              className="border-[var(--navy)] text-[var(--navy)]"
            >
              Load more
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold uppercase tracking-wide text-[var(--navy)]/75">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CheckRow({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-[var(--navy)]">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      {label}
    </label>
  );
}

function YearStepper({ year, setYear }: { year: number; setYear: (year: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold uppercase tracking-wide text-[var(--navy)]/75">
        Year
      </Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setYear(Math.max(2000, year - 1))}
        >
          -
        </Button>
        <Input
          className="w-24 text-center"
          value={year}
          onChange={(e) => setYear(Number(e.target.value) || CURRENT_YEAR)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setYear(Math.min(2100, year + 1))}
        >
          +
        </Button>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-4 py-3 font-medium">
      <button className="text-left text-[var(--navy)]" onClick={onClick}>
        {label}
        {active ? ` ${dir === "asc" ? "?" : "?"}` : ""}
      </button>
    </th>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <tr key={index} className="border-t">
          <td colSpan={6} className="px-4 py-3">
            <div className="h-5 animate-pulse rounded bg-secondary" />
          </td>
        </tr>
      ))}
    </>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <div className="font-semibold">Errors found:</div>
      {errors.map((error) => (
        <div key={error}>- {error}</div>
      ))}
    </div>
  );
}

async function findDuplicate(businessId: string, date: string, name: string) {
  const { data } = await supabase
    .from("holidays")
    .select("id")
    .eq("business_id", businessId)
    .eq("holiday_date", date)
    .ilike("holiday_name", name.trim())
    .limit(1)
    .maybeSingle();
  return data;
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseCsv(text: string): { rows: CsvRow[]; errors: string[] } {
  const rows: CsvRow[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const lineNo = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const parts = trimmed.split(",").map((part) => part.trim());
    if (parts.length < 2) {
      errors.push(`Line ${lineNo}: Expected date and name`);
      return;
    }
    const [holiday_date, holiday_name, plant = "", national = "Y"] = parts;
    if (!isValidDate(holiday_date)) errors.push(`Line ${lineNo}: Invalid date format`);
    if (!holiday_name) errors.push(`Line ${lineNo}: Name is required`);
    const nationalParsed = parseNational(national);
    if (nationalParsed === null) errors.push(`Line ${lineNo}: National must be Y or N`);
    if (isValidDate(holiday_date) && holiday_name && nationalParsed !== null) {
      rows.push({ holiday_date, holiday_name, plant: plant || null, is_national: nationalParsed });
    }
  });
  return { rows, errors };
}

function parseNational(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || ["y", "yes", "1"].includes(normalized)) return true;
  if (["n", "no", "0"].includes(normalized)) return false;
  return null;
}

async function fetchNagerHolidays(year: number, country: string): Promise<NagerHolidayRow[]> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  let response: Response;

  try {
    response = await fetch(
      `https://date.nager.at/api/v3/PublicHolidays/${year}/${encodeURIComponent(country)}`,
      {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      },
    );
  } catch (error: any) {
    const fallback = getFallbackPublicHolidays(year, country);
    if (fallback.length) return fallback;
    throw new Error(
      error?.name === "AbortError"
        ? "Connection timed out while fetching public holidays."
        : "Could not reach the holidays API. Please check your connection and try again.",
    );
  } finally {
    window.clearTimeout(timer);
  }

  const body = await response.text();
  if (!response.ok) {
    const detail = readApiMessage(body);
    throw new Error(
      response.status === 404
        ? `No public holiday feed is available for ${country} ${year}. Check the country code.`
        : detail || "Could not reach the holidays API. Please try again later.",
    );
  }

  if (!body.trim()) {
    throw new Error(`The holidays API returned no data for ${country} ${year}.`);
  }

  try {
    const parsed = JSON.parse(body) as unknown;
    if (Array.isArray(parsed)) return parsed as NagerHolidayRow[];
  } catch {
    throw new Error(`The holidays API returned unreadable data for ${country} ${year}.`);
  }

  throw new Error(`The holidays API returned unreadable data for ${country} ${year}.`);
}

function readApiMessage(body: string) {
  const text = body.trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as { message?: string; title?: string; error?: string };
    return parsed.message || parsed.title || parsed.error || "";
  } catch {
    return text.length > 160 ? `${text.slice(0, 160)}...` : text;
  }
}

function getFallbackPublicHolidays(year: number, country: string): NagerHolidayRow[] {
  const fixedByCountry: Record<string, Array<[string, string]>> = {
    AU: [
      ["01-01", "New Year's Day"],
      ["01-26", "Australia Day"],
      ["04-25", "ANZAC Day"],
      ["12-25", "Christmas Day"],
      ["12-26", "Boxing Day"],
    ],
    CA: [
      ["01-01", "New Year's Day"],
      ["07-01", "Canada Day"],
      ["12-25", "Christmas Day"],
    ],
    GB: [
      ["01-01", "New Year's Day"],
      ["12-25", "Christmas Day"],
      ["12-26", "Boxing Day"],
    ],
    IN: [
      ["01-26", "Republic Day"],
      ["08-15", "Independence Day"],
      ["10-02", "Gandhi Jayanti"],
      ["12-25", "Christmas Day"],
    ],
    NZ: [
      ["01-01", "New Year's Day"],
      ["02-06", "Waitangi Day"],
      ["04-25", "ANZAC Day"],
      ["12-25", "Christmas Day"],
      ["12-26", "Boxing Day"],
    ],
    US: [
      ["01-01", "New Year's Day"],
      ["07-04", "Independence Day"],
      ["11-11", "Veterans Day"],
      ["12-25", "Christmas Day"],
    ],
  };

  return (fixedByCountry[country] ?? []).map(([day, name]) => ({
    date: `${year}-${day}`,
    localName: name,
    name,
    countryCode: country,
    global: true,
    counties: null,
    source: "built_in_fallback",
  }));
}

function orderCountries(countries: CountryOption[]) {
  const unique = new Map<string, CountryOption>();
  countries.forEach((item) => {
    if (!item.countryCode || !item.name) return;
    unique.set(item.countryCode.toUpperCase(), {
      countryCode: item.countryCode.toUpperCase(),
      name: item.name,
    });
  });

  return Array.from(unique.values()).sort((left, right) => {
    const leftPriority = PRIORITY_COUNTRIES.has(left.countryCode) ? 0 : 1;
    const rightPriority = PRIORITY_COUNTRIES.has(right.countryCode) ? 0 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const nameCompare = left.name.localeCompare(right.name);
    if (nameCompare !== 0) return nameCompare;
    return left.countryCode.localeCompare(right.countryCode);
  });
}

function downloadTemplate() {
  const csv =
    "date,name,plant_code,national(Y/N)\n2025-12-25,Christmas,,Y\n2025-01-01,New Year's Day,,Y";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "holidays-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function readableError(message?: string) {
  if (!message) return "Something went wrong. Please try again.";
  if (message.includes("duplicate") || message.includes("unique"))
    return "This holiday already exists for that date.";
  if (message.toLowerCase().includes("failed to fetch"))
    return "Connection error. Please check your internet connection.";
  return message;
}
