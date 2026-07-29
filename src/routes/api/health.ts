import { createFileRoute } from "@tanstack/react-router";

const HEALTH_TIMEOUT_MS = 4_000;

function healthResponse(status: "ok" | "degraded", httpStatus: number) {
  return Response.json(
    {
      status,
      version: "1.0.0",
      timestamp: new Date().toISOString(),
    },
    {
      status: httpStatus,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30",
      },
    },
  );
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          return healthResponse("degraded", 503);
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin
            .from("profiles")
            .select("id", { head: true, count: "exact" })
            .limit(1)
            .abortSignal(AbortSignal.timeout(HEALTH_TIMEOUT_MS));

          if (error) {
            console.error("[Health] Supabase readiness check failed", error);
            return healthResponse("degraded", 503);
          }

          return healthResponse("ok", 200);
        } catch (error) {
          console.error("[Health] Readiness check failed", error);
          return healthResponse("degraded", 503);
        }
      },
    },
  },
});
