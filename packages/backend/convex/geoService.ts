// Client for the external Vacation-Planner geo service (POST /v1/nearby-places),
// which returns operational merchant locations for brand keywords near a
// coordinate, backed by a Redis geo index over Google Maps. Plain fetch() in
// Convex's default runtime, mirroring plaid.ts / rapidapi.ts. Kept thin so
// nearby.ts owns the benefit-matching; this only speaks the wire protocol and
// normalizes the response.

import { missingEnvVariableUrl } from "./utils";

const GEO_SERVICE_DOCS_URL =
  "https://github.com/timwangmusic/Vacation-Planner#running-with-docker-compose";
// The endpoint requires a PAT — mint one via the service's POST /v1/create-token.
const GEO_SERVICE_TOKEN_DOCS_URL =
  "https://github.com/timwangmusic/Vacation-Planner (POST /v1/create-token)";

// Fail fast rather than hold a Convex function slot open if the geo service
// (cold cache -> live Google Maps fan-out) stalls.
const GEO_SERVICE_TIMEOUT_MS = 15_000;

// One normalized merchant location.
export type NearbyPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  hours: string[]; // 7 entries, Monday-first, when known
  url: string;
};

export type NearbyPlacesByBrand = {
  query: string; // echoes the requested brand keyword
  places: NearbyPlace[];
  error?: string; // per-brand failure; other brands still return
};

// Raw wire shapes (Go service uses capitalized JSON field names).
type RawPlace = {
  ID?: string;
  Name?: string;
  FormattedAddress?: string;
  Location?: { latitude?: number; longitude?: number };
  Hours?: string[];
  URL?: string;
};
type RawResult = { brand?: string; places?: RawPlace[] | null; error?: string };
type RawResponse = { results?: RawResult[] };

function normalizePlace(p: RawPlace): NearbyPlace {
  return {
    placeId: p.ID ?? "",
    name: p.Name ?? "",
    address: p.FormattedAddress ?? "",
    lat: p.Location?.latitude ?? 0,
    lng: p.Location?.longitude ?? 0,
    hours: Array.isArray(p.Hours) ? p.Hours : [],
    url: p.URL ?? "",
  };
}

export type NearbyPlacesRequest = {
  brands: string[];
  lat: number;
  lng: number;
  radiusMeters?: number; // default 3000
  limitPerBrand?: number; // default 3
  localTime?: string; // RFC3339 with the user's UTC offset; filters day-closed places
};

// Call the geo service. Throws on config/transport/HTTP errors; per-brand
// errors are surfaced inside each result rather than thrown.
export async function fetchNearbyPlacesByBrand(
  req: NearbyPlacesRequest,
): Promise<NearbyPlacesByBrand[]> {
  const base = process.env.GEO_SERVICE_URL;
  if (!base) {
    throw new Error(missingEnvVariableUrl("GEO_SERVICE_URL", GEO_SERVICE_DOCS_URL));
  }
  if (req.brands.length === 0) return [];

  // The endpoint requires a PAT; an absent token would just yield an opaque 401,
  // so fail early with an actionable message like every other credential here.
  const token = process.env.GEO_SERVICE_TOKEN;
  if (!token) {
    throw new Error(
      missingEnvVariableUrl("GEO_SERVICE_TOKEN", GEO_SERVICE_TOKEN_DOCS_URL),
    );
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/v1/nearby-places`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        brands: req.brands,
        location: { latitude: req.lat, longitude: req.lng },
        radius: req.radiusMeters ?? 3000,
        limit: req.limitPerBrand ?? 3,
        ...(req.localTime ? { localTime: req.localTime } : {}),
      }),
      signal: AbortSignal.timeout(GEO_SERVICE_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(
        `geo service /v1/nearby-places timed out after ${GEO_SERVICE_TIMEOUT_MS}ms`,
      );
    }
    throw e;
  }

  const json = (await res.json().catch(() => ({}))) as RawResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(`geo service /v1/nearby-places failed — ${json?.error ?? `HTTP ${res.status}`}`);
  }

  return (json.results ?? []).map((r) => ({
    query: r.brand ?? "",
    places: (r.places ?? []).map(normalizePlace),
    ...(r.error ? { error: r.error } : {}),
  }));
}
