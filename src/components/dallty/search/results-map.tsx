import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useNavigate } from "@tanstack/react-router";

import type { Lang } from "@/lib/dallty-content";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

export type MapPin = {
  id: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  en: { name: string };
  ar: { name: string };
};

/**
 * Search redesign §21 — a separate interaction from the results list, never
 * blocking it: this whole component is dynamically `import()`ed by
 * `search.tsx` only once "Afficher la carte" is first opened (see that
 * file), so Mapbox's JS/CSS never load on the default list view. Markers
 * are the current real, already-filtered result set — nothing here re-fetches
 * or re-filters independently of the list.
 */
export function ResultsMap({ businesses, lang }: { businesses: MapPin[]; lang: Lang }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      // Algiers — the only marketplace-enabled country today (confirmed
      // during planning); re-centers immediately below once real pins exist.
      center: [3.05, 36.75],
      zoom: 11,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const located = businesses.filter(
      (b): b is MapPin & { lat: number; lng: number } => b.lat != null && b.lng != null,
    );
    for (const b of located) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", lang === "ar" ? b.ar.name : b.en.name);
      el.style.cssText =
        "width:28px;height:28px;border-radius:9999px;background:var(--color-primary);" +
        "border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);cursor:pointer;padding:0;";
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([b.lng, b.lat]).addTo(map);
      el.addEventListener("click", () => {
        void navigate({ to: "/business/$businessSlug", params: { businessSlug: b.slug } });
      });
      markersRef.current.push(marker);
    }

    if (located.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      located.forEach((b) => bounds.extend([b.lng, b.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    }
  }, [businesses, lang, navigate]);

  return <div ref={containerRef} className="size-full" />;
}

export default ResultsMap;
