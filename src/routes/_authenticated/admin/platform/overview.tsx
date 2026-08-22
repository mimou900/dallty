import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, CalendarCheck, Globe2, ShieldAlert, Star, Users, Wallet } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { money } from "@/lib/admin";
import { platformOverview } from "@/lib/platform.functions";
import { DashboardSkeleton } from "@/components/dallty/skeletons";

export const Route = createFileRoute("/_authenticated/admin/platform/overview")({
  head: () => ({
    meta: [
      { title: "Global data — Dallty Platform" },
      {
        name: "description",
        content:
          "Marketplace-wide totals for every shop on Dallty: revenue, bookings, customers, catalogue size and listing status.",
      },
      { property: "og:title", content: "Global data — Dallty Platform" },
      { property: "og:description", content: "Every shop's numbers in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformOverviewPage,
});

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return (
    <div className="rounded-3xl glass p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function PlatformOverviewPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const fetchOverview = useServerFn(platformOverview);

  const overview = useQuery({
    queryKey: ["platform-overview"],
    enabled: isSuper,
    queryFn: () => fetchOverview(),
  });

  const [term, setTerm] = useState("");
  const needle = term.trim().toLowerCase();
  const visibleShops = useMemo(() => {
    const rows = overview.data?.shops ?? [];
    const filtered = needle
      ? rows.filter((s) =>
          `${s.name} ${s.city ?? ""} ${s.country ?? ""}`.toLowerCase().includes(needle),
        )
      : rows;
    return filtered.slice(0, 50);
  }, [overview.data, needle]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!isSuper) {
    return (
      <div className="rounded-3xl glass p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-destructive" />
        <h2 className="mt-3 text-lg font-extrabold">Super Admin only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This area is reserved for the Dallty platform team.
        </p>
      </div>
    );
  }

  if (overview.isLoading) return <DashboardSkeleton />;
  if (overview.isError)
    return (
      <p className="text-sm text-destructive">
        {overview.error instanceof Error ? overview.error.message : "Could not load platform data"}
      </p>
    );

  const t = overview.data!.totals;
  const roles = overview.data!.roleCounts;
  const shops = visibleShops;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Shops" value={`${t.shops}`} icon={Building2} />
        <Stat label="Live on marketplace" value={`${t.listedShops}`} icon={Globe2} />
        <Stat label="Gross revenue" value={money(t.revenue)} icon={Wallet} />
        <Stat label="Bookings" value={`${t.bookings}`} icon={CalendarCheck} />
        <Stat label="Customers" value={`${t.customers}`} icon={Users} />
        <Stat label="Accounts" value={`${t.accounts}`} icon={Users} />
        <Stat label="Services / staff" value={`${t.services} / ${t.staff}`} icon={Building2} />
        <Stat label="Published reviews" value={`${t.reviews}`} icon={Star} />
      </div>

      <div className="rounded-3xl glass p-5">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-muted-foreground">
          Accounts by role
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(roles).map(([role, count]) => (
            <span
              key={role}
              className="rounded-2xl bg-secondary px-3 py-1 text-sm font-bold capitalize"
            >
              {role.replace("_", " ")} · {count}
            </span>
          ))}
          {t.pendingShops > 0 && (
            <span className="rounded-2xl bg-gold/20 px-3 py-1 text-sm font-bold">
              {t.pendingShops} shop(s) awaiting approval
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-3xl glass p-3">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Filter shops by name or city…"
          className="min-h-11 min-w-56 flex-1 rounded-2xl bg-background px-3 text-sm font-medium outline-none"
        />
        <Link
          to="/admin/platform/directory"
          className="press min-h-11 rounded-2xl bg-primary px-4 text-sm font-bold leading-[2.75rem] text-primary-foreground"
        >
          Full directory
        </Link>
      </div>

      {/* Mobile (brief §97): cards, not a horizontally-scrolled table. */}
      <div className="grid gap-3 sm:hidden">
        {shops.map((s) => (
          <article key={s.id} className="rounded-3xl glass p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-bold">{s.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {s.city}
                  {s.country ? `, ${s.country}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-right text-sm font-bold">{money(s.revenue)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-xl bg-secondary px-2 py-1 text-xs font-bold capitalize">
                {s.status}
              </span>
              <span
                className={`rounded-xl px-2 py-1 text-xs font-bold ${
                  s.isListed ? "bg-primary/15 text-primary" : "bg-gold/20"
                }`}
              >
                {s.isListed ? "listed" : "hidden"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-muted-foreground">
              <div>
                <p className="font-bold text-foreground">{s.services}</p>
                Services
              </div>
              <div>
                <p className="font-bold text-foreground">{s.staff}</p>
                Staff
              </div>
              <div>
                <p className="font-bold text-foreground">{s.bookings}</p>
                Bookings
              </div>
              <div>
                <p className="font-bold text-foreground">{s.rating.toFixed(1)}</p>
                Rating
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* Desktop/tablet: full table. */}
      <div className="hidden overflow-x-auto rounded-3xl glass p-2 sm:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-3">Shop</th>
              <th className="px-3 py-3">Location</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Services</th>
              <th className="px-3 py-3">Staff</th>
              <th className="px-3 py-3">Bookings</th>
              <th className="px-3 py-3">Customers</th>
              <th className="px-3 py-3">Revenue</th>
              <th className="px-3 py-3">Rating</th>
            </tr>
          </thead>
          <tbody>
            {shops.map((s) => (
              <tr key={s.id} className="border-t border-border/40">
                <td className="px-3 py-3 font-bold">{s.name}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {s.city}
                  {s.country ? `, ${s.country}` : ""}
                </td>
                <td className="px-3 py-3">
                  <span className="rounded-xl bg-secondary px-2 py-1 text-xs font-bold capitalize">
                    {s.status}
                  </span>{" "}
                  <span
                    className={`rounded-xl px-2 py-1 text-xs font-bold ${
                      s.isListed ? "bg-primary/15 text-primary" : "bg-gold/20"
                    }`}
                  >
                    {s.isListed ? "listed" : "hidden"}
                  </span>
                </td>
                <td className="px-3 py-3">{s.services}</td>
                <td className="px-3 py-3">{s.staff}</td>
                <td className="px-3 py-3">
                  {s.bookings}
                  {s.cancelled ? ` (${s.cancelled} cancelled)` : ""}
                </td>
                <td className="px-3 py-3">{s.customers}</td>
                <td className="px-3 py-3 font-bold">{money(s.revenue)}</td>
                <td className="px-3 py-3">
                  {s.rating.toFixed(1)} ({s.reviewCount})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(overview.data!.shops.length > shops.length) && (
          <p className="px-3 py-3 text-xs font-semibold text-muted-foreground">
            Showing {shops.length} of {overview.data!.shops.length} shops — refine the filter or open
            the full directory.
          </p>
        )}
      </div>
    </div>
  );
}
