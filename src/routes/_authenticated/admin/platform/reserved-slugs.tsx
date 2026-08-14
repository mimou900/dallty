import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link2, Loader2, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { listReservedSlugsAdmin, upsertReservedSlug } from "@/lib/reserved-slugs.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/reserved-slugs")({
  head: () => ({
    meta: [
      { title: "Reserved URLs — Dallty Platform" },
      {
        name: "description",
        content: "Manage the words that can never be used as a business's public URL.",
      },
    ],
  }),
  component: ReservedSlugsAdminPage,
});

function ReservedSlugsAdminPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const list = useServerFn(listReservedSlugsAdmin);
  const upsert = useServerFn(upsertReservedSlug);

  const reserved = useQuery({
    queryKey: ["admin-reserved-slugs"],
    enabled: isSuper,
    queryFn: () => list(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState("");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding] = useState(false);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      const row = reserved.data?.find((r) => r.id === id);
      if (!row) return;
      await upsert({ data: { ...row, active } });
      await queryClient.invalidateQueries({ queryKey: ["admin-reserved-slugs"] });
      toast.success(active ? "Reactivated" : "Deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusyId(null);
    }
  }

  async function addNew() {
    if (!newSlug.trim()) return;
    setAdding(true);
    try {
      await upsert({
        data: { slug: newSlug.trim(), reason: newReason.trim() || null, active: true },
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-reserved-slugs"] });
      setNewSlug("");
      setNewReason("");
      toast.success("Reserved word added");
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
        <Link2 className="size-5" /> Reserved URLs
      </h1>
      <p className="text-sm text-muted-foreground">
        Words that can never become a business's public URL slug.
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl glass p-4">
        <label className="min-w-0 flex-1 text-xs font-bold uppercase text-muted-foreground">
          New word
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
            className="mt-1 block w-full rounded-xl border border-border/70 bg-background px-3 py-2 text-sm font-medium text-foreground"
          />
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
          disabled={adding || !newSlug.trim()}
          onClick={addNew}
          className="press flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {adding && <Loader2 className="size-3.5 animate-spin" />}
          Add
        </button>
      </div>

      {reserved.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {(reserved.data ?? []).map((r) => (
            <div
              key={r.id}
              className="flex w-full items-center justify-between gap-3 rounded-2xl glass p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.slug}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.reason || "No reason given"}
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
