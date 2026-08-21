import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { money } from "@/lib/admin";
import { runReconciliation } from "@/lib/reconciliation.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliation — Dallty Platform" },
      {
        name: "description",
        content: "Cross-checks recorded payments against the ledger for every business.",
      },
    ],
  }),
  component: ReconciliationPage,
});

function ReconciliationPage() {
  const { hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const run = useServerFn(runReconciliation);

  const result = useQuery({
    queryKey: ["admin-reconciliation"],
    enabled: isSuper,
    queryFn: () => run({ data: {} }),
  });

  if (!isSuper) {
    return <p className="p-6 text-sm text-muted-foreground">Super Admin only.</p>;
  }

  const rows = result.data?.rows ?? [];
  const mismatches = rows.filter((r) => !r.match);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Recorded payments vs. the ledger's own cash-received total, per business. These should
            always match exactly — every payment posts both in the same transaction.
          </p>
        </div>
        <button
          type="button"
          onClick={() => result.refetch()}
          disabled={result.isFetching}
          className="press flex min-h-10 items-center gap-1.5 rounded-2xl bg-secondary px-4 text-sm font-bold disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${result.isFetching ? "animate-spin" : ""}`} /> Re-check
        </button>
      </div>

      {result.isLoading ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No payment activity to check yet.
        </p>
      ) : (
        <>
          <div
            className={`flex items-center gap-2 rounded-2xl p-4 text-sm font-bold ${
              mismatches.length === 0
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {mismatches.length === 0 ? (
              <CheckCircle2 className="size-4 shrink-0" />
            ) : (
              <TriangleAlert className="size-4 shrink-0" />
            )}
            {mismatches.length === 0
              ? `All ${rows.length} businesses reconcile.`
              : `${mismatches.length} of ${rows.length} businesses have a discrepancy.`}
          </div>

          <div className="overflow-hidden rounded-3xl border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-left text-xs font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Payments total</th>
                  <th className="px-4 py-3">Ledger total</th>
                  <th className="px-4 py-3">Difference</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.businessId} className={r.match ? "" : "bg-destructive/5"}>
                    <td className="px-4 py-3 font-bold">{r.businessName}</td>
                    <td className="px-4 py-3">{money(r.paymentsTotal)}</td>
                    <td className="px-4 py-3">{money(r.ledgerTotal)}</td>
                    <td className="px-4 py-3">{money(r.difference)}</td>
                    <td className="px-4 py-3">
                      {r.match ? (
                        <span className="text-primary">Match</span>
                      ) : (
                        <span className="font-bold text-destructive">Mismatch</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
