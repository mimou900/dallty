import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { FileDown, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  money,
  useActiveCurrency,
  useManagedBookings,
  useManagedBusinesses,
  useManagedServices,
  useManagedStaff,
} from "@/lib/admin";
import {
  exportReportCsv,
  exportReportExcel,
  exportReportPdf,
  type ReportDocument,
} from "@/lib/report-export";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Dallty Business" },
      {
        name: "description",
        content:
          "Revenue, bookings, clients, popular services, top specialists and busy hours for any period — exportable to PDF, Excel or CSV.",
      },
      { property: "og:title", content: "Reports — Dallty Business" },
      {
        property: "og:description",
        content: "Revenue, growth and performance analytics for your business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

const PERIODS = ["today", "week", "month", "year", "custom"] as const;
type Period = (typeof PERIODS)[number];

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  year: "This year",
  custom: "Custom range",
};

function ReportsPage() {
  const businessesQuery = useManagedBusinesses();
  const businessIds = useMemo(
    () => (businessesQuery.data ?? []).map((s) => s.id),
    [businessesQuery.data],
  );
  const currency = useActiveCurrency();

  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [customTo, setCustomTo] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const range = useMemo(() => {
    const now = new Date();
    if (period === "today") return { from: startOfDay(now), to: endOfDay(now) };
    if (period === "week")
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
      };
    if (period === "month") return { from: startOfMonth(now), to: endOfMonth(now) };
    if (period === "year") return { from: startOfYear(now), to: endOfYear(now) };
    return { from: startOfDay(new Date(customFrom)), to: endOfDay(new Date(customTo)) };
  }, [period, customFrom, customTo]);

  // A wide window is fetched once so "new vs returning" can look at each
  // client's whole history, then everything is filtered to the chosen period.
  const historyWindow = useMemo(
    () => ({ from: new Date("2015-01-01").toISOString(), to: endOfYear(new Date()).toISOString() }),
    [],
  );
  const bookingsQuery = useManagedBookings(businessIds, historyWindow.from, historyWindow.to);
  const servicesQuery = useManagedServices(businessIds);
  const staffQuery = useManagedStaff(businessIds);

  const stats = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    const services = servicesQuery.data ?? [];
    const staff = staffQuery.data ?? [];

    const inRange = all.filter((b) => {
      const t = +new Date(b.starts_at);
      return t >= +range.from && t <= +range.to;
    });
    const active = inRange.filter((b) => b.status !== "cancelled");

    const revenue = active.reduce((s, b) => s + Number(b.total_price), 0);
    const paidRevenue = active
      .filter((b) => b.payment_status === "paid")
      .reduce((s, b) => s + Number(b.total_price), 0);

    const clientIds = [...new Set(inRange.map((b) => b.customer_id))];
    const firstBooking = new Map<string, number>();
    for (const b of all) {
      const t = +new Date(b.starts_at);
      const prev = firstBooking.get(b.customer_id);
      if (prev === undefined || t < prev) firstBooking.set(b.customer_id, t);
    }
    const newClients = clientIds.filter((id) => (firstBooking.get(id) ?? 0) >= +range.from).length;

    const serviceCount = new Map<string, { count: number; revenue: number }>();
    const staffStats = new Map<string, { count: number; revenue: number }>();
    const hours = new Map<number, number>();
    const months = new Map<string, number>();

    for (const b of active) {
      const price = Number(b.total_price);
      const s = serviceCount.get(b.service_id) ?? { count: 0, revenue: 0 };
      serviceCount.set(b.service_id, { count: s.count + 1, revenue: s.revenue + price });
      const st = staffStats.get(b.staff_id) ?? { count: 0, revenue: 0 };
      staffStats.set(b.staff_id, { count: st.count + 1, revenue: st.revenue + price });
      const d = new Date(b.starts_at);
      hours.set(d.getHours(), (hours.get(d.getHours()) ?? 0) + 1);
      const key = format(d, "yyyy-MM");
      months.set(key, (months.get(key) ?? 0) + price);
    }

    const topServices = [...serviceCount.entries()]
      .map(([id, v]) => ({
        name: services.find((s) => s.id === id)?.name ?? "Service",
        count: v.count,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.count - a.count);

    const topSpecialists = [...staffStats.entries()]
      .map(([id, v]) => ({
        name: staff.find((s) => s.id === id)?.full_name ?? "Specialist",
        bookings: v.count,
        revenue: v.revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const busyHours = Array.from({ length: 15 }).map((_, i) => {
      const hour = i + 8;
      return { label: `${String(hour).padStart(2, "0")}:00`, bookings: hours.get(hour) ?? 0 };
    });

    const revenueByMonth = [...months.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({
        label: format(new Date(`${key}-01`), "MMM yyyy"),
        revenue: value,
      }));

    return {
      revenue,
      paidRevenue,
      unpaidRevenue: revenue - paidRevenue,
      bookings: inRange.length,
      completed: inRange.filter((b) => b.status === "completed").length,
      cancelled: inRange.filter((b) => b.status === "cancelled").length,
      clients: clientIds.length,
      newClients,
      returningClients: clientIds.length - newClients,
      topServices,
      topSpecialists,
      busyHours,
      revenueByMonth,
    };
  }, [bookingsQuery.data, servicesQuery.data, staffQuery.data, range]);

  const rangeLabel = `${format(range.from, "d MMM yyyy")} – ${format(range.to, "d MMM yyyy")}`;

  function buildDocument(): ReportDocument {
    return {
      fileName: `dallty-report-${format(range.from, "yyyy-MM-dd")}_${format(range.to, "yyyy-MM-dd")}`,
      title: "Dallty business report",
      subtitle: `${PERIOD_LABELS[period]} · ${rangeLabel}`,
      tables: [
        {
          title: "Summary",
          headers: ["Metric", "Value"],
          rows: [
            ["Revenue", money(stats.revenue, currency)],
            ["Paid revenue", money(stats.paidRevenue, currency)],
            ["Unpaid revenue", money(stats.unpaidRevenue, currency)],
            ["Bookings", stats.bookings],
            ["Completed bookings", stats.completed],
            ["Cancelled bookings", stats.cancelled],
            ["Clients", stats.clients],
            ["Returning clients", stats.returningClients],
            ["New clients", stats.newClients],
          ],
        },
        {
          title: "Most popular services",
          headers: ["Service", "Bookings", "Revenue"],
          rows: stats.topServices.map((s) => [s.name, s.count, money(s.revenue, currency)]),
        },
        {
          title: "Top specialists",
          headers: ["Specialist", "Bookings", "Revenue"],
          rows: stats.topSpecialists.map((s) => [s.name, s.bookings, money(s.revenue, currency)]),
        },
        {
          title: "Busy hours",
          headers: ["Hour", "Bookings"],
          rows: stats.busyHours.map((h) => [h.label, h.bookings]),
        },
        {
          title: "Revenue by month",
          headers: ["Month", "Revenue"],
          rows: stats.revenueByMonth.map((m) => [m.label, money(m.revenue, currency)]),
        },
      ],
    };
  }

  async function runExport(kind: "pdf" | "excel" | "csv") {
    try {
      const doc = buildDocument();
      if (kind === "csv") exportReportCsv(doc);
      else if (kind === "excel") await exportReportExcel(doc);
      else await exportReportPdf(doc);
      toast.success(`Report exported as ${kind.toUpperCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  }

  if (businessIds.length === 0) {
    return (
      <p className="rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
        No business linked to your account yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters + exports */}
      <div className="rounded-3xl glass p-4">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`min-h-9 rounded-2xl px-3 text-xs font-bold ${
                period === p ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
          <div className="ms-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runExport("pdf")}
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-3 text-xs font-bold"
            >
              <FileText className="size-3.5" /> PDF
            </button>
            <button
              type="button"
              onClick={() => runExport("excel")}
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-3 text-xs font-bold"
            >
              <FileSpreadsheet className="size-3.5" /> Excel
            </button>
            <button
              type="button"
              onClick={() => runExport("csv")}
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-3 text-xs font-bold"
            >
              <FileDown className="size-3.5" /> CSV
            </button>
          </div>
        </div>

        {period === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-bold">
              From
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="min-h-9 rounded-xl bg-card/70 px-3 text-sm font-semibold"
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-bold">
              To
              <input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="min-h-9 rounded-xl bg-card/70 px-3 text-sm font-semibold"
              />
            </label>
          </div>
        )}

        <p className="mt-3 text-xs font-semibold text-muted-foreground">{rangeLabel}</p>
      </div>

      {/* KPI grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Revenue" value={money(stats.revenue, currency)} highlight />
        <Kpi label="Paid revenue" value={money(stats.paidRevenue, currency)} />
        <Kpi label="Unpaid revenue" value={money(stats.unpaidRevenue, currency)} />
        <Kpi label="Bookings" value={String(stats.bookings)} />
        <Kpi label="Completed bookings" value={String(stats.completed)} />
        <Kpi label="Cancelled bookings" value={String(stats.cancelled)} />
        <Kpi label="Clients" value={String(stats.clients)} />
        <Kpi label="Returning clients" value={String(stats.returningClients)} />
        <Kpi label="New clients" value={String(stats.newClients)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-3xl glass p-5">
          <h2 className="text-base font-extrabold">Revenue by month</h2>
          <div className="mt-3 h-56">
            {stats.revenueByMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground">No revenue in this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.revenueByMonth}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--primary)"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="rounded-3xl glass p-5">
          <h2 className="text-base font-extrabold">Busy hours</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.busyHours}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis
                  dataKey="label"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  interval={1}
                />
                <YAxis
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip />
                <Bar dataKey="bookings" fill="var(--gold)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl glass p-5">
          <h2 className="text-base font-extrabold">Most popular services</h2>
          <ul className="mt-3 space-y-2">
            {stats.topServices.length === 0 && (
              <li className="text-sm text-muted-foreground">No bookings in this period.</li>
            )}
            {stats.topServices.slice(0, 8).map((s) => (
              <li key={s.name} className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.name}</span>
                <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{
                      width: `${Math.round((s.count / (stats.topServices[0]?.count || 1)) * 100)}%`,
                    }}
                  />
                </span>
                <span className="w-8 shrink-0 text-end text-sm font-bold">{s.count}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-3xl glass p-5">
          <h2 className="text-base font-extrabold">Top specialists</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 text-start font-bold">Specialist</th>
                  <th className="pb-2 text-end font-bold">Bookings</th>
                  <th className="pb-2 text-end font-bold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.topSpecialists.map((s) => (
                  <tr key={s.name} className="border-t border-border/60">
                    <td className="py-2.5 font-semibold">{s.name}</td>
                    <td className="py-2.5 text-end">{s.bookings}</td>
                    <td className="py-2.5 text-end font-bold">{money(s.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.topSpecialists.length === 0 && (
              <p className="text-sm text-muted-foreground">No bookings in this period.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-3xl p-5 ${highlight ? "bg-primary text-primary-foreground" : "glass"}`}
    >
      <p
        className={`text-xs font-bold uppercase ${highlight ? "opacity-80" : "text-muted-foreground"}`}
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold">{value}</p>
    </div>
  );
}
