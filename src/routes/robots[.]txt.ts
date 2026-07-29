import { createFileRoute } from "@tanstack/react-router";

import { absoluteUrl } from "@/lib/seo";

const DISALLOWED_PATHS = [
  "/api/",
  "/auth",
  "/client-login",
  "/staff-login",
  "/forgot-password",
  "/reset-password",
  "/change-password",
  "/onboarding",
  "/dashboard",
  "/workspace",
  "/organization",
  "/roster",
  "/shifts",
  "/staff",
  "/leaves",
  "/apply-leave",
  "/swaps",
  "/attendance",
  "/holidays",
  "/reports",
  "/messages",
  "/notifications",
  "/calendar",
  "/calculator",
  "/billing",
  "/settings",
  "/profile",
];

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const disallowRules = DISALLOWED_PATHS.map((path) => `Disallow: ${path}`).join("\n");
        const body = `User-agent: *
Allow: /

${disallowRules}

Sitemap: ${absoluteUrl("/sitemap.xml")}
`;

        return new Response(body, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
