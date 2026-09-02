import { Clock } from "lucide-react";

import { formatMoney } from "@/lib/countries";

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  duration_minutes: number;
  price: number | string;
  discount_price: number | string | null;
};

/** Services & prices, grouped by category (brief §12-13). Extracted from the old
 *  BusinessOverview monolith unchanged in substance — same grouping, same per-service
 *  Book button wired straight into the existing booking flow (brief §14/§48: never a new
 *  booking system, always the existing service -> specialist -> date/time -> confirm one). */
export function BusinessServices({
  services,
  priceRange,
  currency,
  onBook,
}: {
  services: ServiceRow[];
  priceRange: string;
  currency: string;
  onBook: (serviceId: string) => void;
}) {
  const byCategory = services.reduce<Record<string, ServiceRow[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <section id="services" className="scroll-mt-32">
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-xl font-extrabold">Services &amp; prices</h2>
        {priceRange ? <span className="text-sm text-muted-foreground">{priceRange}</span> : null}
      </div>

      {services.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border p-6 text-center text-sm text-muted-foreground">
          This shop hasn't published its service menu yet.
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
                    <li key={s.id} className="rounded-2xl border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate font-bold">{s.name}</p>
                        <button
                          type="button"
                          onClick={() => onBook(s.id)}
                          className="press shrink-0 rounded-full border border-primary px-4 py-1.5 text-xs font-bold text-primary"
                        >
                          Book
                        </button>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {s.duration_minutes} min
                        {s.description ? ` · ${s.description}` : ""}
                      </p>
                      <p className="mt-2 font-extrabold">
                        from {formatMoney(price, currency)}
                        {hasDiscount ? (
                          <span className="ms-2 text-xs font-normal text-muted-foreground line-through">
                            {formatMoney(Number(s.price), currency)}
                          </span>
                        ) : null}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
