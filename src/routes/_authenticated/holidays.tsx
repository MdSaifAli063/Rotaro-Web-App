import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
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
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  List,
  Plus,
  Trash2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  format,
  isSameDay,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  addDays,
} from "date-fns";
import { cn } from "@/lib/utils";
import { COUNTRIES, STATES_BY_COUNTRY } from "@/lib/constants"; // Assuming these constants exist

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
  is_national: boolean;
  is_paid: boolean;
  is_custom: boolean;
  created_at: string;
};

// Assuming these constants exist or defining them here for now
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 2 + i); // Current year +/- 2

function HolidaysPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const [addCustomOpen, setAddCustomOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");

  const [selectedCountry, setSelectedCountry] = useState("AU");
  const [selectedState, setSelectedState] = useState("NSW"); // Default to NSW for AU
  const [selectedYear, setSelectedYear] = useState(String(CURRENT_YEAR));

  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));

  useEffect(() => {
    fetchProfile().then(setProfile);
  }, []);

  const loadHolidays = async () => {
    if (!profile?.business_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .eq("business_id", profile.business_id)
      .order("holiday_date", { ascending: true });

    if (error) {
      toast.error("Failed to load holidays: " + error.message);
      setHolidays([]);
    } else {
      setHolidays(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.business_id) {
      loadHolidays();
    }
  }, [profile?.business_id]);

  // All hooks must be called unconditionally at the top level
  const filteredHolidays = useMemo(() => {
    return holidays.filter(
      (h) => new Date(h.holiday_date).getFullYear() === parseInt(selectedYear),
    );
  }, [holidays, selectedYear]);

  if (!profile) return null;
  if (!isManager(profile)) {
    return (
      <div className="text-sm text-muted-foreground">
        You do not have permission to view this page.
      </div>
    );
  }

  const handleImportPublicHolidays = async () => {
    if (!profile?.business_id) {
      toast.error("Business ID not found.");
      return;
    }
    setImportLoading(true);
    try {
      const apiUrl = `https://date.nager.at/api/v3/PublicHolidays/${selectedYear}/${selectedCountry}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      const publicHolidays = await response.json();

      const holidaysToInsert = publicHolidays
        .filter((h: any) => {
          // Filter for national holidays or state-specific holidays matching selected state
          return (
            h.global || h.states.some((s: any) => s.iso === `${selectedCountry}-${selectedState}`)
          );
        })
        .map((h: any) => ({
          business_id: profile.business_id,
          holiday_date: h.date,
          holiday_name: h.name,
          country: selectedCountry,
          state: h.global ? null : selectedState, // If global, state is null
          is_national: h.global,
          is_paid: true, // Default public holidays to paid
          is_custom: false,
        }));

      // Check for existing public holidays for this year/country/state
      const { data: existingPublicHolidays } = await supabase
        .from("holidays")
        .select("id")
        .eq("business_id", profile.business_id)
        .eq("country", selectedCountry)
        .eq("is_custom", false)
        .gte("holiday_date", `${selectedYear}-01-01`)
        .lte("holiday_date", `${selectedYear}-12-31`);

      if (existingPublicHolidays && existingPublicHolidays.length > 0) {
        if (
          !confirm(
            "Holidays already imported for this period. Re-import will replace existing public holidays. Continue?",
          )
        ) {
          setImportLoading(false);
          return;
        }
        // Delete existing public holidays before re-inserting
        await supabase
          .from("holidays")
          .delete()
          .eq("business_id", profile.business_id)
          .eq("country", selectedCountry)
          .eq("is_custom", false)
          .gte("holiday_date", `${selectedYear}-01-01`)
          .lte("holiday_date", `${selectedYear}-12-31`);
      }

      const { error: insertError } = await supabase.from("holidays").insert(holidaysToInsert);

      if (insertError) {
        throw new Error("Failed to insert holidays: " + insertError.message);
      }

      toast.success(`${holidaysToInsert.length} public holidays imported successfully.`);
      loadHolidays();
    } catch (e: any) {
      toast.error(
        e.message || "Could not fetch holidays. Please check your connection and try again.",
      );
    } finally {
      setImportLoading(false);
    }
  };

  const handleTogglePaid = async (holidayId: string, isPaid: boolean) => {
    const { error } = await supabase
      .from("holidays")
      .update({ is_paid: isPaid })
      .eq("id", holidayId);
    if (error) {
      toast.error("Failed to update holiday status: " + error.message);
    } else {
      toast.success("Holiday status updated.");
      loadHolidays();
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    if (!confirm("Delete this holiday? This cannot be undone.")) return;
    const { error } = await supabase.from("holidays").delete().eq("id", holidayId);
    if (error) {
      toast.error("Failed to delete holiday: " + error.message);
    } else {
      toast.success("Holiday deleted.");
      loadHolidays();
    }
  };

  const statesForCountry = STATES_BY_COUNTRY[selectedCountry] || [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--navy)]">Holidays</h1>

      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 p-4 border-t-4 border-[var(--navy)] bg-card rounded-lg shadow-sm">
        <Select value={selectedCountry} onValueChange={setSelectedCountry}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {statesForCountry.length > 0 && (
          <Select value={selectedState} onValueChange={setSelectedState}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="State/Region" />
            </SelectTrigger>
            <SelectContent>
              {statesForCountry.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-full sm:w-[100px]">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={handleImportPublicHolidays}
          disabled={importLoading}
          className="gap-2 w-full sm:w-auto"
        >
          {importLoading ? "Importing..." : "Import Public Holidays"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setAddCustomOpen(true)}
          className="gap-2 w-full sm:w-auto"
        >
          <Plus className="size-4" /> Add Custom Holiday
        </Button>

        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto overflow-x-auto">
          <Button
            variant={view === "list" ? "default" : "outline"}
            onClick={() => setView("list")}
            className={cn(
              "gap-2",
              view === "list"
                ? "bg-[var(--navy)] text-white"
                : "text-[var(--navy)] border-[var(--navy)] hover:bg-secondary",
            )}
          >
            <List className="size-4" /> List View
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "outline"}
            onClick={() => setView("calendar")}
            className={cn(
              "gap-2",
              view === "calendar"
                ? "bg-[var(--navy)] text-white"
                : "text-[var(--navy)] border-[var(--navy)] hover:bg-secondary",
            )}
          >
            <CalendarIcon className="size-4" /> Calendar View
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-10">Loading holidays...</div>
      ) : filteredHolidays.length === 0 ? (
        <div className="text-center text-muted-foreground py-10">
          No holidays imported yet. Use the "Import Public Holidays" button above to fetch public
          holidays.
        </div>
      ) : view === "list" ? (
        <HolidayListView
          holidays={filteredHolidays}
          onTogglePaid={handleTogglePaid}
          onDelete={handleDeleteHoliday}
        />
      ) : (
        <HolidayCalendarView
          holidays={filteredHolidays}
          currentMonth={currentMonth}
          setCurrentMonth={setCurrentMonth}
        />
      )}

      <AddCustomHolidayDialog
        open={addCustomOpen}
        onOpenChange={setAddCustomOpen}
        businessId={profile.business_id}
        onSave={loadHolidays}
        countryCode={selectedCountry}
        statesForCountry={statesForCountry}
      />
    </div>
  );
}

// ===================================================================
// LIST VIEW COMPONENT
// ===================================================================
function HolidayListView({
  holidays,
  onTogglePaid,
  onDelete,
}: {
  holidays: Holiday[];
  onTogglePaid: (id: string, isPaid: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
      <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_1fr_100px_100px] gap-4 px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b bg-secondary/40">
        <div>Date</div>
        <div>Day</div>
        <div>Holiday Name</div>
        <div>Type</div>
        <div>State</div>
        <div className="text-right">Paid</div>
        <div className="text-right">Actions</div>
      </div>
      {holidays.map((h, idx) => (
        <div
          key={h.id}
          className={`grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_100px_100px] gap-1 md:gap-4 px-5 py-4 border-b last:border-b-0 ${
            idx % 2 === 1 ? "bg-secondary/20" : ""
          }`}
        >
          <div className="font-medium text-[var(--navy)]">
            {format(new Date(h.holiday_date), "dd MMM yyyy")}
          </div>
          <div className="text-sm">{format(new Date(h.holiday_date), "EEEE")}</div>
          <div className="text-sm">{h.holiday_name}</div>
          <div className="text-sm">{h.is_custom ? "Custom" : "Public"}</div>
          <div className="text-sm">{h.is_national ? "National" : h.state || "N/A"}</div>
          <div className="flex justify-end items-center">
            <Switch
              checked={h.is_paid}
              onCheckedChange={(checked) => onTogglePaid(h.id, checked)}
              aria-label={`Toggle ${h.holiday_name} as paid`}
            />
          </div>
          <div className="flex justify-end items-center">
            <Button variant="ghost" size="icon" onClick={() => onDelete(h.id)}>
              <Trash2 className="size-4 text-red-500" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===================================================================
// CALENDAR VIEW COMPONENT
// ===================================================================
function HolidayCalendarView({
  holidays,
  currentMonth,
  setCurrentMonth,
}: {
  holidays: Holiday[];
  currentMonth: Date;
  setCurrentMonth: (d: Date) => void;
}) {
  const daysInMonth = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const dates: Date[] = [];
    let current = start;
    while (current <= end) {
      dates.push(current);
      current = addDays(current, 1);
    }
    return dates;
  }, [currentMonth]);

  const firstDayOfMonth = startOfMonth(currentMonth);
  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 for Sunday, 1 for Monday

  const emptyCellsStart = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1; // Adjust for Monday start

  const allDays = useMemo(() => {
    const days: Array<Date | null> = [];
    for (let i = 0; i < emptyCellsStart; i++) {
      days.push(null); // Placeholder for days before the 1st
    }
    daysInMonth.forEach((d) => days.push(d));
    return days;
  }, [daysInMonth, emptyCellsStart]);

  const holidaysByDate = useMemo(() => {
    return holidays.reduce(
      (acc, h) => {
        const dateKey = format(new Date(h.holiday_date), "yyyy-MM-dd");
        if (!acc[dateKey]) {
          acc[dateKey] = [];
        }
        acc[dateKey].push(h);
        return acc;
      },
      {} as Record<string, Holiday[]>,
    );
  }, [holidays]);

  return (
    <div className="bg-card border rounded-xl shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <h2 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 text-center text-sm font-medium text-muted-foreground mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {allDays.map((day, index) => {
          const dateKey = day ? format(day, "yyyy-MM-dd") : "";
          const dayHolidays = holidaysByDate[dateKey] || [];
          const isWeekend = day && (day.getDay() === 0 || day.getDay() === 6); // 0 for Sunday, 6 for Saturday

          return (
            <div
              key={index}
              className={cn(
                "relative h-24 p-1 text-sm rounded-md overflow-hidden",
                isWeekend && "bg-secondary/30",
                !day && "bg-transparent",
              )}
            >
              {day && (
                <>
                  <div
                    className={cn(
                      "absolute top-1 right-1 size-6 flex items-center justify-center rounded-full",
                      dayHolidays.length > 0 && "bg-[var(--navy)] text-white",
                    )}
                  >
                    {format(day, "d")}
                  </div>
                  {dayHolidays.length > 0 && (
                    <div className="absolute bottom-1 left-1 right-1 text-xs text-white text-center truncate">
                      {dayHolidays[0].holiday_name}
                    </div>
                  )}
                  {dayHolidays.length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <div className="absolute inset-0 cursor-pointer" />
                      </PopoverTrigger>
                      <PopoverContent className="p-2 text-sm">
                        <div className="font-semibold mb-1">{format(day, "dd MMMM yyyy")}</div>
                        {dayHolidays.map((h) => (
                          <div key={h.id} className="flex items-center gap-2">
                            <span className="font-medium">{h.holiday_name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({h.is_paid ? "Paid" : "Unpaid"})
                            </span>
                          </div>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===================================================================
// ADD CUSTOM HOLIDAY DIALOG
// ===================================================================
function AddCustomHolidayDialog({
  open,
  onOpenChange,
  businessId,
  onSave,
  countryCode,
  statesForCountry,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  businessId: string | null;
  onSave: () => void;
  countryCode: string;
  statesForCountry: { code: string; name: string }[];
}) {
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState<Date | undefined>(undefined);
  const [isPaid, setIsPaid] = useState(true);
  const [stateSpecific, setStateSpecific] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setHolidayName("");
    setHolidayDate(undefined);
    setIsPaid(true);
    setStateSpecific(null);
  };

  useEffect(() => {
    if (!open) resetForm();
  }, [open]);

  const handleSaveCustomHoliday = async () => {
    if (!holidayName || !holidayDate) {
      toast.error("Holiday Name and Date are required.");
      return;
    }
    if (!businessId) {
      toast.error("Business ID not found.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("holidays").insert({
        business_id: businessId,
        holiday_name: holidayName,
        holiday_date: format(holidayDate, "yyyy-MM-dd"),
        country: countryCode,
        state: stateSpecific,
        is_national: !stateSpecific, // If stateSpecific is null, it's national for the selected country
        is_paid: isPaid,
        is_custom: true,
      });

      if (error) {
        throw new Error("Failed to add custom holiday: " + error.message);
      }

      toast.success("Custom holiday added successfully.");
      onSave();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to add custom holiday.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Custom Holiday</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="holidayName">Holiday Name*</Label>
            <Input
              id="holidayName"
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="holidayDate">Date*</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !holidayDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {holidayDate ? format(holidayDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={holidayDate}
                  onSelect={setHolidayDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="isPaid">Paid Holiday</Label>
            <Switch id="isPaid" checked={isPaid} onCheckedChange={setIsPaid} />
          </div>
          {statesForCountry.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="stateSpecific">State Specific (optional)</Label>
              <Select
                value={stateSpecific || ""}
                onValueChange={(v) => setStateSpecific(v || null)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select state (leave blank for national)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">National (all states)</SelectItem>
                  {statesForCountry.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveCustomHoliday} disabled={saving}>
            {saving ? "Saving..." : "Save Holiday"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
