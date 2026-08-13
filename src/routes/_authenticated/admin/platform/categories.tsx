import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Tags } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { listCategoriesAdmin, upsertCategory } from "@/lib/reference-data.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Dallty Platform" },
      {
        name: "description",
        content: "Manage the business categories shown across Dallty's booking and search pages.",
      },
    ],
  }),
  component: CategoriesAdminPage,
});

function CategoriesAdminPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const list = useServerFn(listCategoriesAdmin);
  const upsert = useServerFn(upsertCategory);

  const categories = useQuery({
    queryKey: ["admin-categories"],
    enabled: isSuper,
    queryFn: () => list(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      const row = categories.data?.find((c) => c.id === id);
      if (!row) return;
      await upsert({ data: { ...row, active } });
      await queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
      toast.success(active ? "Category activated" : "Category deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update category");
    } finally {
      setBusyId(null);
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
        <Tags className="size-5" /> Categories
      </h1>

      {categories.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {(categories.data ?? []).map((c) => (
            <div
              key={c.id}
              className="flex w-full items-center justify-between gap-3 rounded-2xl glass p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{c.default_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {Object.values((c.translations ?? {}) as Record<string, string>).join(" / ") ||
                    "No translations yet"}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => toggleActive(c.id, !c.active)}
                className={`press flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-bold disabled:opacity-60 ${
                  c.active ? "glass-soft" : "bg-primary text-primary-foreground"
                }`}
              >
                {busyId === c.id && <Loader2 className="size-3.5 animate-spin" />}
                {c.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
