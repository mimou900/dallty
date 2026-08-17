import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Direct Google Routes API — replaces the Lovable connector gateway
// (`connector-gateway.lovable.dev/google_maps/...`), which proxied this same
// Google endpoint behind a Lovable API key. Google's own endpoint takes a
// single server-side key via `X-Goog-Api-Key`; no intermediary required.
const ROUTES_API_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

const schema = z.object({
  origin: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
  destinations: z
    .array(
      z.object({
        id: z.string().uuid(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      }),
    )
    .min(1)
    .max(25),
});

export type TravelTime = {
  id: string;
  distanceMeters: number | null;
  drivingSeconds: number | null;
  walkingSeconds: number | null;
};

async function matrix(
  origin: { lat: number; lng: number },
  destinations: { id: string; lat: number; lng: number }[],
  mode: "DRIVE" | "WALK",
  apiKey: string,
) {
  const response = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: {
      "X-Goog-Api-Key": apiKey,
      "Content-Type": "application/json",
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({
      origins: [
        { waypoint: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } } },
      ],
      destinations: destinations.map((d) => ({
        waypoint: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
      })),
      travelMode: mode,
    }),
  });

  if (response.status === 403) {
    const errorBody = (await response.json()) as {
      error?: { details?: Array<{ reason?: string }> };
    };
    const details: Array<{ reason?: string }> = errorBody?.error?.details ?? [];
    const reason = details.find((d) => d.reason)?.reason;
    if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
      throw new Error(
        'Google Maps server key is referrer-restricted. In Google Cloud Console, set the server key\'s application restrictions to "None" or "IP addresses".',
      );
    }
    if (reason === "API_KEY_SERVICE_BLOCKED") {
      throw new Error(
        "Google Maps server key does not allow the Routes API. Add it to the key's allowed-APIs list.",
      );
    }
    throw new Error("Google Maps request was denied (403).");
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Routes request failed [${response.status}]: ${body}`);
  }
  return (await response.json()) as Array<{
    destinationIndex: number;
    duration?: string;
    distanceMeters?: number;
    condition?: string;
  }>;
}

/**
 * Driving and walking travel time from the visitor's own position to a batch of
 * salons. Only called after the visitor explicitly granted location access.
 */
export const getTravelTimes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data }): Promise<TravelTime[]> => {
    const apiKey = process.env["GOOGLE_MAPS_API_KEY"];
    if (!apiKey) throw new Error("Google Maps is not connected");

    const [drive, walk] = await Promise.all([
      matrix(data.origin, data.destinations, "DRIVE", apiKey),
      matrix(data.origin, data.destinations, "WALK", apiKey),
    ]);

    const secs = (v?: string) => (v ? Number(v.replace("s", "")) : null);

    return data.destinations.map((d, index) => {
      const dr = drive.find((r) => r.destinationIndex === index);
      const wk = walk.find((r) => r.destinationIndex === index);
      return {
        id: d.id,
        distanceMeters: dr?.distanceMeters ?? null,
        drivingSeconds: secs(dr?.duration),
        walkingSeconds: secs(wk?.duration),
      };
    });
  });
