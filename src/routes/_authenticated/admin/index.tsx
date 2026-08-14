import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { isSameDay, startOfDay, subDays } from "date-fns";
import {
  BadgeCheck,
  Bell,
  CalendarDays,
  CalendarClock,
  CircleDashed,
  Plus,
  Scissors,
  Star,
  Store,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ListingReadiness } from "@/components/admin/listing-readiness";
import {
  money,
  useActiveCurrency,
  useManagedBookings,
  useManagedBusinesses,
  useManagedServices,
  useManagedStaff,
  useStaffServices,
} from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Business dashboard — Dallty" },
      {
        name: "description",
        content:
          "Today's bookings, estimated, paid and unpaid revenue, clients, specialists, services, reviews and marketplace status for your business.",
      },
      { property: "og:title", content: "Business dashboard — Dallty" },
      {
        property: "og:description",
        content: "A complete daily overview of your business on Dallty.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminDashboard,
});

function Widget({
  title,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  hint?: string;
  icon: typeof Users;
  tone?: "default" | "gold" | "primary";
}) {
  const toneClass =
    tone === "gold" ? "text-gold" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="rounded-3xl glass p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <p className={`mt-2 text-2xl font-extrabold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const QUICK_ACTIONS = [
  { to: "/admin/services", label: "Add service", icon: Scissors },
  { to: "/admin/staff", label: "Add specialist", icon: UserCog },
  { to: "/admin/calendar", label: "Open calendar", icon: CalendarDays },
] as const;

function AdminDashboard() {
  const { user } = useAuth();
  const businessesQuery = useManagedBusinesses();
  const businessIds = useMemo(
    () => (businessesQuery.data ?? []).map((s) => s.id),
    [businessesQuery.data],
  );
  const primary = businessesQuery.data?.[0] ?? null;
  const currency = useActiveCurrency();

  const { from, to } = useMemo(() => {
    const today = startOfDay(new Date());
    return {
      from: subDays(today, 89).toISOString(),
      to: new Date(+today + 1000 * 60 * 60 * 24 * 90).toISOString(),
    };
  }, []);

  const bookingsQuery = useManagedBookings(businessIds, from, to);
  const staffQuery = useManagedStaff(businessIds);
  const servicesQuery = useManagedServices(businessIds);
  const linksQuery = useStaffServices(businessIds);

  const reviewsQuery = useQuery({
    queryKey: ["dashboard-reviews", businessIds],
    enabled: businessIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, owner_reply")
        .in("business_id", businessIds);
      if (error) throw error;
      return data;
    },
  });

  const notificationsQuery = useQuery({
    queryKey: ["dashboard-notifications", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, read_at")
        .is("read_at", null)
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const statusQuery = useQuery({
    queryKey: ["dashboard-marketplace", primary?.id],
    enabled: Boolean(primary?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, marketplace_status, is_verified")
        .eq("id", primary!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const stats = useMemo(() => {
    const bookings = (bookingsQuery.data ?? []).filter((b) => b.status !== "cancelled");
    const now = new Date();
    const today = bookings.filter((b) => isSameDay(new Date(b.starts_at), now));
    const estimated = bookings.reduce((s, b) => s + Number(b.total_price), 0);
    const paid = bookings
      .filter((b) => b.payment_status === "paid")
      .reduce((s, b) => s + Number(b.total_price), 0);

    return {
      today: today.length,
      todayRevenue: today.reduce((s, b) => s + Number(b.total_price), 0),
      upcoming: bookings.filter((b) => new Date(b.starts_at) > now).length,
      estimated,
      paid,
      unpaid: estimated - paid,
      clients: new Set(bookings.map((b) => b.customer_id)).size,
    };
  }, [bookingsQuery.data]);

  const activeStaff = (staffQuery.data ?? []).filter((s) => s.is_active);
  const activeServices = (servicesQuery.data ?? []).filter((s) => s.is_active);
  const activeStaffIds = new Set(activeStaff.map((s) => s.id));
  const activeServiceIds = new Set(activeServices.map((s) => s.id));
  const linkedPairs = (linksQuery.data ?? []).filter(
    (l) => activeStaffIds.has(l.staff_id) && activeServiceIds.has(l.service_id),
  ).length;

  const reviews = reviewsQuery.data ?? [];
  const avgRating = reviews.length
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : "—";
  const unread = (notificationsQuery.data ?? []).length;
  const marketplaceStatus = (statusQuery.data?.marketplace_status ?? "draft").replace("_", " ");

  if (!businessesQuery.isLoading && businessIds.length === 0) {
    return (
      <p className="rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
        No business is linked to your account yet.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="press inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            <action.icon className="size-4" />
            {action.label}
            {action.to !== "/admin/calendar" ? <Plus className="size-3.5" /> : null}
          </Link>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Widget
          title="Today's bookings"
          value={String(stats.today)}
          hint={`${money(stats.todayRevenue, currency)} booked today`}
          icon={CalendarDays}
        />
        <Widget
          title="Upcoming bookings"
          value={String(stats.upcoming)}
          hint="Confirmed and pending ahead"
          icon={CalendarClock}
        />
        <Widget
          title="Estimated revenue"
          value={money(stats.estimated, currency)}
          hint="All bookings, last 90 days + future"
          icon={TrendingUp}
        />
        <Widget
          title="Paid revenue"
          value={money(stats.paid, currency)}
          hint="Bookings marked as paid"
          icon={Wallet}
          tone="primary"
        />
        <Widget
          title="Unpaid revenue"
          value={money(stats.unpaid, currency)}
          hint="Still to collect"
          icon={CircleDashed}
          tone="gold"
        />
        <Widget title="Clients" value={String(stats.clients)} hint="Unique customers" icon={Users} />
        <Widget
          title="Specialists"
          value={String(activeStaff.length)}
          hint={`${linkedPairs} service assignments`}
          icon={UserCog}
        />
        <Widget
          title="Services"
          value={String(activeServices.length)}
          hint="Active in your menu"
          icon={Scissors}
        />
        <Widget
          title="Reviews"
          value={String(reviews.length)}
          hint={`Average rating ${avgRating}`}
          icon={Star}
        />
        <Widget
          title="Notifications"
          value={String(unread)}
          hint="Unread alerts"
          icon={Bell}
          tone={unread ? "gold" : "default"}
        />
        <Widget
          title="Marketplace status"
          value={marketplaceStatus.charAt(0).toUpperCase() + marketplaceStatus.slice(1)}
          hint={primary?.is_listed ? "Visible in search" : "Not listed yet"}
          icon={Store}
        />
        <Widget
          title="Verification"
          value={statusQuery.data?.is_verified ? "Verified" : "Not verified"}
          hint="Granted by the Dallty team"
          icon={BadgeCheck}
          tone={statusQuery.data?.is_verified ? "primary" : "default"}
        />
      </section>

      {primary ? (
        <ListingReadiness
          businessName={primary.name}
          isListed={Boolean(primary.is_listed)}
          status={primary.status}
          activeServices={activeServices.length}
          activeStaff={activeStaff.length}
          linkedPairs={linkedPairs}
        />
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <Link to="/admin/payments" className="press rounded-3xl glass p-5 text-sm font-bold">
          Payments
          <span className="mt-1 block text-xs font-medium text-muted-foreground">
            Mark bookings paid and track collection
          </span>
        </Link>
        <Link to="/admin/reports" className="press rounded-3xl glass p-5 text-sm font-bold">
          Reports
          <span className="mt-1 block text-xs font-medium text-muted-foreground">
            Revenue trends and specialist performance
          </span>
        </Link>
        <Link to="/admin/marketplace" className="press rounded-3xl glass p-5 text-sm font-bold">
          Marketplace status
          <span className="mt-1 block text-xs font-medium text-muted-foreground">
            Listing, verification and readiness
          </span>
        </Link>
      </section>
    </div>
  );
}
