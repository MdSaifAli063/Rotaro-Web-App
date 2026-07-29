import { createFileRoute } from "@tanstack/react-router";
import { AuthPortal, type AuthMode, type AuthPlan } from "@/components/AuthPortal";
import { NO_INDEX_META } from "@/lib/seo";

type ClientLoginSearch = {
  next?: string;
  mode?: AuthMode;
  plan?: AuthPlan;
};

export const Route = createFileRoute("/client-login")({
  validateSearch: (search: Record<string, unknown>): ClientLoginSearch => {
    const result: ClientLoginSearch = {};
    if (typeof search.next === "string" && search.next.startsWith("/")) result.next = search.next;
    if (search.mode === "signup" || search.mode === "signin") result.mode = search.mode;
    if (search.plan === "starter" || search.plan === "professional" || search.plan === "business") {
      result.plan = search.plan;
    }
    return result;
  },
  head: () => ({
    meta: [
      { title: "Client login - Rotaro" },
      { name: "description", content: "Sign in or create a Rotaro client workspace." },
      ...NO_INDEX_META,
    ],
  }),
  component: ClientLoginPage,
});

function ClientLoginPage() {
  const search = Route.useSearch();
  return <AuthPortal portal="client" {...search} />;
}
