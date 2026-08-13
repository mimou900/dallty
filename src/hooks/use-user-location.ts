import { useCallback, useEffect, useState } from "react";

export type GeoStatus = "idle" | "prompting" | "granted" | "denied" | "unsupported";
export type Coords = { lat: number; lng: number };

const POS_KEY = "dallty.geo.position";
const DENIED_KEY = "dallty.geo.denied";

function readStored(): Coords | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat: number; lng: number; at: number };
    if (Date.now() - parsed.at > 1000 * 60 * 30) return null;
    return { lat: parsed.lat, lng: parsed.lng };
  } catch {
    return null;
  }
}

/**
 * Location access is never requested on page load. The browser prompt only
 * appears when the visitor explicitly asks for a distance-based feature, and a
 * previous denial is remembered so we never nag them again.
 */
export function useUserLocation() {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");

  useEffect(() => {
    const stored = readStored();
    if (stored) {
      setCoords(stored);
      setStatus("granted");
      return;
    }
    if (typeof window !== "undefined" && window.localStorage.getItem(DENIED_KEY) === "1") {
      setStatus("denied");
    }
  }, []);

  const request = useCallback(async (): Promise<Coords | null> => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setStatus("unsupported");
      return null;
    }
    const stored = readStored();
    if (stored) {
      setCoords(stored);
      setStatus("granted");
      return stored;
    }
    // Respect a previous denial — asking again would re-prompt on every click.
    if (window.localStorage.getItem(DENIED_KEY) === "1") {
      setStatus("denied");
      return null;
    }

    setStatus("prompting");
    return new Promise<Coords | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          window.localStorage.removeItem(DENIED_KEY);
          window.localStorage.setItem(POS_KEY, JSON.stringify({ ...next, at: Date.now() }));
          setCoords(next);
          setStatus("granted");
          resolve(next);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            window.localStorage.setItem(DENIED_KEY, "1");
            setStatus("denied");
          } else {
            setStatus("idle");
          }
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 1000 * 60 * 10 },
      );
    });
  }, []);

  const clear = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.removeItem(POS_KEY);
    setCoords(null);
    setStatus("idle");
  }, []);

  return { coords, status, request, clear, enabled: Boolean(coords) };
}

/** Great-circle distance in km — instant, no network call. */
export function haversineKm(a: Coords, b: Coords) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
