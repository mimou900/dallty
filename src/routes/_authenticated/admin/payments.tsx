import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { format, startOfDay, subDays } from "date-fns";
import { CheckCircle2, CircleDashed, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  money,
  useActiveCurrency,
  useManagedBookings,
  useManagedBusinesses,
  useManagedServices,
  useSetPaymentStatus,
} from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/payments")({
  head: () => ({
    meta: [
      { title: "Payments — Dallty Business" },
      {
        name: "description",
        content:
          "Mark salon bookings as paid or unpaid and track paid, unpaid and estimated revenue in real time.",
      },
      { property: "og:title", content: "Payments — Dallty Business" },
      {
        property: "og:description",
        content: "Track paid and unpaid revenue for every booking in your salon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PaymentsPage,
});

type Filter = "all" | "paid" | "unpaid";

function PaymentsPage() {
  const businessesQuery = useManagedBusinesses();
  const businessIds = useMemo(
    () => (businessesQuery.data ?? []).map((s) => s.id),
    [businessesQuery.data],
  );
  const currency = useActiveCurrency();
  const [filter, setFilter] = useState<Filter>("all");

  const { from, to } = useMemo(() => {
    const today = startOfDay(new Date());
    return {
      from: subDays(today, 89).toISOString(),
      to: new Date(+today + 1000 * 60 * 60 * 24 * 60).toISOString(),
    };
  }, []);

  const bookingsQuery = useManagedBookings(businessIds, from, to);
  const servicesQuery = useManagedServices(businessIds);
  const setPayment = useSetPaymentStatus();

  const bookings = useMemo(
    () => (bookingsQuery.data ?? []).filter((b) => b.status !== "cancelled"),
    [bookingsQuery.data],
  );

  const totals = useMemo(() => {
    const estimated = bookings.reduce((s, b) => s + Number(b.total_price), 0);
    const paid = bookings
      .filter((b) => b.payment_status === "paid")
      .reduce((s, b) => s + Number(b.total_price), 0);
    return { estimated, paid, unpaid: estimated - paid };
  }, [bookings]);

  const rows = bookings
    .filter((b) =>
      filter === "all" ? true : filter === "paid" ? b.payment_status === "paid" : b.payment_status !== "paid",
    )
    .slice()
    .reverse();

  const serviceName = (id: string) =>
    (servicesQuery.data ?? []).find((s) => s.id === id)?.name ?? "Service";

  async function toggle(id: string, isPaid: boolean) {
    try {
      await setPayment.mutateAsync({ id, status: isPaid ? "unpaid" : "paid" });
      toast.success(isPaid ? "Marked as unpaid" : "Marked as paid");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update payment");
    }
  }

  if (businessIds.length === 0) {
    return (
      <p className="rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
        No salon linked to your account yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Estimated revenue", value: totals.estimated, tone: "text-foreground" },
          { label: "Paid revenue", value: totals.paid, tone: "text-primary" },
          { label: "Unpaid revenue", value: totals.unpaid, tone: "text-gold" },
        ].map((card) => (
          <div key={card.label} className="rounded-3xl glass p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
              <Wallet className="size-4 shrink-0 text-muted-foreground" />
            </div>
            <p className={`mt-2 text-2xl font-extrabold ${card.tone}`}>
              {money(card.value, currency)}
            </p>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        {(["all", "unpaid", "paid"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`press min-h-10 rounded-2xl px-4 text-sm font-bold capitalize ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <section className="rounded-3xl glass p-3 sm:p-5">
        {bookingsQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading payments…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No bookings in this view.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((b) => {
              const isPaid = b.payment_status === "paid";
              return (
                <li
                  key={b.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-secondary/50 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{serviceName(b.service_id)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {format(new Date(b.starts_at), "EEE d MMM, HH:mm")} ·{" "}
                      {money(b.total_price, currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(b.id, isPaid)}
                    disabled={setPayment.isPending}
                    className={`press flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-3 text-xs font-extrabold ${
                      isPaid ? "bg-primary/15 text-primary" : "bg-gold/20 text-gold-foreground"
                    }`}
                  >
                    {isPaid ? <CheckCircle2 className="size-4" /> : <CircleDashed className="size-4" />}
                    {isPaid ? "Paid" : "Mark paid"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
