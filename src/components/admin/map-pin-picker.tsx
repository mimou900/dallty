import { useEffect, useRef, useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";

import { loadMaps } from "@/lib/maps-loader";

export type LatLng = { lat: number; lng: number };

/**
 * Interactive Google map with a draggable pin. Dragging the pin (or clicking
 * the map) reports the new coordinates so the owner can fine-tune the exact
 * shop entrance, not just the street address Places returned.
 */
export function MapPinPicker({
  value,
  onChange,
  height = 260,
}: {
  value: LatLng | null;
  onChange: (next: LatLng) => void;
  height?: number;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadMaps();
        if (cancelled || !boxRef.current) return;
        const { Map } = await window.google.maps.importLibrary("maps");
        const center = value ?? { lat: 24.7136, lng: 46.6753 };
        const map = new Map(boxRef.current, {
          center,
          zoom: value ? 16 : 5,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });
        const marker = new window.google.maps.Marker({
          map,
          position: center,
          draggable: true,
        });
        marker.addListener("dragend", () => {
          const p = marker.getPosition();
          if (p) changeRef.current({ lat: p.lat(), lng: p.lng() });
        });
        map.addListener("click", (e: any) => {
          if (!e.latLng) return;
          marker.setPosition(e.latLng);
          changeRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        });
        mapRef.current = map;
        markerRef.current = marker;
        setReady(true);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync when the address field updates the coordinates.
  useEffect(() => {
    if (!ready || !value || !markerRef.current) return;
    const current = markerRef.current.getPosition();
    if (current && Math.abs(current.lat() - value.lat) < 1e-6 && Math.abs(current.lng() - value.lng) < 1e-6) {
      return;
    }
    markerRef.current.setPosition(value);
    mapRef.current?.panTo(value);
    mapRef.current?.setZoom(Math.max(mapRef.current.getZoom() ?? 5, 16));
  }, [ready, value?.lat, value?.lng]);

  if (failed) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        The map is unavailable right now. You can still enter latitude and longitude manually.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70">
      <div ref={boxRef} style={{ height }} className="w-full bg-secondary" />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center bg-secondary/70">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      <p className="flex items-center gap-1.5 border-t border-border/70 bg-card px-3 py-2 text-xs font-medium text-muted-foreground">
        <Crosshair className="size-3.5 shrink-0" />
        Drag the pin or tap the map to set the exact location.
      </p>
    </div>
  );
}
