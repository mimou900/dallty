import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, Loader2, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { listPlatformBusinesses, setBusinessStatus } from "@/lib/platform.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/businesses")({
  head: () => ({
    meta: [
      { title: "Business approvals — Dallty Platform" },
      {
        name: "description",
        content:
          "Review, approve, reject or suspend businesses registered on Dallty, with plan and trial details for every business.",
      },
      { property: "og:title", content: "Business approvals — Dallty Platform" },
      { property: "og:description", content: "Super Admin control over every registered business." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformBusinessesPage,
});

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gold/20 text-foreground",
  approved: "bg-primary/20 text-foreground",
  rejected: "bg-destructive/15 text-destructive",
  suspended: "bg-secondary text-muted-foreground",
};

const FILTERS = ["pending", "approved", "rejected", "suspended", "all"] as const;

function PlatformBusinessesPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");

  const fetchBusinesses = useServerFn(listPlatformBusinesses);
  const updateStatus = useServerFn(setBusinessStatus);

  const businesses = useQuery({
    queryKey: ["platform-businesses"],
    enabled: isSuper,
    queryFn: () => fetchBusinesses(),
  });

  const mutate = useMutation({
    mutationFn: (vars: { businessId: string; status: (typeof FILTERS)[number] }) =>
      updateStatus({ data: { businessId: vars.businessId, status: vars.status as never } }),
    onSuccess: () => {
      toast.success("Business updated");
      queryClient.invalidateQueries({ queryKey: ["platform-businesses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update business"),
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

  const rows = (businesses.data ?? []).filter((b) => filter === "all" || b.status === filter);
  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f] =
      f === "all"
        ? (businesses.data ?? []).length
        : (businesses.data ?? []).filter((b) => b.status === f).length;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`press min-h-10 rounded-2xl px-4 text-sm font-bold capitalize ${
              filter === f ? "bg-primary text-primary-foreground" : "glass-soft"
            }`}
          >
            {f} · {counts[f] ?? 0}
          </button>
        ))}
      </div>

      {businesses.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading businesses…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl glass p-8 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No businesses in this state.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((b) => (
            <article key={b.id} className="rounded-3xl glass p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-extrabold">{b.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {b.city}
                    {b.country ? `, ${b.country}` : ""} · {b.employee_count ?? 1} specialists ·{" "}
                    {b.branch_count ?? 1} branch(es)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Owner: {b.ownerName} · {b.business_email ?? "—"} · {b.business_phone ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-secondary px-3 py-1 text-xs font-bold capitalize">
                    {b.plan ?? "starter"}
                  </span>
                  <span
                    className={`rounded-xl px-3 py-1 text-xs font-bold capitalize ${
                      STATUS_STYLES[b.status ?? "pending"]
                    }`}
                  >
                    {b.status}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(["approved", "rejected", "suspended", "pending"] as const)
                  .filter((s) => s !== b.status)
                  .map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={mutate.isPending}
                      onClick={() => mutate.mutate({ businessId: b.id, status: s })}
                      className={`press flex min-h-10 items-center gap-2 rounded-2xl px-4 text-sm font-bold capitalize disabled:opacity-60 ${
                        s === "approved" ? "bg-primary text-primary-foreground" : "glass-soft"
                      }`}
                    >
                      {mutate.isPending && <Loader2 className="size-3.5 animate-spin" />}
                      {s === "pending" ? "Move back to pending" : s}
                    </button>
                  ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
