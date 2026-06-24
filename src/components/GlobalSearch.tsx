import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  CalendarDays,
  Clock,
  Folder,
  LayoutDashboard,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/auth";
import { isManager } from "@/lib/auth";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type SearchCategory = "all" | "employee" | "department" | "analytic" | "schedule" | "time";

type SearchResult = {
  id: string;
  title: string;
  subtitle: string;
  category: Exclude<SearchCategory, "all">;
  to: string;
  initials?: string;
};

type EmployeeResult = {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  employee_code: string | null;
};

const managerShortcuts: SearchResult[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    subtitle: "Live overview and clock feed",
    category: "analytic",
    to: "/dashboard",
  },
  {
    id: "reports",
    title: "Reports",
    subtitle: "Hours, wages, attendance, and exports",
    category: "analytic",
    to: "/reports",
  },
  {
    id: "rosters",
    title: "Rosters",
    subtitle: "Plan weekly schedules",
    category: "schedule",
    to: "/roster",
  },
  {
    id: "shift-templates",
    title: "Shift Templates",
    subtitle: "Reusable shift presets",
    category: "schedule",
    to: "/shifts",
  },
  {
    id: "attendance",
    title: "Attendance",
    subtitle: "Check-in and time records",
    category: "time",
    to: "/attendance",
  },
  {
    id: "leaves",
    title: "Leave Requests",
    subtitle: "Approve employee leave",
    category: "time",
    to: "/leaves",
  },
  {
    id: "holidays",
    title: "Holidays",
    subtitle: "Public holidays and closure rules",
    category: "schedule",
    to: "/holidays",
  },
  {
    id: "staff",
    title: "Staff",
    subtitle: "Employee directory",
    category: "employee",
    to: "/staff",
  },
];

const employeeShortcuts: SearchResult[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    subtitle: "Your next shift and quick actions",
    category: "analytic",
    to: "/dashboard",
  },
  {
    id: "my-roster",
    title: "My Roster",
    subtitle: "Your upcoming shifts",
    category: "schedule",
    to: "/my-roster",
  },
  {
    id: "apply-leave",
    title: "Apply Leave",
    subtitle: "Request annual, sick, or casual leave",
    category: "time",
    to: "/apply-leave",
  },
  {
    id: "attendance",
    title: "My Attendance",
    subtitle: "Check in, breaks, and check out",
    category: "time",
    to: "/attendance",
  },
  {
    id: "swaps",
    title: "Shift Swaps",
    subtitle: "Request or review swaps",
    category: "schedule",
    to: "/swaps",
  },
];

const categories: { id: SearchCategory; label: string; icon: typeof Search }[] = [
  { id: "all", label: "All", icon: Search },
  { id: "employee", label: "Employee", icon: Users },
  { id: "department", label: "Department", icon: Folder },
  { id: "analytic", label: "Analytic", icon: BarChart3 },
  { id: "schedule", label: "Schedule", icon: CalendarDays },
  { id: "time", label: "Time", icon: Clock },
];

export function GlobalSearch({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SearchCategory>("all");
  const [employees, setEmployees] = useState<EmployeeResult[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || !profile.business_id) return;
    let cancelled = false;
    supabase
      .from("employees")
      .select("id, name, email, department, employee_code")
      .eq("business_id", profile.business_id)
      .order("name")
      .limit(40)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Global search employee fetch error:", error.message);
          setEmployees([]);
          return;
        }
        setEmployees((data ?? []) as EmployeeResult[]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, profile.business_id]);

  const results = useMemo(() => {
    const shortcuts = isManager(profile) ? managerShortcuts : employeeShortcuts;
    const employeeResults: SearchResult[] = isManager(profile)
      ? employees.map((employee) => ({
          id: `employee-${employee.id}`,
          title: employee.name,
          subtitle: employee.email || employee.employee_code || employee.department || "Employee",
          category: "employee",
          to: "/staff",
          initials: initials(employee.name),
        }))
      : [];
    const departmentResults: SearchResult[] = Array.from(
      new Set(employees.map((employee) => employee.department).filter(Boolean)),
    ).map((department) => ({
      id: `department-${department}`,
      title: department as string,
      subtitle: "Department staff and reporting",
      category: "department",
      to: isManager(profile) ? "/staff" : "/dashboard",
      initials: String(department).slice(0, 2).toUpperCase(),
    }));
    return [...shortcuts, ...employeeResults, ...departmentResults].filter(
      (item) => activeCategory === "all" || item.category === activeCategory,
    );
  }, [activeCategory, employees, profile]);

  const sections = useMemo(() => {
    const order: SearchCategory[] = ["employee", "department", "analytic", "schedule", "time"];
    return order
      .map((category) => ({
        category,
        label: categoryHeading(category),
        items: results.filter((item) => item.category === category),
      }))
      .filter((section) => section.items.length > 0);
  }, [results]);

  const runCommand = (to: string) => {
    setOpen(false);
    navigate({ to });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden w-full max-w-md items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-[var(--navy)]/40 hover:text-[var(--navy)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)] sm:flex"
        aria-label="Open search"
      >
        <Search className="size-4 text-[var(--navy)]/60" />
        <span className="flex-1 text-left">Search anything here...</span>
        <kbd className="rounded border bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          Ctrl K
        </kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
        aria-label="Open search"
      >
        <Search className="size-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="top-8 max-h-[calc(100vh-4rem)] w-[calc(100vw-1.5rem)] max-w-2xl translate-y-0 overflow-hidden rounded-xl border bg-white p-0 text-[var(--navy)] shadow-2xl sm:top-10">
          <Command
            className="rounded-xl bg-white"
            filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
          >
            <CommandInput
              className="h-14 text-base placeholder:text-slate-400"
              placeholder="Search anything here..."
            />
            <div className="flex gap-2 overflow-x-auto border-b px-4 py-3">
              {categories.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveCategory(id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeCategory === id
                      ? "border-[var(--navy)] bg-[var(--navy)] text-white"
                      : "border-slate-200 bg-white text-[var(--navy)] hover:border-[var(--navy)]/40"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <CommandList className="max-h-[min(520px,calc(100vh-14rem))] px-2 py-3">
              <CommandEmpty>No results found.</CommandEmpty>
              {sections.map((section) => (
                <CommandGroup key={section.category} heading={section.label}>
                  {section.items.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`${item.title} ${item.subtitle} ${item.category}`}
                      onSelect={() => runCommand(item.to)}
                      className="items-center gap-3 rounded-lg px-3 py-3 data-[selected=true]:bg-[#EEF3FA]"
                    >
                      <ResultIcon item={item} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[var(--navy)]">
                          {item.title}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {item.subtitle}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResultIcon({ item }: { item: SearchResult }) {
  if (item.initials) {
    return (
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--navy)] text-xs font-bold text-white">
        {item.initials}
      </div>
    );
  }
  const Icon =
    item.category === "employee"
      ? Users
      : item.category === "department"
        ? Folder
        : item.category === "analytic"
          ? BarChart3
          : item.category === "schedule"
            ? CalendarDays
            : Clock;
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#EEF3FA] text-[var(--navy)]">
      <Icon className="size-4" />
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function categoryHeading(category: SearchCategory) {
  if (category === "all") return "All Results";
  return categories.find((item) => item.id === category)?.label ?? "Results";
}
