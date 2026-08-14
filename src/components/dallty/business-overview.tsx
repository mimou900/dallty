import { CalendarDays, Clock, MapPin, Navigation, Sparkles, Star, Users, Zap } from "lucide-react";

import { formatMoney } from "@/lib/countries";
import { businessCategoryLabel } from "@/lib/business-category-label";
import type { Category } from "@/lib/reference-data";

type BusinessRow = {
  id: string;
  name: string;
  description: string | null;
  area: string;
  city: string;
  district: string | null;
  country: string | null;
  address: string | null;
  maps_url: string | null;
  image_url: string | null;
  cover_url: string | null;
  rating: number | string;
  review_count: number;
  price_range: string;
  opens_at: string;
  closes_at: string;
  instant_booking: boolean;
  business_type: string | null;
  categories: string[] | null;
  amenities: string[] | null;
  currency: string;
};

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  price: number | string;
  discount_price: number | string | null;
};

function shortTime(value: string) {
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${m ?? "00"} ${suffix}`;
}

export function BusinessOverview({
  business,
  services,
  staffCount,
  categories,
  lang,
  onBook,
}: {
  business: BusinessRow;
  services: ServiceRow[];
  staffCount: number;
  categories: Category[];
  lang: string;
  onBook: (serviceId?: string) => void;
}) {
  const cover = business.cover_url ?? business.image_url ?? "/salons/hair.jpg";
  const location = [business.address, business.area, business.city, business.district, business.country]
    .filter(Boolean)
    .join(" · ");
  const mapsHref =
    business.maps_url ??
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      [business.name, business.address, business.city, business.country].filter(Boolean).join(" "),
    )}`;

  const byCategory = services.reduce<Record<string, ServiceRow[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6 pb-6">
      {/* Cover */}
      <section className="mt-6 overflow-hidden rounded-4xl">
        <div className="relative">
          <img
            src={cover}
            alt={`${business.name} interior`}
            width={1200}
            height={800}
            className="h-56 w-full object-cover sm:h-72"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 space-y-2 p-5">
            <div className="flex flex-wrap items-center gap-2">
              {businessCategoryLabel(categories, business.categories, lang) ? (
                <span className="rounded-full glass-soft px-3 py-1 text-xs font-bold text-background">
                  {businessCategoryLabel(categories, business.categories, lang)}
                </span>
              ) : null}
              {business.instant_booking ? (
                <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-xs font-bold text-gold-foreground">
                  <Zap className="size-3.5" />
                  Instant booking
                </span>
              ) : null}
            </div>
            <h2 className="text-2xl font-extrabold text-background sm:text-3xl">{business.name}</h2>
            <p className="flex items-center gap-1.5 text-sm text-background/85">
              <MapPin className="size-4" />
              {business.area} · {business.city}
            </p>
          </div>
        </div>
      </section>

      {/* Quick facts */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact icon={<Star className="size-4 fill-gold text-gold" />} label="Rating">
          {Number(business.rating).toFixed(1)} ({business.review_count})
        </Fact>
        <Fact icon={<Clock className="size-4" />} label="Hours today">
          {shortTime(business.opens_at)} – {shortTime(business.closes_at)}
        </Fact>
        <Fact icon={<Sparkles className="size-4" />} label="Services">
          {services.length}
        </Fact>
        <Fact icon={<Users className="size-4" />} label="Specialists">
          {staffCount}
        </Fact>
      </section>

      {business.description ? (
        <p className="rounded-3xl glass p-5 text-sm leading-relaxed text-muted-foreground">
          {business.description}
        </p>
      ) : null}

      {/* Services */}
      <section>
        <div className="flex items-end justify-between gap-3">
          <h3 className="text-xl font-extrabold">Services &amp; prices</h3>
          <span className="text-sm text-muted-foreground">{business.price_range}</span>
        </div>

        {services.length === 0 ? (
          <p className="mt-4 rounded-3xl glass p-6 text-center text-sm text-muted-foreground">
            This shop hasn’t published its service menu yet.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {Object.entries(byCategory).map(([category, list]) => (
              <div key={category}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {category}
                </p>
                <ul className="mt-2 space-y-2">
                  {list.map((s) => {
                    const price = Number(s.discount_price ?? s.price);
                    const hasDiscount = s.discount_price != null;
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center gap-3 rounded-3xl glass p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold">{s.name}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="size-3.5" />
                            {s.duration_minutes} min
                            {s.description ? ` · ${s.description}` : ""}
                          </p>
                        </div>
                        <div className="text-end">
                          <p className="font-extrabold">{formatMoney(price, business.currency)}</p>
                          {hasDiscount ? (
                            <p className="text-xs text-muted-foreground line-through">
                              {formatMoney(Number(s.price), business.currency)}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => onBook(s.id)}
                          className="press min-h-10 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                        >
                          Book
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Hours + location */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl glass p-5">
          <h3 className="flex items-center gap-2 text-lg font-extrabold">
            <Clock className="size-5" />
            Opening hours
          </h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
              (dayName) => (
                <li key={dayName} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{dayName}</span>
                  <span className="font-semibold">
                    {shortTime(business.opens_at)} – {shortTime(business.closes_at)}
                  </span>
                </li>
              ),
            )}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Exact availability depends on each specialist’s schedule — pick a time in the booking
            step to see live slots.
          </p>
        </div>

        <div className="rounded-3xl glass p-5">
          <h3 className="flex items-center gap-2 text-lg font-extrabold">
            <MapPin className="size-5" />
            Location
          </h3>
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

      {/* Booking CTA */}
      <section className="overflow-hidden rounded-4xl glass p-6 text-center sm:p-8">
        <h3 className="text-2xl font-extrabold">Ready when you are</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a service, choose your specialist and confirm in four quick steps.
        </p>
        <button
          type="button"
          onClick={() => onBook()}
          className="press mt-5 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-7 text-base font-bold text-primary-foreground"
        >
          <CalendarDays className="size-5" />
          Book an appointment
        </button>
      </section>
    </div>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl glass px-4 py-4">
      <p className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-extrabold">{children}</p>
    </div>
  );
}
