import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

export type Period = "morning" | "afternoon" | "evening";
export type DateTimeSelection = { date: Date; period: Period | null };

const PERIODS: { key: Period; label: string; hours: string }[] = [
  { key: "morning", label: "Morning", hours: "09:00 – 12:00" },
  { key: "afternoon", label: "Afternoon", hours: "12:00 – 18:00" },
  { key: "evening", label: "Evening", hours: "18:00 – close" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function monthLabel(d: Date) {
  return d.toLocaleDateString("en", { month: "long", year: "numeric" });
}
function shortDateLabel(d: Date) {
  return d.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" });
}

/** Days of the month grid, Monday-first, padded with leading blanks. */
function useMonthGrid(viewMonth: Date) {
  return useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // getDay(): 0=Sun..6=Sat -> shift to Monday-first (0=Mon..6=Sun)
    const leading = (first.getDay() + 6) % 7;
    const cells: (Date | null)[] = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
    return cells;
  }, [viewMonth]);
}

/** Shared state behind both the mobile full-screen picker and the desktop panel —
 *  real calendar + morning/afternoon/evening period filters. There is no
 *  cross-business time-slot inventory in Dallty's backend (availability is only
 *  known per business, inside its own booking flow), so this deliberately stays at
 *  date + period granularity rather than fabricating individual appointment times
 *  the marketplace search can't actually back up. */
function useDateTimeFlow(initial: DateTimeSelection | null) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);
  const [selectedDate, setSelectedDate] = useState<Date>(initial?.date ?? today);
  const [period, setPeriod] = useState<Period | null>(initial?.period ?? null);
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const cells = useMonthGrid(viewMonth);
  const canGoPrevMonth =
    viewMonth.getFullYear() > today.getFullYear() ||
    (viewMonth.getFullYear() === today.getFullYear() && viewMonth.getMonth() > today.getMonth());

  return {
    today,
    tomorrow,
    selectedDate,
    setSelectedDate,
    period,
    setPeriod,
    viewMonth,
    setViewMonth,
    cells,
    canGoPrevMonth,
  };
}

type Flow = ReturnType<typeof useDateTimeFlow>;

function QuickPicks({ flow, stack }: { flow: Flow; stack?: boolean }) {
  return (
    <div className={stack ? "space-y-2" : "grid grid-cols-2 gap-3"}>
      {[
        { d: flow.today, label: "Today" },
        { d: flow.tomorrow, label: "Tomorrow" },
      ].map(({ d, label }) => {
        const active = sameDay(d, flow.selectedDate);
        return (
          <button
            key={label}
            type="button"
            onClick={() => {
              flow.setSelectedDate(d);
              flow.setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }}
            className={`press rounded-2xl border p-3.5 text-center ${
              active ? "border-primary bg-primary/8" : "border-border bg-card"
            }`}
          >
            <span className="block font-bold">{label}</span>
            <span className="block text-sm text-muted-foreground">{shortDateLabel(d)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Calendar({ flow }: { flow: Flow }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() =>
            flow.canGoPrevMonth &&
            flow.setViewMonth(
              new Date(flow.viewMonth.getFullYear(), flow.viewMonth.getMonth() - 1, 1),
            )
          }
          disabled={!flow.canGoPrevMonth}
          aria-label="Previous month"
          className="press grid size-9 place-items-center rounded-full bg-muted/60 disabled:opacity-30"
        >
          <ChevronLeft className="size-4.5 rtl:rotate-180" />
        </button>
        <p className="font-bold">{monthLabel(flow.viewMonth)}</p>
        <button
          type="button"
          onClick={() =>
            flow.setViewMonth(
              new Date(flow.viewMonth.getFullYear(), flow.viewMonth.getMonth() + 1, 1),
            )
          }
          aria-label="Next month"
          className="press grid size-9 place-items-center rounded-full bg-muted/60"
        >
          <ChevronRight className="size-4.5 rtl:rotate-180" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-xs font-semibold text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {flow.cells.map((d, i) => {
          if (!d) return <span key={`blank-${i}`} />;
          const isPast = d < flow.today;
          const isToday = sameDay(d, flow.today);
          const isSelected = sameDay(d, flow.selectedDate);
          return (
            <button
              key={d.toISOString()}
              type="button"
              disabled={isPast}
              onClick={() => flow.setSelectedDate(d)}
              className={`press mx-auto flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                    ? "border border-primary text-primary"
                    : isPast
                      ? "text-muted-foreground/40"
                      : "text-foreground hover:bg-muted/60"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodPicker({ flow, horizontal }: { flow: Flow; horizontal?: boolean }) {
  return (
    <div>
      <p className="text-sm font-bold">Select a time</p>
      <div className={horizontal ? "mt-3 flex gap-2 overflow-x-auto pb-1" : "mt-3 space-y-2"}>
        {PERIODS.map((p) => {
          const active = flow.period === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => flow.setPeriod(active ? null : p.key)}
              className={`press rounded-2xl border px-4 py-2.5 text-start ${
                horizontal ? "shrink-0" : "block w-full"
              } ${active ? "border-primary bg-primary/8" : "border-border bg-card"}`}
            >
              <span className="block text-sm font-bold">{p.label}</span>
              <span className="block text-xs text-muted-foreground">{p.hours}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ClearDoneRow({
  flow,
  onClear,
  onDone,
  className,
}: {
  flow: Flow;
  onClear: () => void;
  onDone: (s: DateTimeSelection) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-3 ${className ?? ""}`}>
      <button
        type="button"
        onClick={onClear}
        className="press flex min-h-12 flex-1 items-center justify-center rounded-2xl border border-border text-sm font-bold"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={() => onDone({ date: flow.selectedDate, period: flow.period })}
        className="press flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground"
      >
        Done
      </button>
    </div>
  );
}

/** Mobile/tablet — full-screen takeover, quick picks then calendar then periods
 *  stacked vertically, matching the supplied reference. */
export function DateTimePickerSheet({
  open,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: DateTimeSelection | null;
  onClose: () => void;
  onApply: (selection: DateTimeSelection | null) => void;
}) {
  const flow = useDateTimeFlow(initial);

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
          onClick={onClose}
          aria-label="Back"
          className="press grid size-10 shrink-0 place-items-center rounded-full bg-muted/60"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-h3 truncate">Date and time</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 pb-28">
        <QuickPicks flow={flow} />
        <div className="mt-6">
          <Calendar flow={flow} />
        </div>
        <div className="mt-6">
          <PeriodPicker flow={flow} horizontal />
        </div>
      </div>

      <div
        className="shrink-0 border-t border-border/60 bg-cream p-4"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <ClearDoneRow
          flow={flow}
          onClear={() => {
            onApply(null);
            onClose();
          }}
          onDone={(s) => {
            onApply(s);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

/** Desktop — compact panel meant to sit inside a Popover anchored to the Date/time
 *  field: calendar on the left, quick picks + periods on the right, a layout that
 *  makes better use of desktop width than stacking the whole mobile flow vertically. */
export function DateTimePickerPanel({
  initial,
  onApply,
  onDone,
}: {
  initial: DateTimeSelection | null;
  onApply: (selection: DateTimeSelection | null) => void;
  onDone: () => void;
}) {
  const flow = useDateTimeFlow(initial);

  return (
    <div className="w-[34rem] rounded-3xl p-4">
      <div className="grid grid-cols-[1fr_14rem] gap-5">
        <Calendar flow={flow} />
        <div className="space-y-5">
          <QuickPicks flow={flow} stack />
          <PeriodPicker flow={flow} />
        </div>
      </div>
      <ClearDoneRow
        flow={flow}
        onClear={() => {
          onApply(null);
          onDone();
        }}
        onDone={(s) => {
          onApply(s);
          onDone();
        }}
        className="mt-5 border-t border-border/60 pt-4"
      />
    </div>
  );
}
