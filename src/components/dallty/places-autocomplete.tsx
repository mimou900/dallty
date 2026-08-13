import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { loadMaps } from "@/lib/maps-loader";

export type PlaceResult = {
  address: string;
  city: string;
  district: string;
  country: string;
  countryCode: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string;
};


function component(components: any[], type: string, short = false): string {
  const hit = components?.find((c) => (c.types ?? []).includes(type));
  if (!hit) return "";
  return (short ? hit.shortText : hit.longText) ?? hit.long_name ?? "";
}

/**
 * Full-address field backed by Places API (New). Selecting a suggestion fills
 * the address and silently captures coordinates, postal code and locality.
 */
export function PlacesAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing your address…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<{ id: string; text: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const sessionRef = useRef<any>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function search(input: string) {
    if (input.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      setBusy(true);
      await loadMaps();
      const { AutocompleteSuggestion, AutocompleteSessionToken } =
        await window.google.maps.importLibrary("places");
      sessionRef.current ??= new AutocompleteSessionToken();
      const { suggestions: found } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: input.trim().slice(0, 200),
        sessionToken: sessionRef.current,
      });
      setSuggestions(
        (found ?? [])
          .filter((s: any) => s.placePrediction)
          .slice(0, 6)
          .map((s: any) => ({
            id: s.placePrediction.placeId,
            text: s.placePrediction.text?.toString() ?? "",
          })),
      );
      setOpen(true);
    } catch {
      setUnavailable(true);
      setSuggestions([]);
    } finally {
      setBusy(false);
    }
  }

  async function choose(placeId: string, text: string) {
    onChange(text);
    setOpen(false);
    setSuggestions([]);
    try {
      setBusy(true);
      const { Place } = await window.google.maps.importLibrary("places");
      const place = new Place({ id: placeId });
      await place.fetchFields({
        fields: ["formattedAddress", "location", "addressComponents", "googleMapsURI"],
      });
      const comps = place.addressComponents ?? [];
      const city =
        component(comps, "locality") ||
        component(comps, "postal_town") ||
        component(comps, "administrative_area_level_2");
      onSelect({
        address: place.formattedAddress ?? text,
        city,
        district: component(comps, "administrative_area_level_1"),
        country: component(comps, "country"),
        countryCode: component(comps, "country", true),
        postalCode: component(comps, "postal_code"),
        latitude: place.location?.lat() ?? null,
        longitude: place.location?.lng() ?? null,
        mapsUrl: place.googleMapsURI ?? "",
      });
      sessionRef.current = null;
    } catch {
      setUnavailable(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={className}
          style={{ paddingInlineStart: "2.75rem" }}
          value={value}
          placeholder={placeholder}
          autoComplete="street-address"
          onChange={(e) => {
            onChange(e.target.value);
            if (timer.current) clearTimeout(timer.current);
            const next = e.target.value;
            timer.current = setTimeout(() => void search(next), 300);
          }}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {busy && (
          <Loader2 className="absolute end-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void choose(s.id, s.text)}
                className="flex w-full items-start gap-2 px-4 py-3 text-start text-sm font-medium hover:bg-secondary"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}

      {unavailable && (
        <p className="mt-1 text-xs text-muted-foreground">
          Address suggestions are unavailable right now — you can type the full address manually.
        </p>
      )}
    </div>
  );
}
