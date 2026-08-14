import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BadgeCheck, CheckCircle2, CircleAlert, ShieldAlert, Store } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  READINESS_CHECKS,
  listMarketplaceQueue,
  setMarketplaceStatus,
  setSalonVerified,
  type MarketplaceStatus,
} from "@/lib/marketplace.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace approvals — Dallty Platform" },
      {
        name: "description",
        content:
          "Review businesses submitted to the Dallty marketplace, approve or reject listings and grant the Verified by Dallty badge.",
      },
      { property: "og:title", content: "Marketplace approvals — Dallty Platform" },
      {
        property: "og:description",
        content: "Super Admin review queue for marketplace listings and verification badges.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlatformMarketplacePage,
});

const FILTERS = ["pending_review", "approved", "rejected", "hidden", "draft", "all"] as const;

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-secondary text-muted-foreground",
  pending_review: "bg-gold/20 text-foreground",
  approved: "bg-primary/20 text-foreground",
  rejected: "bg-destructive/15 text-destructive",
  hidden: "bg-secondary text-muted-foreground",
};

function PlatformMarketplacePage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending_review");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const fetchQueue = useServerFn(listMarketplaceQueue);
  const updateStatus = useServerFn(setMarketplaceStatus);
  const updateVerified = useServerFn(setSalonVerified);

  const queue = useQuery({
    queryKey: ["platform-marketplace"],
    enabled: isSuper,
    queryFn: () => fetchQueue(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["platform-marketplace"] });

  const statusMutation = useMutation({
    mutationFn: (vars: { businessId: string; status: MarketplaceStatus; note?: string }) =>
      updateStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Marketplace status updated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update listing"),
  });

  const verifyMutation = useMutation({
    mutationFn: (vars: { businessId: string; verified: boolean }) => updateVerified({ data: vars }),
    onSuccess: (_d, vars) => {
      toast.success(vars.verified ? "Verification granted" : "Verification removed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update verification"),
  });

  const rows = useMemo(
    () =>
      (queue.data ?? []).filter((s) => filter === "all" || s.marketplace_status === filter),
    [queue.data, filter],
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (!isSuper) {
    return (
      <div className="rounded-3xl glass p-8 text-center">
        <ShieldAlert className="mx-auto size-8 text-destructive" />
        <h2 className="mt-3 text-lg font-extrabold">Super Admin only</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Marketplace approval and verification are reserved for the Dallty platform team.
        </p>
      </div>
    );
  }

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f] =
      f === "all"
        ? (queue.data ?? []).length
        : (queue.data ?? []).filter((s) => s.marketplace_status === f).length;
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
            className={`press min-h-10 rounded-2xl px-4 text-sm font-bold ${
              filter === f ? "bg-primary text-primary-foreground" : "glass-soft"
            }`}
          >
            {f.replace("_", " ")} · {counts[f] ?? 0}
          </button>
        ))}
      </div>

      {queue.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading marketplace queue…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl glass p-8 text-center">
          <Store className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nothing in this state.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((s) => {
            const readiness = s.readiness;
            const missing = READINESS_CHECKS.filter((c) => !readiness?.[c.key]);
            const note = notes[s.id] ?? "";
            return (
              <article key={s.id} className="rounded-3xl glass p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex items-center gap-2 truncate text-lg font-extrabold">
                      {s.name}
                      {s.is_verified ? <BadgeCheck className="size-4 text-gold" /> : null}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {s.city}
                      {s.country ? `, ${s.country}` : ""}
                      {s.submitted_at
                        ? ` · submitted ${new Date(s.submitted_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-2xl px-3 py-1 text-xs font-bold ${
                      STATUS_STYLES[s.marketplace_status] ?? "bg-secondary"
                    }`}
                  >
                    {s.marketplace_status.replace("_", " ")}
                  </span>
                </div>

                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {READINESS_CHECKS.map((c) => {
                    const ok = Boolean(readiness?.[c.key]);
                    return (
                      <li key={c.key} className="flex items-center gap-2 text-sm">
                        {ok ? (
                          <CheckCircle2 className="size-4 shrink-0 text-primary" />
                        ) : (
                          <CircleAlert className="size-4 shrink-0 text-gold" />
                        )}
                        <span className={ok ? "" : "text-muted-foreground"}>{c.label}</span>
                      </li>
                    );
                  })}
                </ul>

                <textarea
                  value={note}
                  onChange={(e) => setNotes((n) => ({ ...n, [s.id]: e.target.value }))}
                  placeholder="Review note for the owner (shown on their marketplace page)"
                  rows={2}
                  className="mt-3 w-full rounded-2xl bg-secondary/60 p-3 text-sm outline-none"
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={missing.length > 0 || statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ businessId: s.id, status: "approved", note: note || undefined })
                    }
                    title={missing.length ? `${missing.length} requirement(s) missing` : undefined}
                    className="press min-h-10 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40"
                  >
                    Approve listing
                  </button>
                  <button
                    type="button"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ businessId: s.id, status: "rejected", note: note || undefined })
                    }
                    className="press min-h-10 rounded-2xl bg-destructive/15 px-4 text-sm font-bold text-destructive"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={statusMutation.isPending}
                    onClick={() =>
                      statusMutation.mutate({ businessId: s.id, status: "hidden", note: note || undefined })
                    }
                    className="press min-h-10 rounded-2xl bg-secondary px-4 text-sm font-bold"
                  >
                    Hide
                  </button>
                  <button
                    type="button"
                    disabled={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ businessId: s.id, status: "draft" })}
                    className="press min-h-10 rounded-2xl bg-secondary px-4 text-sm font-bold"
                  >
                    Send back to draft
                  </button>
                  <button
                    type="button"
                    disabled={verifyMutation.isPending}
                    onClick={() =>
                      verifyMutation.mutate({ businessId: s.id, verified: !s.is_verified })
                    }
                    className="press min-h-10 rounded-2xl bg-gold/20 px-4 text-sm font-bold"
                  >
                    {s.is_verified ? "Remove verification" : "Grant Verified by Dallty"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
