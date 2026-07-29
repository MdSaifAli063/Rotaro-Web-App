import { createFileRoute, redirect } from "@tanstack/react-router";

import { NO_INDEX_META } from "@/lib/seo";

type AuthSearch = {
  next?: string;
  mode?: "signin" | "signup";
  plan?: "starter" | "professional" | "business";
};

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: NO_INDEX_META }),
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const result: AuthSearch = {};
    if (typeof search.next === "string" && search.next.startsWith("/")) result.next = search.next;
    if (search.mode === "signup" || search.mode === "signin") result.mode = search.mode;
    if (search.plan === "starter" || search.plan === "professional" || search.plan === "business") {
      result.plan = search.plan;
    }
    return result;
  },
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/client-login",
      search,
    });
  },
  component: () => null,
});
