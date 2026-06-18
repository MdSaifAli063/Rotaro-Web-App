import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { useSession, fetchProfile, isManager } from "@/lib/auth";
import { useEffect, useState } from "react";
import { RotaroMark } from "@/components/RotaroMark";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user } = useSession();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (user) {
      fetchProfile().then(setProfile);
    }
  }, [user]);

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-gray-800 text-white p-4">
        <div className="flex items-center gap-2 mb-8">
            <RotaroMark className="size-8" />
            <h1 className="text-xl font-bold">Rotaro</h1>
        </div>
        <nav className="flex flex-col gap-2">
            <Link to="/dashboard" className="px-3 py-2 rounded-md hover:bg-gray-700" activeProps={{className: "bg-gray-900"}}>Dashboard</Link>
            {profile && isManager(profile) && (
              <>
                <Link to="/roster" className="px-3 py-2 rounded-md hover:bg-gray-700" activeProps={{className: "bg-gray-900"}}>Roster</Link>
                <Link to="/staff" className="px-3 py-2 rounded-md hover:bg-gray-700" activeProps={{className: "bg-gray-900"}}>Staff</Link>
                <Link to="/reports" className="px-3 py-2 rounded-md hover:bg-gray-700" activeProps={{className: "bg-gray-900"}}>Reports</Link>
                <Link to="/holidays" className="px-3 py-2 rounded-md hover:bg-gray-700" activeProps={{className: "bg-gray-900"}}>Holidays</Link>
              </>
            )}
        </nav>
      </aside>
      <main className="flex-1 p-8 bg-gray-50">
        <header className="flex justify-end mb-8">
            {user && <NotificationBell userId={user.id} />}
        </header>
        <Outlet />
      </main>
    </div>
  );
}