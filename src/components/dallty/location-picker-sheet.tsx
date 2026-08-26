import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2, MapPin, Navigation, Search } from "lucide-react";

import { provincesFor, citiesFor, type Province } from "@/lib/arab-cities";
import type { useUserLocation } from "@/hooks/use-user-location";
import { useLocale } from "@/lib/i18n";

export type LocationSelection =
  | { kind: "current" }
  | { kind: "place"; wilaya: string; wilayaAr: string; commune: string; communeAr: string };

/**
 * Full-screen location flow (main choice → Wilaya list → Commune list), mirroring the
 * Fresha reference's structure. Wilaya/commune data is Dallty's own real Algeria
 * administrative dataset (`arab-cities.ts`, all 58 wilayas) — not invented placeholders.
 */
export function LocationPickerSheet({
  open,
  geo,
  onClose,
  onSelect,
}: {
  open: boolean;
  geo: ReturnType<typeof useUserLocation>;
  onClose: () => void;
  onSelect: (selection: LocationSelection) => void;
}) {
  const { lang } = useLocale();
  const [view, setView] = useState<"main" | "wilaya" | "commune">("main");
  const [wilayaQuery, setWilayaQuery] = useState("");
  const [selectedWilaya, setSelectedWilaya] = useState<Province | null>(null);
  const [requesting, setRequesting] = useState(false);

  const wilayas = useMemo(
    () => [...provincesFor("DZ")].sort((a, b) => a.en.localeCompare(b.en)),
    [],
  );
  const filteredWilayas = useMemo(() => {
    const q = wilayaQuery.trim().toLowerCase();
    if (!q) return wilayas;
    return wilayas.filter(
      (w) => w.en.toLowerCase().includes(q) || w.ar.includes(wilayaQuery.trim()),
    );
  }, [wilayas, wilayaQuery]);

  const communes = useMemo(
    () => (selectedWilaya ? citiesFor("DZ", selectedWilaya.en) : []),
    [selectedWilaya],
  );

  function reset() {
    setView("main");
    setWilayaQuery("");
    setSelectedWilaya(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function useCurrentLocation() {
    setRequesting(true);
    try {
      const coords = await geo.request();
      if (coords) {
        onSelect({ kind: "current" });
        close();
      }
    } finally {
      setRequesting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-(--z-overlay) flex flex-col bg-cream text-cream-foreground"
      role="dialog"
      aria-modal
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 pb-3"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={() =>
            view === "main" ? close() : view === "commune" ? setView("wilaya") : setView("main")
          }
          aria-label="Back"
          className="press grid size-10 shrink-0 place-items-center rounded-full bg-muted/60"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-h3 truncate">
          {view === "main" ? "Location" : view === "wilaya" ? "Select wilaya" : "Select commune"}
        </h1>
      </header>

      {view === "main" && (
        <div className="flex-1 overflow-y-auto p-4">
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={requesting}
            className="press flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-start disabled:opacity-60"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              {requesting ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Navigation className="size-5" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Use my current location</span>
              <span className="block text-sm text-muted-foreground">
                Recommended for nearby results
              </span>
            </span>
          </button>

          {geo.status === "denied" && (
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              Location is blocked in your browser settings.
            </p>
          )}

          <button
            type="button"
            onClick={() => setView("wilaya")}
            className="press mt-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-start"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-foreground">
              <MapPin className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">Choose your wilaya</span>
              <span className="block text-sm text-muted-foreground">
                Pick a wilaya, then a commune
              </span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" />
          </button>
        </div>
      )}

      {view === "wilaya" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="shrink-0 p-4 pb-2">
            <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4">
              <Search className="size-4.5 shrink-0 text-muted-foreground" />
              <input
                value={wilayaQuery}
                onChange={(e) => setWilayaQuery(e.target.value)}
                placeholder="Search wilaya"
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto px-2 pb-4">
            {filteredWilayas.map((w) => (
              <li key={w.en}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWilaya(w);
                    setView("commune");
                  }}
                  className="press flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3.5 text-start hover:bg-muted/60"
                >
                  <span className="font-semibold">{lang === "ar" ? w.ar : w.en}</span>
                  <ChevronRight className="size-4.5 shrink-0 text-muted-foreground rtl:rotate-180" />
                </button>
              </li>
            ))}
            {filteredWilayas.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No wilaya matches.</p>
            )}
          </ul>
        </div>
      )}

      {view === "commune" && selectedWilaya && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <p className="shrink-0 px-4 pb-2 text-sm font-semibold text-muted-foreground">
            Wilaya: {lang === "ar" ? selectedWilaya.ar : selectedWilaya.en}
          </p>
          <ul className="flex-1 overflow-y-auto px-2 pb-4">
            {communes.map((c) => (
              <li key={c.en}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect({
                      kind: "place",
                      wilaya: selectedWilaya.en,
                      wilayaAr: selectedWilaya.ar,
                      commune: c.en,
                      communeAr: c.ar,
                    });
                    close();
                  }}
                  className="press flex w-full items-center rounded-2xl px-3 py-3.5 text-start font-semibold hover:bg-muted/60"
                >
                  {lang === "ar" ? c.ar : c.en}
                </button>
              </li>
            ))}
            {communes.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No communes listed for this wilaya.
              </p>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
