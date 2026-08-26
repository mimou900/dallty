import type { ReactNode } from "react";
import { CalendarDays, MapPin, Search, X } from "lucide-react";

function FieldButton({
  icon,
  placeholder,
  value,
  onOpen,
  onClear,
  divider,
}: {
  icon: ReactNode;
  placeholder: string;
  value: string | null;
  onOpen: () => void;
  onClear: () => void;
  /** Vertical hairline on the trailing edge — desktop unified-pill layout only. */
  divider?: boolean;
}) {
  return (
    <div
      className={`relative min-h-14 flex-1 md:min-h-0 md:border-e md:pe-1 ${
        divider ? "md:border-border" : "md:border-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full items-center gap-3 rounded-2xl bg-cream px-4 text-start md:rounded-none md:bg-transparent md:py-3.5"
      >
        <span className="shrink-0 text-primary">{icon}</span>
        <span
          className={`min-w-0 flex-1 truncate ${value ? "font-semibold text-foreground" : "text-muted-foreground"}`}
        >
          {value ?? placeholder}
        </span>
      </button>
      {value && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label={`Clear ${placeholder}`}
          className="press absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full bg-white shadow-elevation-low"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function HomeSearchBar({
  serviceLabel,
  locationLabel,
  dateTimeLabel,
  onOpenService,
  onOpenLocation,
  onOpenDateTime,
  onClearService,
  onClearLocation,
  onClearDateTime,
  onSearch,
}: {
  serviceLabel: string | null;
  locationLabel: string | null;
  dateTimeLabel: string | null;
  onOpenService: () => void;
  onOpenLocation: () => void;
  onOpenDateTime: () => void;
  onClearService: () => void;
  onClearLocation: () => void;
  onClearDateTime: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="relative z-10 mx-auto max-w-md rounded-4xl border border-border/40 bg-card/95 p-3 shadow-elevation-high md:max-w-4xl md:rounded-full md:p-2">
      <div className="flex flex-col gap-2.5 md:flex-row md:items-stretch md:gap-1">
        <FieldButton
          icon={<Search className="size-5" />}
          placeholder="Search by service or business"
          value={serviceLabel}
          onOpen={onOpenService}
          onClear={onClearService}
          divider
        />
        <FieldButton
          icon={<MapPin className="size-5" />}
          placeholder="Choose your location"
          value={locationLabel}
          onOpen={onOpenLocation}
          onClear={onClearLocation}
          divider
        />
        <FieldButton
          icon={<CalendarDays className="size-5" />}
          placeholder="Choose date and time"
          value={dateTimeLabel}
          onOpen={onOpenDateTime}
          onClear={onClearDateTime}
        />
        <button
          type="button"
          onClick={onSearch}
          className="press flex min-h-14 shrink-0 items-center justify-center gap-2 rounded-2xl bg-lime px-8 text-base font-bold text-lime-foreground shadow-lg md:min-h-0 md:rounded-full"
        >
          <Search className="size-5" />
          <span className="md:hidden">Search</span>
        </button>
      </div>
    </div>
  );
}
