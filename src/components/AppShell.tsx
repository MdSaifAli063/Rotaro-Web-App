import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FileText,
  CalendarCheck,
  BarChart3,
  Settings,
  LogOut,
  ClipboardList,
  Clock4,
  Repeat,
  LayoutTemplate,
  Menu,
  X,
} from "lucide-react";
import type { Profile } from "@/lib/auth";
import { isManager } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { RotaroMark } from "@/components/RotaroMark";

const managerNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/roster", label: "Roster", icon: CalendarDays },
  { to: "/shifts", label: "Shift Templates", icon: LayoutTemplate },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/attendance", label: "Attendance", icon: Clock4 },
  { to: "/leaves", label: "Leave Requests", icon: FileText },
  { to: "/swaps", label: "Shift Swaps", icon: Repeat },
  { to: "/holidays", label: "Holidays", icon: CalendarCheck },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

const employeeNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-roster", label: "My Roster", icon: CalendarDays },
  { to: "/apply-leave", label: "Apply Leave", icon: ClipboardList },
  { to: "/attendance", label: "My Attendance", icon: Clock4 },
  { to: "/swaps", label: "Shift Swaps", icon: Repeat },
];

export function AppShell({ children, profile }: { children: ReactNode; profile: Profile }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = isManager(profile) ? managerNav : employeeNav;
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const SidebarBody = (
    <>
      <div className="px-6 py-6 border-b border-sidebar-border flex items-center gap-2">
        <RotaroMark className="size-8 shrink-0" bg="#FFFFFF" fg="#1E2A45" />
        <div className="min-w-0">
          <div className="text-lg font-bold tracking-tight truncate">Rotaro</div>
          <div className="text-xs opacity-70 capitalize truncate">{profile.role} portal</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-auto">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="px-3 py-2 text-sm">
          <div className="font-medium truncate">{profile.name || profile.email}</div>
          <div className="text-xs opacity-70 truncate">{profile.email}</div>
        </div>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/60"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 bg-sidebar text-sidebar-foreground flex-col shrink-0">
        {SidebarBody}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground flex flex-col animate-in slide-in-from-left duration-200">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 p-2 rounded-md hover:bg-sidebar-accent/60"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            {SidebarBody}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-auto">
        <header className="h-14 border-b bg-card flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-2 rounded-md hover:bg-muted"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <Link to="/dashboard" className="flex items-center gap-2">
              <RotaroMark className="size-7" />
              <span className="font-bold text-[var(--navy)]">Rotaro</span>
            </Link>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <NotificationBell userId={profile.id} />
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
