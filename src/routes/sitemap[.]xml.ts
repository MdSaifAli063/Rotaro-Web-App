import { createFileRoute } from "@tanstack/react-router";

import { absoluteUrl } from "@/lib/seo";

const PUBLIC_ROUTES = [
  { path: "/", priority: "1.0", changeFrequency: "weekly" },
  { path: "/pricing", priority: "0.9", changeFrequency: "monthly" },
  { path: "/support", priority: "0.7", changeFrequency: "monthly" },
] as const;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const urls = PUBLIC_ROUTES.map(
          ({ path, priority, changeFrequency }) => `  <url>
    <loc>${escapeXml(absoluteUrl(path))}</loc>
    <changefreq>${changeFrequency}</changefreq>
    <priority>${priority}</priority>
  </url>`,
        ).join("\n");

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
          {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
          },
        );
      },
    },
  },
});
