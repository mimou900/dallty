import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Phone, Search, Users } from "lucide-react";

import { money, useManagedBusinesses } from "@/lib/admin";
import { listBusinessCustomers } from "@/lib/business-crm.functions";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customers CRM — Dallty Business" },
      {
        name: "description",
        content:
          "Every client who booked with your business: spend, visits, favourite service, beauty notes and contact details.",
      },
      { property: "og:title", content: "Customers CRM — Dallty Business" },
      { property: "og:description", content: "Know every client before they walk in." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const businessesQuery = useManagedBusinesses();
  const businesses = businessesQuery.data ?? [];
  const [businessId, setBusinessId] = useState<string | null>(null);
  const activeBusinessId = businessId ?? businesses[0]?.id ?? null;
  const [term, setTerm] = useState("");

  const fetchCustomers = useServerFn(listBusinessCustomers);
  const customers = useQuery({
    queryKey: ["business-customers", activeBusinessId],
    enabled: Boolean(activeBusinessId),
    queryFn: () => fetchCustomers({ data: { businessId: activeBusinessId! } }),
  });

  const rows = useMemo(() => {
    const list = customers.data ?? [];
    const q = term.trim().toLowerCase();
    const filtered = q
      ? list.filter(
          (c) => c.fullName.toLowerCase().includes(q) || (c.phone ?? "").includes(q),
        )
      : list;
    return [...filtered].sort((a, b) => b.totalSpent - a.totalSpent);
  }, [customers.data, term]);

  if (businessesQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!activeBusinessId)
    return (
      <div className="rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
        No business linked to your account yet.
      </div>
    );

  return (
    <div className="space-y-5">
      {businesses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {businesses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setBusinessId(s.id)}
              className={`press min-h-10 rounded-2xl px-4 text-sm font-bold ${
                s.id === activeBusinessId ? "bg-primary text-primary-foreground" : "glass-soft"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-2xl glass px-4 py-2.5">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search by name or phone"
          className="w-full bg-transparent text-sm font-medium outline-none"
        />
      </div>

      {customers.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading customers…</p>
      ) : customers.isError ? (
        <p className="text-sm text-destructive">
          {customers.error instanceof Error ? customers.error.message : "Could not load customers"}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl glass p-8 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No customers yet — they appear here after their first booking.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((c) => (
            <article key={c.id} className="rounded-3xl glass p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold">{c.fullName}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {c.bookings} booking(s) · {c.cancelled} cancelled ·{" "}
                    {c.favouriteService ?? "no favourite yet"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Last visit:{" "}
                    {c.lastVisit ? format(new Date(c.lastVisit), "d MMM yyyy") : "—"} · Next:{" "}
                    {c.nextVisit ? format(new Date(c.nextVisit), "d MMM yyyy HH:mm") : "—"}
                  </p>
                  {(c.allergies || c.skinType || c.hairType) && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[c.skinType && `Skin: ${c.skinType}`, c.hairType && `Hair: ${c.hairType}`, c.allergies && `Allergies: ${c.allergies}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-xl bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                    {money(c.totalSpent)} lifetime
                  </span>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="press flex min-h-9 items-center gap-2 rounded-2xl glass-soft px-3 text-sm font-bold"
                    >
                      <Phone className="size-3.5" /> {c.phone}
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
