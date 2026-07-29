import { createFileRoute } from "@tanstack/react-router";
import { AuthPortal } from "@/components/AuthPortal";
import { NO_INDEX_META } from "@/lib/seo";

type StaffLoginSearch = {
  next?: string;
};

export const Route = createFileRoute("/staff-login")({
  validateSearch: (search: Record<string, unknown>): StaffLoginSearch => {
    const result: StaffLoginSearch = {};
    if (typeof search.next === "string" && search.next.startsWith("/")) result.next = search.next;
    return result;
  },
  head: () => ({
    meta: [
      { title: "Staff login - Rotaro" },
      { name: "description", content: "Staff login for Rotaro rosters, leave, and attendance." },
      ...NO_INDEX_META,
    ],
  }),
  component: StaffLoginPage,
});

function StaffLoginPage() {
  const search = Route.useSearch();
  return <AuthPortal portal="staff" mode="signin" {...search} />;
}
