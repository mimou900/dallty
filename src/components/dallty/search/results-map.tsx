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
    <svg width="${34 * scale}" height="${44 * scale}" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 2px 4px rgba(0,0,0,.3))">
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

/** Clean Dallty-green cluster bubble with a white count — same family as
 *  the individual pin (deep green, white glyph), just a plain circle since
 *  a cluster doesn't point at one exact spot the way a single business does. */
function clusterMarkup(count: number) {
  const size = count >= 10 ? 40 : 34;
  return `
    <div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      background:var(--color-primary);color:white;
      display:flex;align-items:center;justify-content:center;
      font:700 ${count >= 10 ? 13 : 12}px system-ui,sans-serif;
      border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,.3);
    ">${count}</div>`;
}

function formatDistance(km: number, t: (key: "km") => string) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} ${t("km")}`;
}

type Located = MapPin & { lat: number; lng: number };

/** Greedy pixel-distance clustering at the current zoom — points whose
 *  projected screen positions land within `threshold` px of each other
 *  become one cluster bubble; everything else stays its own pin. Re-runs
 *  on `moveend` (pan settled or zoom settled), so panning/zooming in
 *  regroups exactly the way the brief describes ("cluster → individual
 *  pins as the user zooms in") without needing a GeoJSON/supercluster
 *  source — the existing per-business `Marker` + custom SVG pin approach
 *  (proven, keeps click → preview-card working) stays intact. */
function clusterPins(map: mapboxgl.Map, pins: Located[], threshold = 42) {
  const points = pins.map((pin) => ({ pin, screen: map.project([pin.lng, pin.lat]) }));
  const used = new Set<number>();
  const groups: { pin: Located; screen: mapboxgl.Point }[][] = [];
  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const group = [points[i]];
    used.add(i);
    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      const dx = points[i].screen.x - points[j].screen.x;
      const dy = points[i].screen.y - points[j].screen.y;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) {
        group.push(points[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }
  return groups;
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
 * link to the business profile. Businesses sitting close together at the
 * current zoom collapse into a single Dallty-green cluster bubble
 * (clicking it zooms in); `userLocation`, when the visitor has granted it,
 * gets its own small dot marker, unaffected by clustering.
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
  const markersRef = useRef<mapboxgl.Marker[]>([]);
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
      // Mapbox's ToS requires its logo/attribution to stay visible and
      // unaltered — never fully removed. Both default to bottom-left,
      // which now sits directly under the floating BottomNav on mobile
      // (the map is a fixed full-viewport layer, see below). Kept at
      // bottom-left (still Mapbox's own required corner) but nudged up
      // clear of the nav via the scoped CSS below — same safe-area-aware
      // offset already used for the pin-preview card.
      attributionControl: false,
    });
    mapRef.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Rebuilds the marker set — either from a new result list, a changed
  // selection, or the map settling after a pan/zoom (re-clustering).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const located = businesses.filter(
      (b): b is Located => b.lat != null && b.lng != null,
    );

    function render() {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      for (const group of clusterPins(map!, located)) {
        if (group.length === 1) {
          const b = group[0].pin;
          const el = document.createElement("button");
          el.type = "button";
          el.setAttribute("aria-label", lang === "ar" ? b.ar.name : b.en.name);
          el.style.cssText = "background:none;border:none;padding:0;cursor:pointer;line-height:0;";
          el.innerHTML = pinMarkup(b.id === selectedId);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            setSelectedId(b.id);
          });
          markersRef.current.push(
            new mapboxgl.Marker({ element: el, anchor: "bottom" }).setLngLat([b.lng, b.lat]).addTo(map!),
          );
        } else {
          const avgLng = group.reduce((sum, g) => sum + g.pin.lng, 0) / group.length;
          const avgLat = group.reduce((sum, g) => sum + g.pin.lat, 0) / group.length;
          const el = document.createElement("button");
          el.type = "button";
          el.setAttribute("aria-label", `${group.length}`);
          el.style.cssText = "background:none;border:none;padding:0;cursor:pointer;line-height:0;";
          el.innerHTML = clusterMarkup(group.length);
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            map!.easeTo({ center: [avgLng, avgLat], zoom: Math.min(map!.getZoom() + 2.5, 16) });
          });
          markersRef.current.push(
            new mapboxgl.Marker({ element: el, anchor: "center" }).setLngLat([avgLng, avgLat]).addTo(map!),
          );
        }
      }
    }

    if (map.loaded()) render();
    else map.once("load", render);
    map.on("moveend", render);
    return () => {
      map.off("moveend", render);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businesses, lang, selectedId]);

  // Fit bounds once when a fresh result set (or the visitor's own location)
  // arrives — separate from the clustering re-render above, which must NOT
  // re-fit on every pan/zoom or the map would fight the visitor's own
  // navigation.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const located = businesses.filter((b): b is Located => b.lat != null && b.lng != null);
    if (located.length === 0 && !userLocation) return;
    const bounds = new mapboxgl.LngLatBounds();
    if (userLocation) bounds.extend([userLocation.lng, userLocation.lat]);
    located.forEach((b) => bounds.extend([b.lng, b.lat]));
    const fit = () => map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 0 });
    if (map.loaded()) fit();
    else map.once("load", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businesses, userLocation]);

  // Real "current location" dot — separate from business pins/clusters,
  // updates without touching them.
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
  }, [userLocation]);

  const selected = businesses.find((b) => b.id === selectedId) ?? null;
  const s = selected ? (lang === "ar" ? selected.ar : selected.en) : null;

  return (
    <div className="relative size-full">
      {/* Nudges Mapbox's own required logo/attribution control (bottom-left,
          can't be removed per Mapbox's ToS) up clear of the floating
          BottomNav on mobile, without touching the nav itself. Desktop's
          BottomNav is hidden, so no offset needed there. */}
      <style>{`
        @media (max-width: 767px) {
          .mapboxgl-ctrl-bottom-left {
            bottom: calc(5.5rem + env(safe-area-inset-bottom)) !important;
          }
        }
      `}</style>
      <div ref={containerRef} className="size-full" />

      {/* The map is a fixed full-viewport layer now (not a bounded box), so
          this card's `bottom` offset is relative to the real viewport edge —
          needs extra clearance on mobile to clear the floating BottomNav
          (hidden from `md` up, where `bottom-3` is correct). */}
      {selected && s && (
        <div className="absolute inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 md:bottom-3">
          <div className="relative overflow-hidden rounded-3xl bg-card shadow-elevation-medium">
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
