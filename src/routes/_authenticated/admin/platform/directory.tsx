import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Search, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { platformDirectory } from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/directory")({
  head: () => ({
    meta: [
      { title: "Directory — Dallty Platform" },
      {
        name: "description",
        content:
          "Search and page through every shop, specialist, service and appointment on the Dallty marketplace.",
      },
      { property: "og:title", content: "Directory — Dallty Platform" },
      { property: "og:description", content: "One searchable index for the whole marketplace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectoryPage,
});

const ENTITIES = [
  { key: "shops", label: "Shops" },
  { key: "staff", label: "Specialists" },
  { key: "services", label: "Services" },
  { key: "appointments", label: "Appointments" },
] as const;

const STATUS_OPTIONS: Record<string, { value: string; label: string }[]> = {
  shops: [
    { value: "", label: "All statuses" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "suspended", label: "Suspended" },
  ],
  staff: [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ],
  services: [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ],
  appointments: [
    { value: "", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ],
};

const PAGE_SIZE = 25;

function DirectoryPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const fetchDirectory = useServerFn(platformDirectory);

  const [entity, setEntity] = useState<(typeof ENTITIES)[number]["key"]>("shops");
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["platform-directory", entity, q, status, page],
    enabled: isSuper,
    placeholderData: keepPreviousData,
    queryFn: () => fetchDirectory({ data: { entity, q, status, page, pageSize: PAGE_SIZE } }),
  });

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

  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ENTITIES.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => {
              setEntity(e.key);
              setStatus("");
              setPage(1);
            }}
            className={`press min-h-10 rounded-2xl px-4 text-sm font-bold ${
              entity === e.key
                ? "bg-primary text-primary-foreground shadow-soft"
                : "glass-soft text-muted-foreground"
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <form
        className="flex flex-wrap items-center gap-2 rounded-3xl glass p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(term.trim());
          setPage(1);
        }}
      >
        <div className="flex min-w-56 flex-1 items-center gap-2 rounded-2xl bg-background px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by name…"
            className="min-h-11 w-full bg-transparent text-sm font-medium outline-none"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="min-h-11 rounded-2xl border border-border/70 bg-background px-3 text-sm font-semibold"
        >
          {STATUS_OPTIONS[entity].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="press min-h-11 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          Search
        </button>
      </form>

      <div className="rounded-3xl glass p-2">
        {list.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : list.isError ? (
          <p className="p-4 text-sm text-destructive">
            {list.error instanceof Error ? list.error.message : "Could not load directory"}
          </p>
        ) : !list.data?.rows.length ? (
          <p className="p-4 text-sm text-muted-foreground">Nothing matches this search.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {list.data.rows.map((row) => (
              <li
                key={row.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.badges.filter(Boolean).map((b) => (
                      <span
                        key={b}
                        className="rounded-lg bg-secondary px-2 py-0.5 text-[11px] font-bold capitalize"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                </div>
                {row.right ? <span className="text-sm font-bold">{row.right}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">
          {total} record{total === 1 ? "" : "s"} · page {page} of {pages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="press grid size-10 place-items-center rounded-2xl glass-soft disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="press grid size-10 place-items-center rounded-2xl glass-soft disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
