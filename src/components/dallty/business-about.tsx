import {
  Accessibility,
  Award,
  Car,
  Clock,
  Coffee,
  Dog,
  GraduationCap,
  Info,
  Instagram,
  Languages,
  MapPin,
  Navigation,
  PlayCircle,
  ScrollText,
  Wifi,
} from "lucide-react";

import { BusinessLocationMap } from "@/components/dallty/business-location-map";
import {
  WEEKDAY_NAMES,
  formatHourLabel,
  todayWeekdayInTimezone,
  type BranchHoursRow,
} from "@/lib/business-hours";

const AMENITY_ICONS: Record<string, typeof Wifi> = {
  wifi: Wifi,
  parking: Car,
  coffee: Coffee,
  wheelchair: Accessibility,
  pet_friendly: Dog,
};

const AMENITY_LABELS: Record<string, string> = {
  wifi: "Free WiFi",
  parking: "Parking",
  coffee: "Complimentary coffee",
  wheelchair: "Wheelchair accessible",
  pet_friendly: "Pet friendly",
  home_service: "Home service",
  hotel_service: "Hotel service",
  women_only: "Women only",
  men_only: "Men only",
  kids: "Kids welcome",
};

type Business = {
  id: string;
  name: string;
  description: string | null;
  amenities: string[];
  languages: string[];
  awards: string[];
  certifications: string[];
  brands: string[];
  cancellation_policy: string | null;
  house_rules: string | null;
  owner_story: string | null;
  faq: unknown;
  video_tour_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  area: string;
  city: string;
  district: string | null;
  country: string | null;
  address: string | null;
  maps_url: string | null;
  timezone: string | null;
};

function Chips({ items, icon: Icon }: { items: string[]; icon: typeof Award }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
        >
          <Icon className="size-3.5 text-primary" />
          {item}
        </span>
      ))}
    </div>
  );
}

/** A clean solid card — every section in this file uses this same surface (white/card
 *  background, a subtle border, controlled radius, no shadow). This whole component used to
 *  build every card as `rounded-3xl glass p-5`, matching the rest of the (now-abandoned)
 *  "atmospheric glass" treatment — explicit feedback was that content sections must NOT be
 *  glass/translucent, only a few floating controls (header, sticky CTA, bottom nav) should
 *  be. This card style — plus AmenityRow/OutlineLink below — is the one place that decision
 *  is centralized for this file. */
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-5">{children}</div>;
}

function AmenityRow({ label, icon: Icon }: { label: string; icon: typeof Wifi }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border px-4 py-3">
      <Icon className="size-4 shrink-0 text-primary" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

/** Compact outline "secondary action" link/button — used for Get directions, Instagram,
 *  TikTok. Video tour stays the one filled/primary action in this section (it's the closest
 *  thing to a CTA "Take a look inside" has). */
function OutlineLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof Navigation;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="press flex min-h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold"
    >
      <Icon className="size-4" />
      {children}
    </a>
  );
}

export function BusinessOtherInfo({
  business,
  hours,
  branchLat,
  branchLng,
}: {
  business: Business;
  hours: BranchHoursRow[];
  branchLat: number | null | undefined;
  branchLng: number | null | undefined;
}) {
  const faq = Array.isArray(business.faq)
    ? (business.faq as { q?: string; a?: string }[]).filter((f) => f.q && f.a)
    : [];

  const today = todayWeekdayInTimezone(business.timezone);
  const location = [business.address, business.area, business.city, business.district, business.country]
    .filter(Boolean)
    .join(" · ");
  const mapsHref =
    business.maps_url ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [business.name, business.address, business.city, business.country].filter(Boolean).join(" "),
    )}`;

  // business.description itself is shown by its own "About" section (business-description.tsx)
  // right after the hero — nothing here duplicates it. Gallery/portfolio photos moved to
  // business-portfolio.tsx (its own "Photos" section). This "Other" section matches the
  // reference screenshots' "Autres" tab: Opening hours -> Additional information (amenities)
  // -> Location/map first (every business has these), THEN everything else this business has
  // actually filled in (story, socials, languages/awards/certs/brands, policies, FAQ) — each
  // one only when present, never a placeholder for missing data.
  return (
    <section id="other" className="scroll-mt-32 space-y-5">
      <h2 className="text-xl font-extrabold">Other information</h2>

      <Card>
        <h3 className="flex items-center gap-2 text-base font-extrabold">
          <Clock className="size-4.5" />
          Opening hours
        </h3>
        <ul className="mt-3 space-y-1.5 text-sm">
          {WEEKDAY_NAMES.map((dayName, weekday) => {
            const row = hours.find((h) => h.weekday === weekday);
            const isToday = weekday === today;
            return (
              <li
                key={dayName}
                className={`flex items-center gap-2.5 ${isToday ? "font-bold" : ""}`}
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${row ? "bg-primary" : "bg-border"}`}
                  aria-hidden
                />
                <span className={`flex-1 ${isToday ? "text-foreground" : "text-muted-foreground"}`}>
                  {dayName}
                </span>
                <span className={isToday ? "text-foreground" : "font-semibold"}>
                  {row ? `${formatHourLabel(row.opens_at)} – ${formatHourLabel(row.closes_at)}` : "Closed"}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Exact availability depends on each specialist's schedule — pick a time in the booking
          step to see live slots.
        </p>
      </Card>

      {business.amenities.length > 0 && (
        <Card>
          <h3 className="text-base font-extrabold">Additional information</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {business.amenities.map((key) => (
              <AmenityRow
                key={key}
                icon={AMENITY_ICONS[key] ?? Info}
                label={AMENITY_LABELS[key] ?? key.replace(/_/g, " ")}
              />
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="flex items-center gap-2 text-base font-extrabold">
          <MapPin className="size-4.5" />
          Location
        </h3>
        {branchLat != null && branchLng != null && (
          <div className="mt-3">
            <BusinessLocationMap lat={branchLat} lng={branchLng} name={business.name} />
          </div>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          {location || `${business.area}, ${business.city}`}
        </p>
        <div className="mt-3">
          <OutlineLink href={mapsHref} icon={Navigation}>
            Get directions
          </OutlineLink>
        </div>
      </Card>

      {business.owner_story && (
        <Card>
          <h3 className="text-base font-extrabold">Owner's story</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {business.owner_story}
          </p>
        </Card>
      )}

      {(business.video_tour_url || business.instagram_url || business.tiktok_url) && (
        <Card>
          <h3 className="text-base font-extrabold">Take a look inside</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {business.video_tour_url && (
              <a
                href={business.video_tour_url}
                target="_blank"
                rel="noreferrer noopener"
                className="press flex min-h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                <PlayCircle className="size-4" />
                Video tour
              </a>
            )}
            {business.instagram_url && (
              <OutlineLink href={business.instagram_url} icon={Instagram}>
                Instagram
              </OutlineLink>
            )}
            {business.tiktok_url && (
              <OutlineLink href={business.tiktok_url} icon={Instagram}>
                TikTok
              </OutlineLink>
            )}
          </div>
        </Card>
      )}

      {(business.languages.length > 0 ||
        business.awards.length > 0 ||
        business.certifications.length > 0 ||
        business.brands.length > 0) && (
        <Card>
          <div className="space-y-4">
            {business.languages.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Languages spoken
                </h3>
                <Chips items={business.languages} icon={Languages} />
              </div>
            )}
            {business.awards.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Awards
                </h3>
                <Chips items={business.awards} icon={Award} />
              </div>
            )}
            {business.certifications.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Certifications
                </h3>
                <Chips items={business.certifications} icon={GraduationCap} />
              </div>
            )}
            {business.brands.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Products used
                </h3>
                <Chips items={business.brands} icon={ScrollText} />
              </div>
            )}
          </div>
        </Card>
      )}

      {(business.cancellation_policy || business.house_rules) && (
        <Card>
          <div className="space-y-4">
            {business.cancellation_policy && (
              <div>
                <h3 className="text-base font-extrabold">Cancellation policy</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {business.cancellation_policy}
                </p>
              </div>
            )}
            {business.house_rules && (
              <div>
                <h3 className="text-base font-extrabold">House rules</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {business.house_rules}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {faq.length > 0 && (
        <Card>
          <h3 className="text-base font-extrabold">FAQ</h3>
          <div className="mt-3 space-y-2">
            {faq.map((item, i) => (
              <details key={i} className="rounded-xl border border-border p-4">
                <summary className="cursor-pointer text-sm font-bold">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </Card>
      )}
    </section>
  );
}
