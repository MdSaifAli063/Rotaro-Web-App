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
  CreditCard,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Mail,
  Calendar,
  HelpCircle,
  LayoutGrid,
  PanelLeftOpen,
} from "lucide-react";
import type { Profile } from "@/lib/auth";
import { isManager } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";
import { RotaroMark } from "@/components/RotaroMark";
import { UserAvatar } from "@/components/UserAvatar";
import { GlobalSearch } from "@/components/GlobalSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const managerNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/roster", label: "Rosters", icon: CalendarDays },
  { to: "/shifts", label: "Shift Templates", icon: LayoutTemplate },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/leaves", label: "Leave Requests", icon: FileText },
  { to: "/swaps", label: "Shift Swaps", icon: Repeat },
  { to: "/attendance", label: "Attendance", icon: ClipboardList },
  { to: "/holidays", label: "Holidays", icon: CalendarCheck },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

const employeeNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-roster", label: "My Roster", icon: CalendarDays },
  { to: "/apply-leave", label: "Apply Leave", icon: FileText },
  { to: "/attendance", label: "My Attendance", icon: Clock4 },
  { to: "/swaps", label: "Shift Swaps", icon: Repeat },
];

export function AppShell({ children, profile }: { children: ReactNode; profile: Profile }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = isManager(profile) ? managerNav : employeeNav;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", profile.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          console.error("Sidebar profile fetch error:", error.message);
          setAvatarPath(null);
          // If we get a 400 error (column missing), we should stop "Loading profile"
          // by ensuring we treat it as no avatar.
        } else {
          setAvatarPath((data?.avatar_url as string | null) ?? null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [profile.id]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const SidebarBody = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      <div
        className={`px-4 py-6 border-b border-sidebar-border flex items-center ${
          collapsed ? "justify-center" : "gap-2"
        }`}
      >
        <RotaroMark className="size-8 shrink-0" bg="#FFFFFF" fg="#1E2A45" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-lg font-bold tracking-tight truncate">Rotaro</div>
            <div className="text-xs opacity-70 capitalize truncate">{profile.role} portal</div>
          </div>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-auto">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              title={collapsed ? label : undefined}
              className={`flex items-center rounded-md text-sm transition-colors ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
              } ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Link
          to="/profile"
          title={collapsed ? profile.name || profile.email : undefined}
          className={`w-full flex items-center rounded-md text-sm hover:bg-sidebar-accent/60 ${
            collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          }`}
        >
          <UserAvatar name={profile.name} email={profile.email} avatarPath={avatarPath} size={32} />
          {!collapsed && (
            <div className="min-w-0 text-left">
              <div className="font-medium truncate">{profile.name || profile.email}</div>
              <div className="text-xs opacity-70 truncate">{profile.email}</div>
            </div>
          )}
        </Link>
        <button
          onClick={signOut}
          title={collapsed ? "Sign out" : undefined}
          className={`mt-1 w-full flex items-center rounded-md text-sm hover:bg-sidebar-accent/60 ${
            collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
          }`}
        >
          <LogOut className="size-4" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="h-screen overflow-hidden flex bg-background">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex relative h-screen bg-sidebar text-sidebar-foreground flex-col shrink-0 transition-[width] duration-200 ${
          sidebarCollapsed ? "w-20" : "w-64"
        }`}
      >
        <button
          type="button"
          onClick={() => setSidebarCollapsed((value) => !value)}
          className="absolute -right-3 top-5 z-20 inline-flex size-9 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
        <SidebarBody collapsed={sidebarCollapsed} />
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
            <SidebarBody />
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 h-screen overflow-y-auto">
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
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
            <div className="hidden xl:block">
              <GlobalSearch profile={profile} />
            </div>
            <div className="hidden md:flex items-center gap-1">
              <button
                type="button"
                className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Toggle dashboard view"
                title="Toggle dashboard view"
              >
                <LayoutGrid className="size-4" />
              </button>
              <Link
                to="/dashboard"
                className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Messages"
                title="Messages"
              >
                <Mail className="size-4" />
              </Link>
              <Link
                to="/calendar"
                className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Calendar"
                title="Calendar"
              >
                <Calendar className="size-4" />
              </Link>
              <Link
                to="/settings"
                className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="size-4" />
              </Link>
              <Link
                to="/help-center"
                className="size-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Help"
                title="Help"
              >
                <HelpCircle className="size-4" />
              </Link>
            </div>
            <NotificationBell userId={profile.id} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--navy)]"
                  aria-label="Open user menu"
                >
                  <UserAvatar
                    name={profile.name}
                    email={profile.email}
                    avatarPath={avatarPath}
                    size={32}
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium truncate">{profile.name || profile.email}</div>
                  <div className="text-xs font-normal text-muted-foreground truncate">
                    {profile.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="cursor-pointer">
                    <UserIcon className="size-4" />
                    My Profile
                  </Link>
                </DropdownMenuItem>
                {isManager(profile) && (
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">
                      <Settings className="size-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer">
                  <LogOut className="size-4" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
