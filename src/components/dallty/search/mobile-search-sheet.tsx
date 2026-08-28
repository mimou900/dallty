import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Clock3, MapPin, Search } from "lucide-react";

import { ServiceSearchSheet, type ServiceSelection } from "@/components/dallty/service-search-sheet";
import { LocationPickerSheet, type LocationSelection } from "@/components/dallty/location-picker-sheet";
import { DateTimePickerSheet, type DateTimeSelection } from "@/components/dallty/datetime-picker-sheet";
import { useUserLocation } from "@/hooks/use-user-location";
import { useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";

const RECENTS_KEY = "dallty.search.recents";
const MAX_RECENTS = 5;

function readRecents(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(term: string) {
  if (typeof window === "undefined" || !term.trim()) return;
  const next = [term, ...readRecents().filter((r) => r !== term)].slice(0, MAX_RECENTS);
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
}

function Field({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-start"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{value || label}</span>
      </span>
    </button>
  );
}

/**
 * Search redesign §3 — the mobile full-screen search entry point. Composes
 * the three sheets already built for the homepage (`ServiceSearchSheet`,
 * `LocationPickerSheet`, `DateTimePickerSheet`) as field triggers rather
 * than reinventing service/location/date pickers a third time, plus a real
 * localStorage-backed "Récentes" list.
 */
export function MobileSearchSheet({
  open,
  onClose,
  onSearch,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: (input: {
    service: ServiceSelection | null;
    location: LocationSelection | null;
    dateTime: DateTimeSelection | null;
  }) => void;
}) {
  const { t } = useTranslation("marketplace");
  const { lang } = useLocale();
  const geo = useUserLocation();
  const navigate = useNavigate();

  const [service, setService] = useState<ServiceSelection | null>(null);
  const [serviceQuery, setServiceQuery] = useState("");
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [dateTime, setDateTime] = useState<DateTimeSelection | null>(null);

  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    if (open) setRecents(readRecents());
  }, [open]);

  if (!open) return null;

  const serviceLabel =
    service?.kind === "category" ? service.label : service?.kind === "query" ? service.value : null;
  const locationLabel =
    location?.kind === "current"
      ? t("location_use_current_label")
      : location?.kind === "place"
        ? lang === "ar"
          ? location.wilayaAr
          : location.wilaya
        : null;
  const dateLabel = dateTime
    ? dateTime.date.toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" })
    : null;

  function submit() {
    if (serviceLabel) pushRecent(serviceLabel);
    onSearch({ service, location, dateTime });
  }

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
          onClick={onClose}
          aria-label={t("back_aria")}
          className="press grid size-10 shrink-0 place-items-center rounded-full bg-muted/60"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-h3 truncate">{t("mobile_search_title")}</h1>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <Field
          icon={<Search className="size-5" />}
          label={t("mobile_search_all_services")}
          value={serviceLabel}
          onClick={() => setServiceSheetOpen(true)}
        />
        <Field
          icon={<MapPin className="size-5" />}
          label={t("mobile_search_current_location")}
          value={locationLabel}
          onClick={() => setLocationSheetOpen(true)}
        />
        <Field
          icon={<Clock3 className="size-5" />}
          label={t("mobile_search_time")}
          value={dateLabel}
          onClick={() => setDateSheetOpen(true)}
        />

        {recents.length > 0 && (
          <div className="pt-2">
            <p className="px-1 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("mobile_search_recents")}
            </p>
            <ul>
              {recents.map((r) => (
                <li key={r}>
                  <button
                    type="button"
                    onClick={() => {
                      setService({ kind: "query", value: r });
                      setServiceQuery(r);
                    }}
                    className="press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start hover:bg-muted/60"
                  >
                    <Search className="size-4 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">{r}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div
        className="shrink-0 border-t border-border/60 p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={submit}
          className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-(image:--gradient-lime) text-sm font-bold text-lime-foreground"
        >
          <Search className="size-4.5" />
          {t("search_btn")}
        </button>
      </div>

      <ServiceSearchSheet
        open={serviceSheetOpen}
        onClose={() => setServiceSheetOpen(false)}
        query={serviceQuery}
        onQueryChange={setServiceQuery}
        onSelectCategory={(cat) => {
          setService({ kind: "category", value: cat.default_name, label: cat.translations[lang] ?? cat.default_name });
          setServiceSheetOpen(false);
        }}
        onSelectBusiness={(slug) => {
          setServiceSheetOpen(false);
          onClose();
          void navigate({ to: "/business/$businessSlug", params: { businessSlug: slug } });
        }}
        onSubmitQuery={(q) => {
          setService({ kind: "query", value: q });
          setServiceSheetOpen(false);
        }}
      />
      <LocationPickerSheet
        open={locationSheetOpen}
        geo={geo}
        onClose={() => setLocationSheetOpen(false)}
        onSelect={setLocation}
      />
      <DateTimePickerSheet
        open={dateSheetOpen}
        initial={dateTime}
        onClose={() => setDateSheetOpen(false)}
        onApply={setDateTime}
      />
    </div>
  );
}
