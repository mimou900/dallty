import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, MapPin as MapPinIcon, Star, X } from "lucide-react";

import type { Lang } from "@/lib/dallty-content";
import { FavoriteButton } from "@/components/dallty/favorite-button";
import { useTranslation } from "@/lib/i18n/hooks";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

export type MapPin = {
  id: string;
  slug: string;
  lat: number | null;
  lng: number | null;
  en: { name: string; area: string };
  ar: { name: string; area: string };
  image: string;
  rating: number;
  reviews: number;
  category?: string;
  verified?: boolean;
  distanceKm: number | null;
};

/** Dallty-branded pin — deep-green teardrop with a small storefront glyph,
 *  not Mapbox's default marker or a plain dot. `var(--color-primary)` etc.
 *  resolve correctly since the element is a real, attached DOM node (part
 *  of the live page's cascade), not a detached image. */
function pinMarkup(selected: boolean) {
  const scale = selected ? 1.15 : 1;
  return `
    <svg width="${34 * scale}" height="${44 * scale}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))">
      <path d="M17 0C7.6 0 0 7.6 0 17c0 12.75 17 27 17 27s17-14.25 17-27C34 7.6 26.4 0 17 0z"
            fill="${selected ? "var(--color-lime)" : "var(--color-primary)"}" />
      <circle cx="17" cy="17" r="11" fill="${selected ? "var(--color-primary)" : "white"}" opacity="${selected ? 1 : 0.14}" />
      <g transform="translate(9.5,9.5)" stroke="${selected ? "var(--color-lime)" : "white"}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 5.5 L2 4 Q2 2 4 2 L11 2 Q13 2 13 4 L13 5.5" />
        <rect x="1" y="5.5" width="13" height="7.5" rx="1" />
        <rect x="6" y="8.5" width="3" height="4.5" />
      </g>
    </svg>`;
}

function formatDistance(km: number, t: (key: "km") => string) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} ${t("km")}`;
}

/**
 * Search redesign §21 — a separate interaction from the results list, never
 * blocking it: dynamically `import()`ed by `search.tsx` only once "Afficher
 * la carte" is first opened, so Mapbox's JS/CSS never load on the default
 * list view. Markers are the current real, already-filtered result set.
 *
 * Clicking a pin doesn't navigate immediately — it opens a compact preview
 * card (photo, name, distance, area, category) anchored to the bottom of
 * the map, same interaction shape as the reference; the card itself is the
 * link to the business profile. `userLocation`, when the visitor has
 * granted it, gets its own small dot marker.
 */
export function ResultsMap({
  businesses,
  lang,
  userLocation,
}: {
  businesses: MapPin[];
  lang: Lang;
  userLocation?: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { t } = useTranslation("marketplace");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      // Algiers — the only marketplace-enabled country today (confirmed
      // during planning); re-centers immediately below once real pins exist.
      center: [3.05, 36.75],
      zoom: 11,
      // The map sits inside a normally-scrolling page, not a full-viewport
      // takeover — Mapbox's own built-in fix for exactly this: plain
      // mouse-wheel/one-finger-touch keeps scrolling the page (a small
      // "use ctrl + scroll to zoom" hint shows instead of the cursor
      // getting trapped zooming the map), Ctrl+scroll or two-finger touch
      // still zooms/pans it, and the +/- buttons (added below) always work.
      cooperativeGestures: true,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Rebuild markers when the result set changes; re-style in place (no
  // rebuild) when only the selection changes, so clicking a pin doesn't
  // flicker every marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = new Map();

    const located = businesses.filter(
      (b): b is MapPin & { lat: number; lng: number } => b.lat != null && b.lng != null,
    );
    for (const b of located) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", lang === "ar" ? b.ar.name : b.en.name);
      el.style.cssText = "background:none;border:none;padding:0;cursor:pointer;line-height:0;";
      el.innerHTML = pinMarkup(false);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedId(b.id);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([b.lng, b.lat])
        .addTo(map);
      markersRef.current.set(b.id, marker);
    }

    if (located.length > 0 && !userLocation) {
      const bounds = new mapboxgl.LngLatBounds();
      located.forEach((b) => bounds.extend([b.lng, b.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businesses, lang]);

  // Restyle just the selected/unselected pins in place.
  useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      marker.getElement().innerHTML = pinMarkup(id === selectedId);
    }
  }, [selectedId]);

  // Real "current location" dot — separate from business pins, updates
  // without touching them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;
    if (!userLocation) return;
    const el = document.createElement("div");
    el.style.cssText =
      "width:16px;height:16px;border-radius:9999px;background:#4285f4;" +
      "border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);";
    userMarkerRef.current = new mapboxgl.Marker({ element: el })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(map);

    const located = businesses.filter(
      (b): b is MapPin & { lat: number; lng: number } => b.lat != null && b.lng != null,
    );
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([userLocation.lng, userLocation.lat]);
    located.forEach((b) => bounds.extend([b.lng, b.lat]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation]);

  const selected = businesses.find((b) => b.id === selectedId) ?? null;
  const s = selected ? (lang === "ar" ? selected.ar : selected.en) : null;

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" />

      {selected && s && (
        <div className="absolute inset-x-3 bottom-3 z-10">
          <div className="relative overflow-hidden rounded-3xl bg-card shadow-xl">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label={t("close_aria")}
              className="press absolute end-3 top-3 z-10 grid size-8 place-items-center rounded-full bg-white/90 text-foreground shadow-sm"
            >
              <X className="size-4" />
            </button>
            <Link
              to="/business/$businessSlug"
              params={{ businessSlug: selected.slug }}
              className="flex items-stretch gap-3"
            >
              <img
                src={selected.image}
                alt={s.name}
                loading="lazy"
                className="size-28 shrink-0 object-cover"
              />
              <div className="min-w-0 flex-1 py-3 pe-3">
                <h2 className="flex items-center gap-1 truncate text-sm font-bold">
                  <span className="truncate">{s.name}</span>
                  {selected.verified && <BadgeCheck className="size-3.5 shrink-0 text-primary" />}
                </h2>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="size-3 shrink-0 fill-gold text-gold" />
                  <span className="font-semibold text-foreground">{selected.rating.toFixed(1)}</span>
                  <span>({selected.reviews})</span>
                </p>
                <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <MapPinIcon className="size-3 shrink-0" />
                  <span className="truncate">
                    {selected.distanceKm != null ? `${formatDistance(selected.distanceKm, t)} · ` : ""}
                    {s.area}
                  </span>
                </p>
                {selected.category && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{selected.category}</p>
                )}
              </div>
            </Link>
            <FavoriteButton
              kind="business"
              targetId={selected.id}
              label={s.name}
              className="absolute start-3 top-3 !size-8"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ResultsMap;
