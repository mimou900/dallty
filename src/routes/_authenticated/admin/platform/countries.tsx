import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Globe, Loader2, ShieldAlert } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import {
  listCountriesAdmin,
  listCurrenciesAdmin,
  upsertCountry,
} from "@/lib/reference-data.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/countries")({
  head: () => ({
    meta: [
      { title: "Countries — Dallty Platform" },
      {
        name: "description",
        content:
          "Manage which countries appear across Dallty's phone picker, search filters, and address forms.",
      },
    ],
  }),
  component: CountriesAdminPage,
});

function CountriesAdminPage() {
  const { hasRole, loading } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const listCountries = useServerFn(listCountriesAdmin);
  const listCurrencies = useServerFn(listCurrenciesAdmin);
  const upsert = useServerFn(upsertCountry);

  const countries = useQuery({
    queryKey: ["admin-countries"],
    enabled: isSuper,
    queryFn: () => listCountries(),
  });
  const currencies = useQuery({
    queryKey: ["admin-currencies"],
    enabled: isSuper,
    queryFn: () => listCurrencies(),
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleActive(id: string, active: boolean, display_order: number) {
    setBusyId(id);
    try {
      await upsert({ data: { id, active, display_order } });
      await queryClient.invalidateQueries({ queryKey: ["admin-countries"] });
      toast.success(active ? "Country activated" : "Country deactivated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update country");
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
        <Globe className="size-5" /> Countries
      </h1>

      {countries.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading countries…</p>
      ) : (
        <div className="flex max-h-[60vh] w-full flex-col gap-2 overflow-x-hidden overflow-y-auto">
          {(countries.data ?? []).map((c) => (
            <div
              key={c.id}
              className="flex w-full items-center justify-between gap-3 rounded-2xl glass p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">
                  {c.flag} {c.default_name} · {c.calling_code}
                </p>
                <p className="text-xs text-muted-foreground">{c.currency_code}</p>
              </div>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => toggleActive(c.id, !c.active, c.display_order)}
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

      <h2 className="text-lg font-extrabold">Currencies</h2>
      <p className="text-sm text-muted-foreground">
        Read-only for now — currencies are managed through the countries list above.
      </p>
      {currencies.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading currencies…</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {(currencies.data ?? []).map((c) => (
            <div key={c.code} className="min-w-0 truncate rounded-xl glass-soft px-3 py-2 text-sm">
              <span className="font-bold">{c.code}</span> {c.symbol} — {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
