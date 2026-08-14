import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, startOfDay, subDays } from "date-fns";
import {
  ArrowLeft,
  CalendarCheck,
  CalendarClock,
  Loader2,
  Settings2,
  Star,
  TrendingUp,
  UserX,
  Users,
} from "lucide-react";
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

import { formatMoney } from "@/lib/countries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Salon dashboard — Dallty" },
      {
        name: "description",
        content:
          "Track today's revenue, appointments, staff occupancy, popular services and peak hours for your salon in one live dashboard.",
      },
      { property: "og:title", content: "Salon dashboard — Dallty" },
      {
        property: "og:description",
        content: "Live revenue, bookings and staff performance for your salon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});



function Metric({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-3xl glass p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function DashboardPage() {
  const { user, hasRole, loading } = useAuth();
  const isOwner = hasRole("business_owner") || hasRole("admin");

  const salonsQuery = useQuery({
    queryKey: ["my-salons", user?.id],
    enabled: Boolean(user) && isOwner,
    queryFn: async () => {
      const { data, error } = await supabase.from("salons").select("id, name, currency").order("name");
      if (error) throw error;
      return data;
    },
  });

  const salonIds = (salonsQuery.data ?? []).map((s) => s.id);
  const currency = salonsQuery.data?.[0]?.currency ?? "AED";

  const bookingsQuery = useQuery({
    queryKey: ["dashboard-bookings", salonIds],
    enabled: salonIds.length > 0,
    queryFn: async () => {
      const since = subDays(startOfDay(new Date()), 29).toISOString();
      const { data, error } = await supabase
        .from("bookings")
        .select("id, customer_id, salon_id, service_id, staff_id, starts_at, status, total_price")
        .in("salon_id", salonIds)
        .gte("starts_at", since)
        .lte("starts_at", addDays(new Date(), 30).toISOString());
      if (error) throw error;
      return data;
    },
  });

  const servicesQuery = useQuery({
    queryKey: ["dashboard-services", salonIds],
    enabled: salonIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name")
        .in("salon_id", salonIds);
      if (error) throw error;
      return data;
    },
  });

  const staffQuery = useQuery({
    queryKey: ["dashboard-staff", salonIds],
    enabled: salonIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, full_name")
        .in("salon_id", salonIds)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const reviewsQuery = useQuery({
    queryKey: ["dashboard-reviews", salonIds],
    enabled: salonIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, body, owner_reply, created_at")
        .in("salon_id", salonIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const stats = useMemo(() => {
    const bookings = bookingsQuery.data ?? [];
    const services = servicesQuery.data ?? [];
    const staff = staffQuery.data ?? [];
    const now = new Date();
    const todayKey = format(now, "yyyy-MM-dd");
    const today = bookings.filter((b) => format(new Date(b.starts_at), "yyyy-MM-dd") === todayKey);
    const paid = (b: (typeof bookings)[number]) =>
      b.status === "completed" || b.status === "confirmed";

    const revenueSeries = Array.from({ length: 14 }).map((_, i) => {
      const day = subDays(startOfDay(now), 13 - i);
      const key = format(day, "yyyy-MM-dd");
      const dayBookings = bookings.filter(
        (b) => format(new Date(b.starts_at), "yyyy-MM-dd") === key,
      );
      return {
        day: format(day, "d MMM"),
        revenue: dayBookings.filter(paid).reduce((sum, b) => sum + Number(b.total_price), 0),
        bookings: dayBookings.length,
      };
    });

    const peakHours = Array.from({ length: 14 }).map((_, i) => {
      const hour = i + 8;
      return {
        hour: `${hour}:00`,
        bookings: bookings.filter((b) => new Date(b.starts_at).getHours() === hour).length,
      };
    });

    const serviceCounts = services
      .map((service) => ({
        name: service.name,
        count: bookings.filter((b) => b.service_id === service.id).length,
      }))
      .filter((s) => s.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const staffStats = staff
      .map((member) => {
        const mine = bookings.filter((b) => b.staff_id === member.id);
        return {
          name: member.full_name,
          bookings: mine.length,
          revenue: mine.filter(paid).reduce((sum, b) => sum + Number(b.total_price), 0),
          today: mine.filter((b) => format(new Date(b.starts_at), "yyyy-MM-dd") === todayKey).length,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const customers = new Set(bookings.map((b) => b.customer_id));
    const newCustomers = new Set(
      bookings
        .filter((b) => new Date(b.starts_at) >= subDays(now, 7))
        .map((b) => b.customer_id),
    );

    // Occupancy: booked slots today against roughly 16 half-hour slots per specialist.
    const capacity = Math.max(staff.length * 16, 1);
    const occupancy = Math.min(
      100,
      Math.round((today.filter((b) => b.status !== "cancelled").length / capacity) * 100),
    );

    return {
      todayRevenue: today.filter(paid).reduce((sum, b) => sum + Number(b.total_price), 0),
      todayCount: today.length,
      upcoming: bookings.filter((b) => new Date(b.starts_at) > now && b.status !== "cancelled")
        .length,
      completed: bookings.filter((b) => b.status === "completed").length,
      cancelled: bookings.filter((b) => b.status === "cancelled").length,
      noShows: bookings.filter(
        (b) => b.status === "pending" && new Date(b.starts_at) < now,
      ).length,
      revenueSeries,
      peakHours,
      serviceCounts,
      staffStats,
      customers: customers.size,
      newCustomers: newCustomers.size,
      occupancy,
    };
  }, [bookingsQuery.data, servicesQuery.data, staffQuery.data]);

  const pendingReviews = (reviewsQuery.data ?? []).filter((r) => !r.owner_reply);

  if (loading) {
    return (
      <main className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="mx-auto max-w-md px-4 pt-16 text-center">
        <h1 className="text-2xl font-extrabold">Owners only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This dashboard is available to salon owners. Head to your bookings instead.
        </p>
        <Link
          to="/bookings"
          className="press mt-6 inline-flex min-h-11 items-center rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground"
        >
          My bookings
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" aria-label="Back home" className="press grid size-10 place-items-center rounded-2xl glass-soft">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight">Salon dashboard</h1>
        <Link
          to="/admin/availability"
          search={{ staff: undefined }}
          className="press ms-auto flex min-h-10 items-center gap-2 rounded-2xl glass-soft px-4 text-sm font-bold"
        >
          <Settings2 className="size-4" />
          Availability
        </Link>
      </div>

      {!salonIds.length && !salonsQuery.isLoading && (
        <p className="mt-8 rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
          No salon is linked to your account yet.
        </p>
      )}

      {salonIds.length > 0 && (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              title="Today's revenue"
              value={formatMoney(stats.todayRevenue, currency)}
              hint={`${stats.todayCount} appointment${stats.todayCount === 1 ? "" : "s"} today`}
              icon={TrendingUp}
            />
            <Metric
              title="Upcoming"
              value={String(stats.upcoming)}
              hint={`${stats.completed} completed in 30 days`}
              icon={CalendarClock}
            />
            <Metric
              title="Staff occupancy"
              value={`${stats.occupancy}%`}
              hint="Today, across active specialists"
              icon={CalendarCheck}
            />
            <Metric
              title="Customers"
              value={String(stats.customers)}
              hint={`${stats.newCustomers} active in the last 7 days`}
              icon={Users}
            />
          </section>

          <section className="mt-4 grid gap-3 sm:grid-cols-3">
            <Metric title="Cancelled" value={String(stats.cancelled)} icon={UserX} />
            <Metric title="Possible no-shows" value={String(stats.noShows)} icon={UserX} />
            <Metric
              title="Reviews awaiting reply"
              value={String(pendingReviews.length)}
              icon={Star}
            />
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl glass p-5">
              <h2 className="text-lg font-extrabold">Revenue, last 14 days</h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.revenueSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={2} />
                    <YAxis tick={{ fontSize: 11 }} width={40} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 16,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--primary)"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl glass p-5">
              <h2 className="text-lg font-extrabold">Bookings, last 14 days</h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.revenueSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={2} />
                    <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 16,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                      }}
                    />
                    <Bar dataKey="bookings" fill="var(--primary)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl glass p-5">
              <h2 className="text-lg font-extrabold">Peak hours</h2>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.peakHours}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval={1} />
                    <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 16,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                      }}
                    />
                    <Bar dataKey="bookings" fill="var(--gold)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-3xl glass p-5">
              <h2 className="text-lg font-extrabold">Popular services</h2>
              <ul className="mt-4 space-y-3">
                {stats.serviceCounts.map((service) => (
                  <li key={service.name} className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {service.name}
                    </span>
                    <span className="h-2 w-28 overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full bg-primary"
                        style={{
                          width: `${(service.count / stats.serviceCounts[0].count) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="w-6 text-end text-sm font-bold">{service.count}</span>
                  </li>
                ))}
                {!stats.serviceCounts.length && (
                  <li className="text-sm text-muted-foreground">No bookings in this period yet.</li>
                )}
              </ul>
            </div>
          </section>

          <section className="mt-6 rounded-3xl glass p-5">
            <h2 className="text-lg font-extrabold">Team performance</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 text-start font-bold">Specialist</th>
                    <th className="pb-2 text-end font-bold">Today</th>
                    <th className="pb-2 text-end font-bold">Bookings</th>
                    <th className="pb-2 text-end font-bold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.staffStats.map((member) => (
                    <tr key={member.name} className="border-t border-border/60">
                      <td className="py-2.5 font-semibold">{member.name}</td>
                      <td className="py-2.5 text-end">{member.today}</td>
                      <td className="py-2.5 text-end">{member.bookings}</td>
                      <td className="py-2.5 text-end font-bold">
                        {formatMoney(member.revenue, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!stats.staffStats.length && (
                <p className="text-sm text-muted-foreground">No active specialists yet.</p>
              )}
            </div>
          </section>

          {pendingReviews.length > 0 && (
            <section className="mt-6 rounded-3xl glass p-5">
              <h2 className="text-lg font-extrabold">Reviews awaiting your reply</h2>
              <ul className="mt-3 space-y-3">
                {pendingReviews.slice(0, 5).map((review) => (
                  <li key={review.id} className="rounded-2xl glass-soft p-4">
                    <p className="text-sm font-bold">
                      {"★".repeat(review.rating)}
                      <span className="text-muted-foreground">{"★".repeat(5 - review.rating)}</span>
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{review.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
