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
  Building2,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Mail,
  Calendar,
  Calculator,
  HelpCircle,
  LayoutGrid,
  MoreHorizontal,
  LockKeyhole,
} from "lucide-react";
import type { Profile } from "@/lib/auth";
import { isManager } from "@/lib/auth";
import { hasPlanAtLeast, type AppPlanKey, useBusinessPlan } from "@/lib/billing/plans";
import { NotificationBell } from "@/components/NotificationBell";
import { RotaroBrand, RotaroMark } from "@/components/RotaroMark";
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

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  minPlan?: AppPlanKey;
};

const managerNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/roster", label: "Rosters", icon: CalendarDays },
  { to: "/shifts", label: "Shift Templates", icon: LayoutTemplate, minPlan: "professional" },
  { to: "/staff", label: "Staff", icon: Users },
  { to: "/leaves", label: "Leave Requests", icon: FileText, minPlan: "professional" },
  { to: "/swaps", label: "Shift Swaps", icon: Repeat, minPlan: "professional" },
  { to: "/attendance", label: "Attendance", icon: ClipboardList, minPlan: "professional" },
  { to: "/holidays", label: "Holidays", icon: CalendarCheck, minPlan: "professional" },
  { to: "/reports", label: "Reports", icon: BarChart3, minPlan: "professional" },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/settings", label: "Settings", icon: Settings },
];

const employeeNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/my-roster", label: "My Roster", icon: CalendarDays },
  { to: "/apply-leave", label: "Apply Leave", icon: FileText, minPlan: "professional" },
  { to: "/attendance", label: "My Attendance", icon: Clock4, minPlan: "professional" },
  { to: "/swaps", label: "Shift Swaps", icon: Repeat, minPlan: "professional" },
  { to: "/settings", label: "Settings", icon: Settings },
];

const headerTools = [
  { to: "/workspace", label: "Workspace", icon: LayoutGrid },
  { to: "/organization", label: "Organization", icon: Building2 },
  { to: "/messages", label: "Messages", icon: Mail },
  { to: "/calendar", label: "Calendar", icon: Calendar },
  { to: "/calculator", label: "Calculator", icon: Calculator },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help-center", label: "Help", icon: HelpCircle },
];

export function AppShell({ children, profile }: { children: ReactNode; profile: Profile }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = isManager(profile) ? managerNav : employeeNav;
  const { planKey } = useBusinessPlan(profile.business_id);
  const tools = isManager(profile)
    ? headerTools
    : headerTools.filter((tool) => tool.to !== "/organization");
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
    navigate({ to: "/client-login", search: { next: undefined }, replace: true });
  };

  const SidebarBody = ({ collapsed = false }: { collapsed?: boolean }) => (
    <>
      <div
        className={`px-4 py-6 border-b border-sidebar-border flex items-center ${
          collapsed ? "justify-center" : "gap-2"
        }`}
      >
        {collapsed ? (
          <RotaroMark className="size-8 shrink-0" variant="inverse" />
        ) : (
          <RotaroBrand
            variant="inverse"
            subtitle={`${profile.role} portal`}
            subtitleClassName="text-white/70"
          />
        )}
      </div>
      {isManager(profile) && (
        <div className="border-b border-sidebar-border px-3 py-3">
          {!collapsed && (
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-sidebar-foreground/50">
              Company
            </div>
          )}
          <Link
            to="/organization"
            title={collapsed ? "Organization" : undefined}
            className={`group flex items-center rounded-xl border transition-colors ${
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
            } ${
              pathname === "/organization" || pathname.startsWith("/organization/")
                ? "border-sidebar-accent bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "border-transparent bg-sidebar-accent/30 hover:border-sidebar-accent hover:bg-sidebar-accent/50"
            }`}
          >
            <span
              className={`flex shrink-0 items-center justify-center rounded-lg ${
                collapsed ? "size-10" : "size-9"
              } ${
                pathname === "/organization" || pathname.startsWith("/organization/")
                  ? "bg-white/20 text-sidebar-accent-foreground"
                  : "bg-sidebar text-sidebar-foreground"
              }`}
            >
              <Building2 className="size-5" />
            </span>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">Organization</div>
                <div className="truncate text-xs opacity-70">Company profile</div>
              </div>
            )}
            {!collapsed && <ChevronRight className="size-4 shrink-0 opacity-70" />}
          </Link>
        </div>
      )}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-auto">
        {nav.map(({ to, label, icon: Icon, minPlan }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          const locked = !!minPlan && !hasPlanAtLeast(planKey, minPlan);
          return (
            <Link
              key={to}
              to={locked ? "/pricing" : to}
              title={collapsed ? (locked ? `${label} - upgrade required` : label) : undefined}
              className={`flex items-center rounded-md text-sm transition-colors ${
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
              } ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : locked
                    ? "text-sidebar-foreground/60 hover:bg-sidebar-accent/40"
                    : "hover:bg-sidebar-accent/60"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              {!collapsed && locked && <LockKeyhole className="ml-auto size-3.5 opacity-70" />}
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
    <div className="flex h-svh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside
        className={`relative hidden h-svh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex ${
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

      <main className="h-svh min-w-0 flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-2 border-b bg-card px-3 py-2 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 -ml-2 rounded-md hover:bg-muted"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>
            <Link to="/dashboard" className="flex items-center">
              <RotaroBrand size="sm" />
            </Link>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2">
            <div className="hidden xl:block">
              <GlobalSearch profile={profile} />
            </div>
            <div className="hidden md:flex items-center gap-1">
              {tools.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={label}
                  title={label}
                >
                  <Icon className="size-4" />
                </Link>
              ))}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                  aria-label="Open tools"
                >
                  <MoreHorizontal className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Tools</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {tools.map(({ to, label, icon: Icon }) => (
                  <DropdownMenuItem key={to} asChild>
                    <Link to={to} className="cursor-pointer">
                      <Icon className="size-4" />
                      {label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
        <div className="mx-auto min-w-0 max-w-7xl px-3 py-5 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
