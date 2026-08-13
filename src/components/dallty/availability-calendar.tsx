import { useMemo } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { Loader2 } from "lucide-react";

export type DayStatus = "open" | "limited" | "full" | "closed" | "timeoff";

export type DayAvailability = {
  day: string;
  total_slots: number;
  open_slots: number;
  status: DayStatus;
};

const STATUS_LABEL: Record<DayStatus, string> = {
  open: "Available",
  limited: "Limited availability",
  full: "Fully booked",
  closed: "Closed / not working",
  timeoff: "Holiday / day off",
};

const STATUS_HINT: Record<DayStatus, string> = {
  open: "Slots available — pick this day",
  limited: "Only a few slots left",
  full: "Fully booked — join the waitlist",
  closed: "No working hours on this day",
  timeoff: "Specialist is off on this day",
};

const DOT: Record<DayStatus, string> = {
  open: "bg-emerald-500",
  limited: "bg-amber-400",
  full: "bg-rose-500",
  closed: "bg-muted-foreground/40",
  timeoff: "bg-muted-foreground/40",
};

/**
 * Two-week availability calendar. Every date carries a visible status so the
 * customer knows what is bookable before tapping anything.
 */
export function AvailabilityCalendar({
  days = 14,
  data,
  loading,
  value,
  onSelect,
  ready,
}: {
  days?: number;
  data: DayAvailability[];
  loading: boolean;
  value: string;
  onSelect: (day: string) => void;
  /** False while service/specialist are still missing. */
  ready: boolean;
}) {
  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(new Date(), i)),
    [days],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, DayAvailability>();
    for (const row of data) map.set(row.day, row);
    return map;
  }, [data]);

  const selected = byDay.get(value);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-muted-foreground">
        {(["open", "limited", "full", "closed"] as DayStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${DOT[s]}`} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        {loading && ready && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" /> Checking availability…
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-5">
        {dates.map((d) => {
          const key = format(d, "yyyy-MM-dd");
          const info = byDay.get(key);
          const status: DayStatus = info?.status ?? "open";
          const known = ready && !loading && Boolean(info);
          const disabled = known && status !== "open" && status !== "limited";
          const active = key === value;
          const today = isSameDay(d, new Date());
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              title={known ? STATUS_HINT[status] : undefined}
              aria-label={`${format(d, "EEEE d MMMM")}${known ? ` — ${STATUS_LABEL[status]}` : ""}`}
              aria-pressed={active}
              onClick={() => onSelect(key)}
              className={`press relative rounded-3xl px-2 py-3.5 text-center transition-colors ${
                active ? "bg-primary text-primary-foreground" : "glass"
              } ${disabled ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <span className="block text-[11px] font-semibold uppercase opacity-80">
                {today ? "Today" : format(d, "EEE")}
              </span>
              <span className="mt-0.5 block text-xl font-extrabold">{format(d, "d")}</span>
              <span className="block text-[11px] opacity-80">{format(d, "MMM")}</span>
              <span className="mt-1.5 flex h-3 items-center justify-center">
                {known ? (
                  <span
                    className={`size-2.5 rounded-full ${
                      active ? "bg-primary-foreground" : DOT[status]
                    }`}
                  />
                ) : (
                  <span className="size-2.5 animate-pulse rounded-full bg-muted-foreground/25" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {ready && !loading && selected && (
        <p
          className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
            selected.status === "open" || selected.status === "limited"
              ? "bg-primary/10 text-primary"
              : "bg-gold/15 text-foreground"
          }`}
        >
          {format(new Date(`${selected.day}T00:00:00`), "EEEE d MMMM")} ·{" "}
          {selected.status === "open" || selected.status === "limited"
            ? `${selected.open_slots} slot${selected.open_slots === 1 ? "" : "s"} available`
            : STATUS_HINT[selected.status]}
        </p>
      )}
    </div>
  );
}
