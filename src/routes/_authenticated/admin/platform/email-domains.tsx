import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { listEmailDomainRulesAdmin, upsertEmailDomainRule } from "@/lib/email-trust.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/email-domains")({
  head: () => ({
    meta: [
      { title: "Email domains — Dallty Platform" },
      {
        name: "description",
        content: "Manage trusted, disposable and blocked email domains for account signup.",
      },
    ],
  }),
  component: EmailDomainsAdminPage,
});

const CATEGORIES = [
  "trusted_free_provider",
  "business_domain",
  "unknown_domain",
  "disposable_email",
  "blocked_domain",
  "high_risk_domain",
] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORIES)[number], string> = {
  trusted_free_provider: "Trusted free provider",
  business_domain: "Business domain",
  unknown_domain: "Unknown domain",
  disposable_email: "Disposable email",
  blocked_domain: "Blocked domain",
  high_risk_domain: "High risk domain",
};

function EmailDomainsAdminPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const list = useServerFn(listEmailDomainRulesAdmin);
  const upsert = useServerFn(upsertEmailDomainRule);

  const rules = useQuery({
    queryKey: ["admin-email-domain-rules"],
    enabled: isSuper,
    queryFn: () => list(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState("");
  const [newCategory, setNewCategory] = useState<(typeof CATEGORIES)[number]>("disposable_email");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      const row = rules.data?.find((r) => r.id === id);
      if (!row) return;
      await upsert({ data: { ...row, active } });
      await queryClient.invalidateQueries({ queryKey: ["admin-email-domain-rules"] });
      toast.success(active ? "Reactivated" : "Deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  async function addNew() {
    if (!newDomain.trim()) return;
    setAdding(true);
    try {
      await upsert({
        data: {
          domain: newDomain.trim().toLowerCase(),
          category: newCategory,
          reason: newReason.trim() || null,
          active: true,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-email-domain-rules"] });
      setNewDomain("");
      setNewReason("");
      toast.success("Domain rule added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    } finally {
      setAdding(false);
    }
  }

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

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold">
        <Mail className="size-5" /> Email domains
      </h1>
      <p className="text-sm text-muted-foreground">
        Trusted, disposable and blocked domains for account signup. This list is never exposed
        publicly — signup only ever sees an allowed/not-allowed result.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl glass p-4">
        <label className="min-w-0 flex-1 text-xs font-bold uppercase text-muted-foreground">
          Domain
          <input
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value.toLowerCase())}
            placeholder="example.com"
            className="mt-1 block w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground"
          />
        </label>
        <label className="min-w-0 flex-1 text-xs font-bold uppercase text-muted-foreground">
          Category
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as (typeof CATEGORIES)[number])}
            className="mt-1 block w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-0 flex-1 text-xs font-bold uppercase text-muted-foreground">
          Reason (optional)
          <input
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground"
          />
        </label>
        <button
          type="button"
          disabled={adding || !newDomain.trim()}
          onClick={addNew}
          className="press flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {adding && <Loader2 className="size-3.5 animate-spin" />}
          Add
        </button>
      </div>

      {rules.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {(rules.data ?? []).map((r) => (
            <div
              key={r.id}
              className="flex w-full items-center justify-between gap-3 rounded-2xl glass p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.domain}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {CATEGORY_LABELS[r.category]} · {r.reason || "No reason given"} · {r.source}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => toggleActive(r.id, !r.active)}
                className={`press flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-60 ${
                  r.active ? "glass-soft" : "bg-primary text-primary-foreground"
                }`}
              >
                {busyId === r.id && <Loader2 className="size-3.5 animate-spin" />}
                {r.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
