import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Loader2, MapPin, Navigation, Search } from "lucide-react";

import { provincesFor, citiesFor, type Province } from "@/lib/arab-cities";
import type { useUserLocation } from "@/hooks/use-user-location";
import { useLocale } from "@/lib/i18n";

export type LocationSelection =
  | { kind: "current" }
  | { kind: "place"; wilaya: string; wilayaAr: string; commune: string; communeAr: string };

type Geo = ReturnType<typeof useUserLocation>;

/** Shared state machine (main choice → Wilaya list → Commune list) behind both the
 *  mobile full-screen flow and the desktop popover — real Algeria administrative
 *  data (`arab-cities.ts`, all 69 wilayas), not invented placeholders. */
function useLocationFlow(geo: Geo, onSelect: (s: LocationSelection) => void, onDone: () => void) {
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

  function finish() {
    reset();
    onDone();
  }

  async function useCurrentLocation() {
    setRequesting(true);
    try {
      const coords = await geo.request();
      if (coords) {
        onSelect({ kind: "current" });
        finish();
      }
    } finally {
      setRequesting(false);
    }
  }

  function selectCommune(c: { en: string; ar: string }) {
    if (!selectedWilaya) return;
    onSelect({
      kind: "place",
      wilaya: selectedWilaya.en,
      wilayaAr: selectedWilaya.ar,
      commune: c.en,
      communeAr: c.ar,
    });
    finish();
  }

  return {
    view,
    setView,
    wilayaQuery,
    setWilayaQuery,
    filteredWilayas,
    selectedWilaya,
    setSelectedWilaya,
    communes,
    requesting,
    useCurrentLocation,
    selectCommune,
    finish,
  };
}

type Flow = ReturnType<typeof useLocationFlow>;

function MainView({ flow, geo }: { flow: Flow; geo: Geo }) {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <button
        type="button"
        onClick={flow.useCurrentLocation}
        disabled={flow.requesting}
        className="press flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-start disabled:opacity-60"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          {flow.requesting ? (
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
        onClick={() => flow.setView("wilaya")}
        className="press mt-3 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-start"
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-foreground">
          <MapPin className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Choose your wilaya</span>
          <span className="block text-sm text-muted-foreground">Pick a wilaya, then a commune</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground rtl:rotate-180" />
      </button>
    </div>
  );
}

function WilayaView({ flow, lang, autoFocus }: { flow: Flow; lang: string; autoFocus?: boolean }) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="shrink-0 p-4 pb-2">
        <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4">
          <Search className="size-4.5 shrink-0 text-muted-foreground" />
          <input
            value={flow.wilayaQuery}
            onChange={(e) => flow.setWilayaQuery(e.target.value)}
            placeholder="Search wilaya"
            autoFocus={autoFocus}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {flow.filteredWilayas.map((w) => (
          <li key={w.en}>
            <button
              type="button"
              onClick={() => {
                flow.setSelectedWilaya(w);
                flow.setView("commune");
              }}
              className="press flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-3.5 text-start hover:bg-muted/60"
            >
              <span className="font-semibold">{lang === "ar" ? w.ar : w.en}</span>
              <ChevronRight className="size-4.5 shrink-0 text-muted-foreground rtl:rotate-180" />
            </button>
          </li>
        ))}
        {flow.filteredWilayas.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">No wilaya matches.</p>
        )}
      </ul>
    </div>
  );
}

function CommuneView({ flow, lang }: { flow: Flow; lang: string }) {
  if (!flow.selectedWilaya) return null;
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <p className="shrink-0 px-4 pb-2 text-sm font-semibold text-muted-foreground">
        Wilaya: {lang === "ar" ? flow.selectedWilaya.ar : flow.selectedWilaya.en}
      </p>
      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {flow.communes.map((c) => (
          <li key={c.en}>
            <button
              type="button"
              onClick={() => flow.selectCommune(c)}
              className="press flex w-full items-center rounded-2xl px-3 py-3.5 text-start font-semibold hover:bg-muted/60"
            >
              {lang === "ar" ? c.ar : c.en}
            </button>
          </li>
        ))}
        {flow.communes.length === 0 && (
          <p className="p-4 text-center text-sm text-muted-foreground">
            No communes listed for this wilaya.
          </p>
        )}
      </ul>
    </div>
  );
}

/** Mobile/tablet — full-screen takeover with back arrow + title. */
export function LocationPickerSheet({
  open,
  geo,
  onClose,
  onSelect,
}: {
  open: boolean;
  geo: Geo;
  onClose: () => void;
  onSelect: (selection: LocationSelection) => void;
}) {
  const flow = useLocationFlow(geo, onSelect, onClose);
  const { lang } = useLocale();

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
            flow.view === "main"
              ? flow.finish()
              : flow.view === "commune"
                ? flow.setView("wilaya")
                : flow.setView("main")
          }
          aria-label="Back"
          className="press grid size-10 shrink-0 place-items-center rounded-full bg-muted/60"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-h3 truncate">
          {flow.view === "main"
            ? "Location"
            : flow.view === "wilaya"
              ? "Select wilaya"
              : "Select commune"}
        </h1>
      </header>

      {flow.view === "main" && <MainView flow={flow} geo={geo} />}
      {flow.view === "wilaya" && <WilayaView flow={flow} lang={lang} autoFocus />}
      {flow.view === "commune" && <CommuneView flow={flow} lang={lang} />}
    </div>
  );
}

/** Desktop — compact panel meant to sit inside a Popover anchored to the Location
 *  field, not a phone-sized screen. Keeps the same progressive main → wilaya →
 *  commune disclosure, with an inline back control instead of a full-screen header. */
export function LocationPickerPanel({
  geo,
  onSelect,
  onDone,
}: {
  geo: Geo;
  onSelect: (selection: LocationSelection) => void;
  onDone: () => void;
}) {
  const flow = useLocationFlow(geo, onSelect, onDone);
  const { lang } = useLocale();

  return (
    <div className="flex max-h-[28rem] w-[22rem] flex-col overflow-hidden rounded-3xl">
      {flow.view !== "main" && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2.5">
          <button
            type="button"
            onClick={() =>
              flow.view === "commune" ? flow.setView("wilaya") : flow.setView("main")
            }
            aria-label="Back"
            className="press grid size-8 shrink-0 place-items-center rounded-full bg-muted/60"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" />
          </button>
          <p className="text-sm font-bold">
            {flow.view === "wilaya" ? "Select wilaya" : "Select commune"}
          </p>
        </div>
      )}
      {flow.view === "main" && <MainView flow={flow} geo={geo} />}
      {flow.view === "wilaya" && <WilayaView flow={flow} lang={lang} />}
      {flow.view === "commune" && <CommuneView flow={flow} lang={lang} />}
    </div>
  );
}
