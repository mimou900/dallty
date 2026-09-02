import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

/**
 * Compact, non-interactive-feeling location preview for the Business Profile page — one
 * Dallty pin at the business's real coordinates. Deliberately NOT the full search results
 * map (`search/results-map.tsx`): no clustering, no other businesses, no click-to-preview —
 * just "here's roughly where this place is" before the customer taps "Get directions".
 *
 * Only ever renders with real branch coordinates (`business_branches.latitude/longitude`).
 * The caller is responsible for not rendering this at all when those are null — this
 * component never falls back to a city-center or jittered point (brief §19/§20: "never use
 * city center, wilaya centroid, random jitter... for navigation" — the preview map should
 * never visually promise a location the "Get directions" button then can't back up).
 */
export function BusinessLocationMap({
  lat,
  lng,
  name,
}: {
  lat: number;
  lng: number;
  name: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || !mapboxgl.accessToken) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: [lng, lat],
      zoom: 14,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    const el = document.createElement("div");
    el.innerHTML = `
      <svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))">
        <path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 27 17 27s17-14.25 17-27C34 7.6 26.4 0 17 0z" fill="var(--color-primary)" />
        <circle cx="17" cy="17" r="11" fill="white" opacity="0.14" />
        <g transform="translate(9.5,9.5)" stroke="white" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 5.5 L2 4 Q2 2 4 2 L11 2 Q13 2 13 4 L13 5.5" />
          <rect x="1" y="5.5" width="13" height="7.5" rx="1" />
          <rect x="6" y="8.5" width="3" height="4.5" />
        </g>
      </svg>`;
    el.style.width = "34px";
    el.style.height = "44px";
    new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);

    return () => map.remove();
  }, [lat, lng]);

  if (!mapboxgl.accessToken) return null;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Map showing ${name}'s location`}
      className="h-40 w-full overflow-hidden rounded-2xl"
    />
  );
}
