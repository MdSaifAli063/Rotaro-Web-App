export const SITE_NAME = "Rotaro";
export const DEFAULT_SITE_URL = "https://rotaro.vercel.app";
export const DEFAULT_DESCRIPTION =
  "Rotaro helps businesses plan employee rosters, manage leave, track attendance, and run workforce reports in one secure workspace.";

function normalizeSiteUrl(value: string | undefined) {
  const candidate = value?.trim().replace(/\/+$/, "");
  if (!candidate) return DEFAULT_SITE_URL;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : DEFAULT_SITE_URL;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = normalizeSiteUrl(import.meta.env.VITE_APP_URL as string | undefined);
export const LOGO_IMAGE_PATH = "/icon-512.png";
export const SOCIAL_IMAGE_PATH = "/og-image.png";

export function absoluteUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
}

export function publicPageMeta({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const url = absoluteUrl(path);
  const image = absoluteUrl(SOCIAL_IMAGE_PATH);

  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: "index, follow, max-image-preview:large" },
    { name: "googlebot", content: "index, follow, max-image-preview:large" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: "en_US" },
    { property: "og:url", content: url },
    { property: "og:image", content: image },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: "Rotaro workforce scheduling" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: "Rotaro workforce scheduling" },
  ];
}

export function canonicalLink(path: string) {
  return { rel: "canonical", href: absoluteUrl(path) };
}

export const NO_INDEX_META = [
  { name: "robots", content: "noindex, nofollow, noarchive" },
  { name: "googlebot", content: "noindex, nofollow, noarchive" },
];
