import type { ReactNode } from "react";
import { CalendarDays, MapPin, Search, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Present only on desktop — wraps the field trigger in an anchored Popover instead
 *  of opening the mobile full-screen flow. */
type FieldPopover = { open: boolean; onOpenChange: (open: boolean) => void; panel: ReactNode };

function FieldRow({
  icon,
  placeholder,
  value,
  onOpen,
  onClear,
  divider,
  grow,
  popover,
}: {
  icon: ReactNode;
  placeholder: string;
  value: string | null;
  onOpen: () => void;
  onClear: () => void;
  /** Vertical hairline on the trailing edge — desktop unified-bar layout only. */
  divider?: boolean;
  /** Relative desktop width share (Service reads widest, Search stays compact). */
  grow?: number;
  popover?: FieldPopover;
}) {
  const trigger = (
    <button
      type="button"
      onClick={popover ? undefined : onOpen}
      className="flex min-w-0 flex-1 items-center gap-2.5 px-3.5 text-start"
    >
      <span className="shrink-0 text-primary">{icon}</span>
      <span
        className={`min-w-0 flex-1 truncate text-[0.95rem] ${
          value ? "font-semibold text-foreground" : "text-muted-foreground"
        }`}
      >
        {value ?? placeholder}
      </span>
    </button>
  );

  return (
    <div
      className={`flex min-h-12 flex-1 items-center rounded-[16px] bg-cream/70 md:min-h-0 md:rounded-none md:bg-transparent md:py-2.5 ${
        divider ? "md:border-e md:border-border" : ""
      }`}
      style={grow ? { flexGrow: grow } : undefined}
    >
      {popover ? (
        <Popover open={popover.open} onOpenChange={popover.onOpenChange}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={12}
            className="w-auto rounded-3xl border-border/40 bg-card p-0 shadow-elevation-high"
          >
            {popover.panel}
          </PopoverContent>
        </Popover>
      ) : (
        trigger
      )}
      {value && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          aria-label={`Clear ${placeholder}`}
          className="grid size-8 shrink-0 place-items-center text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

export function HomeSearchBar({
  serviceLabel,
  locationLabel,
  dateTimeLabel,
  resultCount,
  onOpenService,
  onOpenLocation,
  onOpenDateTime,
  onClearService,
  onClearLocation,
  onClearDateTime,
  onClearAll,
  onSearch,
  servicePopover,
  locationPopover,
  dateTimePopover,
}: {
  serviceLabel: string | null;
  locationLabel: string | null;
  dateTimeLabel: string | null;
  /** Shown once at least one field is set — omit/undefined hides the summary row entirely. */
  resultCount?: number;
  onOpenService: () => void;
  onOpenLocation: () => void;
  onOpenDateTime: () => void;
  onClearService: () => void;
  onClearLocation: () => void;
  onClearDateTime: () => void;
  onClearAll: () => void;
  onSearch: () => void;
  /** Desktop only — when set, the field opens an anchored popover instead of the
   *  mobile full-screen flow (onOpenService/etc. above are simply unused then). */
  servicePopover?: FieldPopover;
  locationPopover?: FieldPopover;
  dateTimePopover?: FieldPopover;
}) {
  const hasSelection = Boolean(serviceLabel || locationLabel || dateTimeLabel);

  return (
    <div className="relative z-10 mx-auto max-w-md rounded-[28px] border border-border/30 bg-card/95 p-4 shadow-elevation-high md:max-w-4xl md:rounded-full md:p-2.5 lg:max-w-5xl">
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-1">
        <FieldRow
          icon={<Search className="size-[18px]" />}
          placeholder="Search by service or business"
          value={serviceLabel}
          onOpen={onOpenService}
          onClear={onClearService}
          divider
          grow={4}
          popover={servicePopover}
        />
        <FieldRow
          icon={<MapPin className="size-[18px]" />}
          placeholder="Choose your location"
          value={locationLabel}
          onOpen={onOpenLocation}
          onClear={onClearLocation}
          divider
          grow={3}
          popover={locationPopover}
        />
        <FieldRow
          icon={<CalendarDays className="size-[18px]" />}
          placeholder="Choose date and time"
          value={dateTimeLabel}
          onOpen={onOpenDateTime}
          onClear={onClearDateTime}
          grow={3}
          popover={dateTimePopover}
        />
        <button
          type="button"
          onClick={onSearch}
          className="press flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-lime px-8 text-[0.95rem] font-bold text-lime-foreground md:min-h-0 md:self-stretch md:px-7"
        >
          <Search className="size-[18px]" />
          <span>Search</span>
        </button>
      </div>

      {hasSelection && resultCount !== undefined && (
        <div className="mt-2.5 flex items-center justify-between px-1">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
            {resultCount} shops match
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
