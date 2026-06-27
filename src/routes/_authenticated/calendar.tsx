import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, isManager, type Profile } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CalendarPage,
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
};

function CalendarPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      const nextProfile = await fetchProfile();
      setProfile(nextProfile);
    })();
  }, []);

  const loadHolidays = useCallback(async () => {
    if (!profile?.business_id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const year = visibleMonth.getFullYear();
    const { data, error } = await supabase
      .from("holidays")
      .select(
        "id, business_id, holiday_date, holiday_name, country, state, is_national, is_paid, is_custom",
      )
      .eq("business_id", profile.business_id)
      .gte("holiday_date", `${year}-01-01`)
      .lte("holiday_date", `${year}-12-31`)
      .order("holiday_date", { ascending: true });

    if (error) {
      toast.error("Failed to load holidays: " + error.message);
      setHolidays([]);
    } else {
      setHolidays((data ?? []) as unknown as Holiday[]);
    }
    setLoading(false);
  }, [profile?.business_id, visibleMonth]);

  useEffect(() => {
    loadHolidays();
  }, [loadHolidays]);

  useEffect(() => {
    if (!profile?.business_id) return;
    const channel = supabase
      .channel(`calendar-holidays:${profile.business_id}`)
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

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 }),
    });
  }, [visibleMonth]);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, Holiday[]>();
    holidays.forEach((holiday) => {
      const items = map.get(holiday.holiday_date) ?? [];
      items.push(holiday);
      map.set(holiday.holiday_date, items);
    });
    return map;
  }, [holidays]);

  const monthHolidays = useMemo(() => {
    return holidays.filter((holiday) => isSameMonth(parseISO(holiday.holiday_date), visibleMonth));
  }, [holidays, visibleMonth]);

  const upcomingHolidays = useMemo(() => {
    const today = startOfDayKey(now);
    return holidays.filter((holiday) => holiday.holiday_date >= today).slice(0, 6);
  }, [holidays, now]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--navy)]">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Live workspace calendar with holidays and current local time.
          </p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[420px]">
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Clock3 className="size-4 text-[var(--navy)]" />
              Live time
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--navy)]">
              {format(now, "hh:mm:ss a")}
            </div>
            <div className="text-sm text-muted-foreground">{format(now, "EEEE, d MMM yyyy")}</div>
          </div>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="size-4 text-[var(--navy)]" />
              Holidays this month
            </div>
            <div className="mt-2 text-2xl font-bold text-[var(--navy)]">{monthHolidays.length}</div>
            <div className="text-sm text-muted-foreground">
              {loading ? "Loading..." : `${holidays.length} in ${visibleMonth.getFullYear()}`}
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-[var(--navy)]">
                {format(visibleMonth, "MMMM yyyy")}
              </h2>
              <p className="text-sm text-muted-foreground">Monday to Sunday view</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setVisibleMonth((value) => addMonths(value, -1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" onClick={() => setVisibleMonth(startOfMonth(new Date()))}>
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setVisibleMonth((value) => addMonths(value, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b bg-secondary/70 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
              <div key={day} className="px-1 py-3 sm:px-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {calendarDays.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayHolidays = holidaysByDate.get(key) ?? [];
              const isToday = isSameDay(day, now);
              const muted = !isSameMonth(day, visibleMonth);

              return (
                <div
                  key={key}
                  className={`min-h-[68px] min-w-0 border-b border-r p-1 last:border-r-0 sm:min-h-[112px] sm:p-2 ${
                    muted ? "bg-secondary/30 text-muted-foreground" : "bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold sm:size-8 sm:text-sm ${
                        isToday
                          ? "bg-[var(--navy)] text-white"
                          : muted
                            ? "text-muted-foreground"
                            : "text-[var(--navy)]"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {dayHolidays.length > 0 && (
                      <CalendarDays className="size-4 text-[var(--navy)]" />
                    )}
                  </div>
                  <div className="mt-2 hidden space-y-1 sm:block">
                    {dayHolidays.slice(0, 2).map((holiday) => (
                      <div
                        key={holiday.id}
                        className="truncate rounded-md bg-[var(--navy)]/10 px-2 py-1 text-[11px] font-medium text-[var(--navy)]"
                        title={holiday.holiday_name}
                      >
                        {holiday.holiday_name}
                      </div>
                    ))}
                    {dayHolidays.length > 2 && (
                      <div className="text-[11px] text-muted-foreground">
                        +{dayHolidays.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--navy)]">Upcoming holidays</h2>
                <p className="text-sm text-muted-foreground">Next dates on your calendar.</p>
              </div>
              <CalendarDays className="size-5 text-[var(--navy)]" />
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading holidays...
                </div>
              ) : upcomingHolidays.length === 0 ? (
                <div className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">
                  No upcoming holidays found.
                </div>
              ) : (
                upcomingHolidays.map((holiday) => (
                  <div key={holiday.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[var(--navy)]">
                          {holiday.holiday_name}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {format(parseISO(holiday.holiday_date), "EEE, d MMM yyyy")}
                        </div>
                      </div>
                      <Badge variant="outline">{holiday.is_paid ? "Paid" : "Unpaid"}</Badge>
                    </div>
                    {(holiday.country || holiday.state || holiday.plant) && (
                      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="size-3.5" />
                        {[holiday.country, holiday.state, holiday.plant]
                          .filter(Boolean)
                          .join(" / ")}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {profile && isManager(profile) && (
            <Link
              to="/holidays"
              className="flex items-center justify-between rounded-2xl border bg-card p-5 text-sm font-semibold text-[var(--navy)] shadow-sm transition-colors hover:bg-secondary/40"
            >
              Manage holidays
              <ChevronRight className="size-4" />
            </Link>
          )}
        </aside>
      </section>
    </div>
  );
}

function startOfDayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}
