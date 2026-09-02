import { Clock, MapPin, Navigation } from "lucide-react";

import { BusinessLocationMap } from "@/components/dallty/business-location-map";
import {
  WEEKDAY_NAMES,
  formatHourLabel,
  todayWeekdayInTimezone,
  type BranchHoursRow,
} from "@/lib/business-hours";

type BusinessRow = {
  id: string;
  name: string;
  area: string;
  city: string;
  district: string | null;
  country: string | null;
  address: string | null;
  maps_url: string | null;
  amenities: string[] | null;
  timezone: string | null;
};

/** Real weekly hours + a location card (brief §17-20). `hours` comes from `branch_hours` for
 *  the resolved branch, fetched once in the route (business.$businessSlug.tsx) and shared
 *  with the hero's "Open until…" summary line — no fabricated "same pair repeated 7 times"
 *  (the old BusinessOverview's actual behavior); a weekday with no row genuinely reads as
 *  Closed, matching how this table is documented elsewhere in the codebase
 *  (business-settings.functions.ts). The map preview only renders with the branch's real
 *  coordinates — never a city-center guess (brief §19). */
export function BusinessHoursLocation({
  business,
  hours,
  branchLat,
  branchLng,
}: {
  business: BusinessRow;
  hours: BranchHoursRow[];
  branchLat: number | null | undefined;
  branchLng: number | null | undefined;
}) {
  const today = todayWeekdayInTimezone(business.timezone);
  const location = [
    business.address,
    business.area,
    business.city,
    business.district,
    business.country,
  ]
    .filter(Boolean)
    .join(" · ");
  const mapsHref =
    business.maps_url ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [business.name, business.address, business.city, business.country].filter(Boolean).join(" "),
    )}`;

  return (
    <section id="hours" className="scroll-mt-32 grid gap-4 sm:grid-cols-2">
      <div className="rounded-3xl glass p-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <Clock className="size-5" />
          Opening hours
        </h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {WEEKDAY_NAMES.map((dayName, weekday) => {
            const row = hours.find((h) => h.weekday === weekday);
            const isToday = weekday === today;
            return (
              <li
                key={dayName}
                className={`flex items-center justify-between gap-3 ${isToday ? "font-bold" : ""}`}
              >
                <span className={isToday ? "text-foreground" : "text-muted-foreground"}>
                  {dayName}
                </span>
                <span className={isToday ? "text-foreground" : "font-semibold"}>
                  {row
                    ? `${formatHourLabel(row.opens_at)} – ${formatHourLabel(row.closes_at)}`
                    : "Closed"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Exact availability depends on each specialist's schedule — pick a time in the booking
          step to see live slots.
        </p>
      </div>

      <div className="rounded-3xl glass p-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <MapPin className="size-5" />
          Location
        </h2>
        {branchLat != null && branchLng != null && (
          <div className="mt-3">
            <BusinessLocationMap lat={branchLat} lng={branchLng} name={business.name} />
          </div>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          {location || `${business.area}, ${business.city}`}
        </p>
        {business.amenities?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {business.amenities.map((a) => (
              <span
                key={a}
                className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
              >
                {a}
              </span>
            ))}
          </div>
        ) : null}
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="press mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl glass-soft px-4 text-sm font-bold"
        >
          <Navigation className="size-4" />
          Get directions
        </a>
      </div>
    </section>
  );
}
