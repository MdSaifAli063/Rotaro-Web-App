import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const reverseGeocodeInput = z.object({
  accessToken: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

type GoogleGeocodingResponse = {
  status?: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    types?: string[];
  }>;
};

const addressCache = new Map<string, string | null>();
const CACHE_LIMIT = 1_000;
const requestWindows = new Map<string, { count: number; startedAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 12;

function cacheAddress(key: string, address: string | null) {
  if (addressCache.size >= CACHE_LIMIT) {
    const oldestKey = addressCache.keys().next().value;
    if (oldestKey) addressCache.delete(oldestKey);
  }
  addressCache.set(key, address);
}

function normalizeAddress(value?: string) {
  const address = value?.replace(/\s+/g, " ").trim();
  return address ? address.slice(0, 500) : null;
}

function enforceRateLimit(userId: string) {
  const now = Date.now();
  const window = requestWindows.get(userId);

  if (!window || now - window.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestWindows.set(userId, { count: 1, startedAt: now });
    return;
  }

  if (window.count >= RATE_LIMIT_REQUESTS) {
    throw new Error("Too many location lookups. Please wait a moment and try again.");
  }

  window.count += 1;
}

export const reverseGeocodeAttendanceLocation = createServerFn({ method: "POST" })
  .validator(reverseGeocodeInput)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !auth.user) {
      throw new Error("Your session has expired. Please sign in again.");
    }
    enforceRateLimit(auth.user.id);

    const apiKey = process.env.GOOGLE_MAPS_GEOCODING_API_KEY;
    if (!apiKey) return { address: null };

    const cacheKey = `${data.latitude.toFixed(5)},${data.longitude.toFixed(5)}`;
    if (addressCache.has(cacheKey)) {
      return { address: addressCache.get(cacheKey) ?? null };
    }

    const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    endpoint.searchParams.set("latlng", `${data.latitude},${data.longitude}`);
    endpoint.searchParams.set("language", "en");
    endpoint.searchParams.set("key", apiKey);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Google Geocoding returned HTTP ${response.status}.`);

      const payload = (await response.json()) as GoogleGeocodingResponse;
      if (payload.status === "ZERO_RESULTS") {
        cacheAddress(cacheKey, null);
        return { address: null };
      }
      if (payload.status !== "OK") {
        throw new Error(payload.error_message || `Google Geocoding returned ${payload.status}.`);
      }

      const preferred = payload.results?.find((result) =>
        result.types?.some((type) =>
          ["street_address", "premise", "subpremise", "route"].includes(type),
        ),
      );
      const address = normalizeAddress(
        preferred?.formatted_address ?? payload.results?.[0]?.formatted_address,
      );
      cacheAddress(cacheKey, address);
      return { address };
    } finally {
      clearTimeout(timeout);
    }
  });
