import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Rotaro | Workforce Scheduling, Rosters, Leave & Attendance" },
      {
        name: "description",
        content:
          "Rotaro helps businesses manage rosters, employee leave, attendance, holidays, reports, and team communication in one workspace.",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "Rotaro | Workforce Scheduling Software" },
      {
        property: "og:description",
        content:
          "Plan rosters, track attendance, approve leave, manage holidays, and connect teams in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Rotaro | Workforce Scheduling Software" },
      {
        name: "twitter:description",
        content:
          "Plan rosters, track attendance, approve leave, manage holidays, and connect teams in real time.",
      },
      { property: "og:image", content: "/favicon.svg" },
      { name: "twitter:image", content: "/favicon.svg" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/favicon.svg" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  const isServer = typeof window === "undefined";

  // Safely access environment variables
  const supabaseUrl =
    (isServer ? process.env.SUPABASE_URL : null) ||
    (!isServer ? (window as any).__SUPABASE__?.SUPABASE_URL : null);

  const supabaseKey =
    (isServer ? process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY : null) ||
    (!isServer ? (window as any).__SUPABASE__?.SUPABASE_ANON_KEY : null);

  const env = { SUPABASE_URL: supabaseUrl, SUPABASE_ANON_KEY: supabaseKey };

  // Debug helper for Google Cloud logs
  if (typeof window === "undefined") {
    const serviceKey = process?.env?.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey || !serviceKey) {
      const missing = [
        !supabaseUrl && "SUPABASE_URL",
        !supabaseKey && "SUPABASE_ANON_KEY",
        !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
      ].filter(Boolean);
      console.warn(
        `CRITICAL: Supabase environment variables are missing in the server environment: ${missing.join(", ")}`,
      );
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `window.__SUPABASE__ = ${serializeForScript(env)};`,
          }}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function serializeForScript(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const applyPrefs = () => {
      if (typeof window === "undefined") return;
      const language = window.localStorage.getItem("rotaro-language") ?? "en";
      document.documentElement.dataset.theme = "light";
      document.documentElement.lang = language;
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "rotaro-language") applyPrefs();
    };
    const onPrefsChanged = () => applyPrefs();

    applyPrefs();
    window.addEventListener("storage", onStorage);
    window.addEventListener("rotaro-settings-changed", onPrefsChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rotaro-settings-changed", onPrefsChanged);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="bottom-right" />
    </QueryClientProvider>
  );
}
