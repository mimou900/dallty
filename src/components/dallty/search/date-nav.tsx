import { useMemo } from "react";
import { format } from "date-fns";
import { Clock } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateFnsLocaleFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import type { Period } from "@/components/dallty/datetime-picker-sheet";

/** `""` means "N'importe quel jour" — no date filter at all. Distinct from
 *  "Today", which the honest open-now mapping in `search.tsx` treats
 *  specially (see that file's comment on `wantsOpenNow`). */
export type DateFilter = string;

function startOfDay(d: Date) {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function toISODate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

const PERIODS: { key: Period; labelKey: "period_morning" | "period_afternoon" | "period_evening" }[] = [
  { key: "morning", labelKey: "period_morning" },
  { key: "afternoon", labelKey: "period_afternoon" },
  { key: "evening", labelKey: "period_evening" },
];

/**
 * Search redesign §6 — horizontal date pill row (Any day / Today / Tomorrow
 * / next few dates) plus a compact time-period control. Reuses
 * `datetime-picker-sheet.tsx`'s real `Period` type/date-fns locale helper
 * rather than inventing a second date model; "Any day" is new here (that
 * sheet always defaults to a concrete date, never "no date").
 */
export function DateNav({
  date,
  period,
  onDateChange,
  onPeriodChange,
}: {
  date: DateFilter;
  period: Period | null;
  onDateChange: (date: DateFilter) => void;
  onPeriodChange: (period: Period | null) => void;
}) {
  const { lang } = useLocale();
  const { t } = useTranslation("marketplace");
  const locale = dateFnsLocaleFor(lang);

  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(today, i));
  }, []);

  return (
    <div className="flex items-center gap-2">
      {/* Reference-matched: dates are a plain text tab row with an
          underline on the active one, not pill buttons — the pill/border
          treatment is reserved for the separate time trigger below. */}
      <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
        <button
          type="button"
          onClick={() => onDateChange("")}
          className={`press shrink-0 border-b-2 pb-1 text-sm transition-colors duration-150 ${
            date === "" ? "border-foreground font-bold text-foreground" : "border-transparent text-muted-foreground"
          }`}
        >
          {t("date_any_day")}
        </button>
        {days.map((d, i) => {
          const iso = toISODate(d);
          const label = i === 0 ? t("today") : i === 1 ? t("tomorrow") : format(d, "EEE d MMM", { locale });
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDateChange(iso)}
              className={`press shrink-0 border-b-2 pb-1 text-sm transition-colors duration-150 ${
                date === iso
                  ? "border-foreground font-bold text-foreground"
                  : "border-transparent text-muted-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("select_time_label")}
            className={`press flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-150 ${
              period
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 bg-card hover:border-border"
            }`}
          >
            <Clock className="size-4" />
            {period ? t(PERIODS.find((p) => p.key === period)!.labelKey) : t("period_any")}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 rounded-2xl p-2">
          <button
            type="button"
            onClick={() => onPeriodChange(null)}
            className={`press flex w-full items-center rounded-xl px-3 py-2.5 text-start text-sm font-semibold ${
              period === null ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
            }`}
          >
            {t("period_any")}
          </button>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => onPeriodChange(p.key)}
              className={`press flex w-full items-center rounded-xl px-3 py-2.5 text-start text-sm font-semibold ${
                period === p.key ? "bg-primary/10 text-primary" : "hover:bg-muted/60"
              }`}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
