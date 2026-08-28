import { useMemo } from "react";
import { format } from "date-fns";

import { dateFnsLocaleFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";

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

/**
 * Search redesign §6 — horizontal date pill row (Any day / Today / Tomorrow
 * / next few dates). The separate "Any time" period trigger this row used
 * to end with was dropped as genuinely redundant — the calendar icon in
 * row 2 already opens the full DateTimePickerPanel/Sheet, which covers
 * date AND period (morning/afternoon/evening) together; this row is purely
 * the quick date-tab shortcut now.
 */
export function DateNav({
  date,
  onDateChange,
}: {
  date: DateFilter;
  onDateChange: (date: DateFilter) => void;
}) {
  const { lang } = useLocale();
  const { t } = useTranslation("marketplace");
  const locale = dateFnsLocaleFor(lang);

  const days = useMemo(() => {
    const today = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(today, i));
  }, []);

  return (
    // Reference-matched: dates are a plain text tab row with an underline
    // on the active one, not pill buttons.
    <div className="scrollbar-hide flex items-center gap-4 overflow-x-auto">
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
              date === iso ? "border-foreground font-bold text-foreground" : "border-transparent text-muted-foreground"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
