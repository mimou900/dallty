import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  BadgeCheck,
  BellRing,
  CalendarClock,
  CalendarDays,
  Info,
  MapPin,
  Phone,
  Receipt,
  RotateCcw,
  Star,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { formatMoney } from "@/lib/countries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { landingForRoles, resolveLanding } from "@/lib/post-login";
import { useManagedBusinesses } from "@/lib/admin";
import { claimGuestBookingsForCurrentUser } from "@/lib/account.functions";
import { ClientShell } from "@/components/dallty/client-shell";
import { useTranslation } from "@/lib/i18n/hooks";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

// Real, customer-facing booking states this page can show — the DB enum also has
// `held`/`expired` (internal checkout-hold mechanics, see the query below) which
// never represent a booking a customer actually has, so they're excluded at the
// query level rather than merely hidden here.
const STATUS_FILTERS = ["all", "confirmed", "pending", "cancelled", "completed"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

export const Route = createFileRoute("/_authenticated/bookings")({
  // Owners/staff/admins manage appointments in their own dashboard — never here.
  // Booking itself stays open to every role; only this list view is customer-only.
  beforeLoad: async ({ context }) => {
    const userId = (context as { user?: { id: string } }).user?.id;
    if (!userId) return;
    const landing = await resolveLanding(userId);
    if (landing !== "/bookings") throw redirect({ to: landing, replace: true });
  },
  // `?open=<bookingId>` auto-opens that booking's detail drawer — the target every
  // notification's deep_link points at (see notify_booking_audience() /
  // notify_waitlist_on_free_slot()), since there's no separate /bookings/:id route.
  // `?status=` persists the active status tab across refresh/back-forward — purely
  // a URL-state convenience, filtering itself stays client-side (see body below).
  // `status` stays optional in this return type (even though the body always
  // resolves a concrete value) so every existing `<Link to="/bookings">` /
  // `navigate({ to: "/bookings" })` elsewhere in the app — none of which pass a
  // `search` object at all — keeps type-checking; the component defaults it
  // to "all" itself (see `activeStatus`).
  validateSearch: (search: Record<string, unknown>): { open?: string; status?: StatusFilter } => ({
    open: typeof search.open === "string" ? search.open : undefined,
    status: STATUS_FILTERS.includes(search.status as StatusFilter)
      ? (search.status as StatusFilter)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Your bookings — Dallty" },
      {
        name: "description",
        content:
          "Track upcoming salon appointments, manage your calendar and cancel or confirm in one tap.",
      },
      { property: "og:title", content: "Your bookings — Dallty" },
      { property: "og:description", content: "Your Dallty appointment calendar in one place." },
    ],
  }),
  component: BookingsPage,
});

type BookingRow = {
  id: string;
  business_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  total_price: number;
  reference: string;
  discount_amount: number;
  original_price: number | null;
  payment_status: string;
  businesses: {
    name: string;
    slug: string;
    area: string;
    currency?: string;
    timezone?: string;
    address?: string | null;
    city?: string | null;
    maps_url?: string | null;
    phone?: string | null;
    image_url?: string | null;
    is_verified?: boolean;
  } | null;
  services: { id: string; name: string; duration_minutes: number } | null;
  staff: { id: string; full_name: string } | null;
};

type WaitlistRow = {
  id: string;
  day: string;
  status: string;
  business_id: string;
  businesses: { name: string; slug: string } | null;
  services: { name: string } | null;
  staff: { full_name: string } | null;
};

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Pay at salon",
  payment_pending: "Payment pending",
  paid: "Paid",
  refunded: "Refunded",
  deposit_required: "Deposit required",
  deposit_pending: "Deposit pending",
  deposit_paid: "Deposit paid",
};

const PAYMENT_TONE: Record<string, string> = {
  paid: "bg-primary/10 text-primary",
  deposit_paid: "bg-primary/10 text-primary",
  refunded: "bg-muted text-muted-foreground",
  payment_pending: "bg-gold/15 text-gold",
  deposit_pending: "bg-gold/15 text-gold",
  deposit_required: "bg-gold/15 text-gold",
  unpaid: "bg-secondary text-foreground",
};

// One universal booking-status vocabulary (brief §15) — the tab bar, every
// card, and the detail drawer all read from this same pair of maps, so the
// label and tone can never drift between the filter and what a card shows.
// `no_show` shares Cancelled's tone/bucket (see STATUS_TO_TAB) rather than
// getting a 6th tab — it's real, but rare enough not to earn its own tab.
const STATUS_LABEL_KEY: Record<string, NamespaceKeyMap["booking"]> = {
  confirmed: "status.confirmed",
  pending: "status.pending",
  cancelled: "status.cancelled",
  completed: "status.completed",
  no_show: "status.no_show",
};

const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary",
  pending: "bg-gold/15 text-gold",
  cancelled: "bg-destructive/10 text-destructive",
  no_show: "bg-destructive/10 text-destructive",
  completed: "bg-muted text-muted-foreground",
};

/** A negative-outcome, terminal booking — no Reschedule/Cancel makes sense
 *  for either (brief §34). */
function isTerminalNegative(status: string) {
  return status === "cancelled" || status === "no_show";
}

function StatusPill({ status, inverted }: { status: string; inverted?: boolean }) {
  const { t } = useTranslation("booking");
  const label = t(STATUS_LABEL_KEY[status] ?? "status.completed");
  const tone = inverted
    ? "bg-primary-foreground/15 text-primary-foreground"
    : (STATUS_TONE[status] ?? "bg-secondary text-foreground");
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

/** Horizontally-scrollable status nav (brief §1/§2/§16/§26) — replaces the old
 *  role pill. Never shrinks its own text to fit; on narrow phones it scrolls
 *  instead (same pattern as the search page's date-nav row). */
function StatusTabs({ active, onChange }: { active: StatusFilter; onChange: (next: StatusFilter) => void }) {
  const { t } = useTranslation("booking");
  const tabs: { key: StatusFilter; label: string }[] = [
    { key: "all", label: t("customer.filter_all") },
    { key: "confirmed", label: t("status.confirmed") },
    { key: "pending", label: t("status.pending") },
    { key: "cancelled", label: t("status.cancelled") },
    { key: "completed", label: t("status.completed") },
  ];
  return (
    <div
      role="tablist"
      aria-label={t("customer.page_title")}
      className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
    >
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.key)}
            className={`press shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-3xl border border-border/60 bg-card p-8 text-center">
      <CalendarDays className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold text-muted-foreground">{message}</p>
    </div>
  );
}

function mapsHref(business: BookingRow["businesses"]) {
  if (!business) return null;
  if (business.maps_url) return business.maps_url;
  const q = [business.name, business.address, business.area, business.city]
    .filter(Boolean)
    .join(", ");
  if (!q) return null;
  // Directions, not a plain search — "Get directions" now explicitly promises
  // routing, not just a pin. Never fed a lat/lng here: this app's coordinates
  // are approximate map-display jitter (see wilaya-coords.ts), not a verified
  // exact location — using them for turn-by-turn navigation would be exactly
  // the false precision the brief prohibits (§11).
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}

function BookingsPage() {
  const { user, primaryRole, roles } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { open: openParam, status } = Route.useSearch();
  const statusFilter: StatusFilter = status ?? "all";
  const { t } = useTranslation("booking");
  const isManager = primaryRole !== "client";
  const [pendingCancel, setPendingCancel] = useState<BookingRow | null>(null);
  const cancelling = Boolean(pendingCancel);
  const [detailId, setDetailId] = useState<string | null>(null);
  const managedBusinesses = useManagedBusinesses();

  function closeDetail() {
    setDetailId(null);
    if (openParam) navigate({ to: "/bookings", search: (prev) => ({ ...prev, open: undefined }), replace: true });
  }

  function setStatusFilter(next: StatusFilter) {
    navigate({
      to: "/bookings",
      search: (prev) => ({ ...prev, status: next === "all" ? undefined : next }),
      replace: true,
    });
  }

  // Business accounts manage appointments in their own dashboard, not here.
  // Business owners with no business yet resume the creation wizard instead
  // of bouncing to an empty /admin.
  useEffect(() => {
    if (!isManager) return;
    if (primaryRole === "business_owner") {
      if (managedBusinesses.isLoading) return;
      const owns = (managedBusinesses.data?.length ?? 0) > 0;
      navigate({ to: owns ? "/admin" : "/business/signup", replace: true });
      return;
    }
    navigate({ to: landingForRoles(roles), replace: true });
  }, [
    isManager,
    primaryRole,
    managedBusinesses.isLoading,
    managedBusinesses.data,
    roles,
    navigate,
  ]);

  // One-time, idempotent: attach any guest bookings placed under this
  // account's email before it existed. Safe no-op when there's nothing to
  // claim; runs regardless of which sign-in method was used.
  const claimedOnce = useRef(false);
  useEffect(() => {
    if (!user || claimedOnce.current) return;
    claimedOnce.current = true;
    claimGuestBookingsForCurrentUser()
      .then(({ claimed }) => {
        if (claimed > 0) {
          queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
          toast.success(
            claimed === 1
              ? "Linked a previous booking to your account"
              : `Linked ${claimed} previous bookings to your account`,
          );
        }
      })
      .catch(() => {});
  }, [user, queryClient]);

  const bookingsQuery = useQuery({
    queryKey: ["my-bookings", user?.id, primaryRole],
    enabled: Boolean(user),
    queryFn: async () => {
      const query = supabase
        .from("bookings")
        .select(
          "id, business_id, starts_at, ends_at, status, total_price, reference, discount_amount, original_price, payment_status, businesses(name, slug, area, currency, timezone, address, city, maps_url, phone, image_url, is_verified), services(id, name, duration_minutes), staff(id, full_name)",
        )
        // `held`/`expired` are checkout-hold mechanics, never a real booking
        // the customer should see — excluded here, not just hidden in the UI.
        .not("status", "in", "(held,expired)")
        .order("starts_at", { ascending: true });
      const { data, error } =
        primaryRole === "client" ? await query.eq("customer_id", user!.id) : await query;
      if (error) throw error;
      return data as unknown as BookingRow[];
    },
  });

  const waitlistQuery = useQuery({
    queryKey: ["my-waitlist", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist_entries")
        .select(
          "id, day, status, business_id, businesses(name, slug), services(name), staff(full_name)",
        )
        .in("status", ["waiting", "notified"])
        .order("day");
      if (error) throw error;
      return data as unknown as WaitlistRow[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("my-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waitlist_entries" },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["my-waitlist"] });
          const next = payload.new as { status?: string } | null;
          if (next?.status === "notified") {
            toast.success("A slot just opened up — a spot on your waitlist is free!");
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function updateStatus(id: string, status: "confirmed" | "cancelled") {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "cancelled" ? "Booking cancelled" : `Marked as ${status}`);
    queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
  }

  async function leaveWaitlist(id: string) {
    const { error } = await supabase.from("waitlist_entries").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["my-waitlist"] });
  }

  // Deep link from a notification ("?open=<id>") auto-opens that booking's drawer once
  // the list has loaded far enough to actually contain it.
  useEffect(() => {
    if (openParam) setDetailId(openParam);
  }, [openParam]);

  const bookings = bookingsQuery.data ?? [];
  const detailBooking = bookings.find((b) => b.id === detailId) ?? null;

  // The single next appointment, and everything else upcoming — derived once,
  // off the same array, so a booking can never appear in both (brief §8/§33):
  // `upcomingRest` is `active` minus its own first element, never a second
  // independent filter that could disagree with `nextUp`.
  const active = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            (b.status === "confirmed" || b.status === "pending") &&
            new Date(b.starts_at).getTime() >= Date.now(),
        )
        .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()),
    [bookings],
  );
  const nextUp = active[0] ?? null;
  const upcomingRest = active.slice(1);

  // A specific status tab filters the REAL status column (brief §33), not a
  // time-based inference — Confirmed/Pending/Completed can include past rows,
  // exactly as the underlying data says.
  const filteredBookings = useMemo(() => {
    if (statusFilter === "all") return [];
    if (statusFilter === "cancelled") {
      return bookings.filter((b) => isTerminalNegative(b.status));
    }
    return bookings.filter((b) => b.status === statusFilter);
  }, [bookings, statusFilter]);

  const hasAnyBookings = bookings.length > 0;

  return (
    <ClientShell
      title={isManager ? "Business calendar" : t("customer.page_title")}
      subtitle={
        isManager
          ? "Every appointment you can manage, updating live."
          : t("customer.page_subtitle")
      }
      surface={isManager ? "default" : "cream"}
      atmosphere={isManager}
    >
      <div>
        <StatusTabs active={statusFilter} onChange={setStatusFilter} />

        {bookingsQuery.isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : !hasAnyBookings ? (
          <div className="mt-6 rounded-3xl border border-border/60 bg-card p-8 text-center">
            <CalendarDays className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-bold">{t("customer.no_bookings_title")}</p>
            <Link
              to="/"
              className="press mt-5 inline-flex min-h-12 items-center rounded-2xl bg-primary px-6 font-bold text-primary-foreground"
            >
              {t("customer.discover_cta")}
            </Link>
          </div>
        ) : statusFilter === "all" ? (
          nextUp ? (
            <>
              <NextAppointmentCard
                booking={nextUp}
                onRequestCancel={setPendingCancel}
                onOpenDetail={setDetailId}
              />
              {upcomingRest.length > 0 && (
                <Section
                  title={t("customer.upcoming")}
                  items={upcomingRest}
                  onUpdate={updateStatus}
                  onOpenDetail={setDetailId}
                  isManager={isManager}
                />
              )}
            </>
          ) : (
            <EmptyState message={t("customer.empty_all")} />
          )
        ) : filteredBookings.length > 0 ? (
          <Section
            title={null}
            items={filteredBookings}
            onUpdate={updateStatus}
            onOpenDetail={setDetailId}
            isManager={isManager}
          />
        ) : (
          <EmptyState
            message={t(
              statusFilter === "confirmed"
                ? "customer.empty_confirmed"
                : statusFilter === "pending"
                  ? "customer.empty_pending"
                  : statusFilter === "cancelled"
                    ? "customer.empty_cancelled"
                    : "customer.empty_completed",
            )}
          />
        )}

        {(waitlistQuery.data?.length ?? 0) > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <BellRing className="size-4 text-primary" />
              Waitlist
            </h2>
            <div className="space-y-3">
              {waitlistQuery.data?.map((w) => (
                <article key={w.id} className="rounded-3xl glass p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-extrabold">{w.services?.name}</h3>
                      <p className="truncate text-sm text-muted-foreground">
                        {w.businesses?.name} · {w.staff?.full_name} ·{" "}
                        {format(new Date(w.day), "EEE d MMM")}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                        w.status === "notified"
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary"
                      }`}
                    >
                      {w.status === "notified" ? "Slot open" : "Waiting"}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      to="/business/$businessSlug"
                      params={{ businessSlug: w.businesses?.slug ?? "" }}
                      className="press flex min-h-10 items-center rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
                    >
                      {w.status === "notified" ? "Book the free slot" : "View availability"}
                    </Link>
                    <button
                      type="button"
                      onClick={() => leaveWaitlist(w.id)}
                      className="flex min-h-10 items-center gap-1.5 rounded-2xl glass-soft px-4 text-sm font-semibold"
                    >
                      <X className="size-4" />
                      Leave
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <AlertDialog open={cancelling} onOpenChange={(open) => !open && setPendingCancel(null)}>
          <AlertDialogContent className="rounded-3xl border-0 bg-background p-0 sm:rounded-3xl">
            <div className="p-6">
              <AlertDialogHeader className="text-start">
                <AlertDialogTitle className="text-xl font-extrabold">
                  {t("customer.cancel_title")}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm leading-relaxed">
                  {t("cancel_confirm_body")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {pendingCancel && (
                <div className="mt-4 rounded-2xl bg-muted p-4 text-sm">
                  <p className="font-extrabold">{pendingCancel.services?.name}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {pendingCancel.businesses?.name} · {pendingCancel.staff?.full_name}
                  </p>
                  <p className="mt-2 font-semibold">
                    {format(new Date(pendingCancel.starts_at), "EEE d MMM · HH:mm")}
                  </p>
                </div>
              )}
            </div>
            <AlertDialogFooter className="flex-col-reverse gap-2 border-t p-4 sm:flex-col-reverse">
              <AlertDialogCancel
                onClick={() => setPendingCancel(null)}
                className="min-h-12 w-full rounded-2xl border-0 bg-muted font-bold text-foreground hover:bg-muted/80"
              >
                {t("customer.keep")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!pendingCancel) return;
                  const id = pendingCancel.id;
                  setPendingCancel(null);
                  await updateStatus(id, "cancelled");
                }}
                className="min-h-12 w-full rounded-2xl bg-destructive font-bold text-destructive-foreground hover:bg-destructive/90"
              >
                {t("customer.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <BookingDetailDrawer
          booking={detailBooking}
          open={Boolean(detailId)}
          onClose={closeDetail}
          onRequestCancel={setPendingCancel}
        />
      </div>
    </ClientShell>
  );
}

/** The one, non-duplicated hero card (brief §7/§8/§12). Call/Directions are
 *  the two prominent actions; Reschedule/Cancel drop to small text-style
 *  secondary links below them (brief §9) — not four equal buttons. */
function NextAppointmentCard({
  booking,
  onRequestCancel,
  onOpenDetail,
}: {
  booking: BookingRow;
  onRequestCancel: (booking: BookingRow) => void;
  onOpenDetail: (id: string) => void;
}) {
  const { t } = useTranslation("booking");
  const directionsHref = mapsHref(booking.businesses);
  const phone = booking.businesses?.phone;
  const showSecondaryActions = !isTerminalNegative(booking.status);

  return (
    <section className="mt-4 overflow-hidden rounded-3xl bg-primary text-primary-foreground">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenDetail(booking.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onOpenDetail(booking.id);
        }}
        className="cursor-pointer p-5 pb-0"
      >
        <p className="text-[0.7rem] font-bold uppercase tracking-wide opacity-80">
          {t("customer.next_appointment")}
        </p>
        <h2 className="mt-2 truncate text-lg font-extrabold">{booking.services?.name}</h2>
        <div className="mt-1.5">
          <StatusPill status={booking.status} inverted />
        </div>
        <p className="mt-2 truncate text-sm opacity-90">
          {booking.businesses?.name}
          {booking.staff?.full_name ? ` · ${booking.staff.full_name}` : ""}
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm font-bold">
          <CalendarDays className="size-4" />
          {format(new Date(booking.starts_at), "EEE d MMM · HH:mm")}
        </p>
      </div>

      <div className="p-5 pt-4">
        {(phone || directionsHref) && (
          <div className={`grid gap-2 ${phone && directionsHref ? "grid-cols-2" : "grid-cols-1"}`}>
            {phone && (
              <a
                href={`tel:${phone}`}
                className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-background px-4 text-sm font-extrabold text-foreground"
              >
                <Phone className="size-4" />
                {t("customer.call_salon")}
              </a>
            )}
            {directionsHref && (
              <a
                href={directionsHref}
                target="_blank"
                rel="noreferrer"
                className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-primary-foreground/40 px-4 text-sm font-bold"
              >
                <MapPin className="size-4" />
                {t("customer.get_directions")}
              </a>
            )}
          </div>
        )}

        {showSecondaryActions && (
          <div className="mt-3 flex items-center gap-5 text-sm font-semibold opacity-90">
            <Link
              to="/reschedule/$bookingId"
              params={{ bookingId: booking.id }}
              className="press underline-offset-4 hover:underline"
            >
              {t("customer.reschedule")}
            </Link>
            <button
              type="button"
              onClick={() => onRequestCancel(booking)}
              className="press underline-offset-4 hover:underline"
            >
              {t("customer.cancel")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function Section({
  title,
  items,
  onUpdate,
  onOpenDetail,
  isManager,
}: {
  title: string | null;
  items: BookingRow[];
  onUpdate: (id: string, status: "confirmed" | "cancelled") => void;
  onOpenDetail: (id: string) => void;
  isManager: boolean;
}) {
  const { t } = useTranslation("booking");
  if (items.length === 0) return null;
  return (
    <section className={title ? "mt-8" : "mt-6"}>
      {title && (
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
      )}
      <div className="space-y-3">
        {items.map((b) => (
          <article
            key={b.id}
            role="button"
            tabIndex={0}
            onClick={() => onOpenDetail(b.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") onOpenDetail(b.id);
            }}
            className="cursor-pointer rounded-3xl border border-border/60 bg-card p-5 transition-colors hover:border-border"
          >
            <div className="min-w-0">
              <h3 className="truncate text-base font-extrabold">{b.services?.name}</h3>
              <div className="mt-1.5">
                <StatusPill status={b.status} />
              </div>
              <p className="mt-2 truncate text-sm text-muted-foreground">
                {b.businesses?.name}
                {b.staff?.full_name ? ` · ${b.staff.full_name}` : ""}
              </p>
              {b.reference && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("customer.reference_label")} #{b.reference}
                </p>
              )}
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4 text-primary" />
              {format(new Date(b.starts_at), "EEE d MMM · HH:mm")} –{" "}
              {format(new Date(b.ends_at), "HH:mm")}
            </p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="flex flex-wrap items-baseline gap-2">
                {b.original_price != null && b.original_price > b.total_price && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatMoney(b.original_price, b.businesses?.currency ?? undefined)}
                  </span>
                )}
                <span className="text-lg font-extrabold">
                  {formatMoney(b.total_price, b.businesses?.currency ?? undefined)}
                </span>
                {!isTerminalNegative(b.status) && PAYMENT_LABEL[b.payment_status] && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PAYMENT_TONE[b.payment_status] ?? "bg-secondary text-foreground"}`}
                  >
                    {PAYMENT_LABEL[b.payment_status]}
                  </span>
                )}
              </div>
              {b.status === "pending" && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate(b.id, "confirmed");
                  }}
                  className="press min-h-10 shrink-0 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
                >
                  {isManager ? "Confirm" : t("customer.confirm_slot")}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const DRAWER_ACTION =
  "flex min-h-11 items-center justify-center gap-1.5 rounded-2xl glass-soft px-3 text-sm font-semibold";

function BookingDetailDrawer({
  booking,
  open,
  onClose,
  onRequestCancel,
}: {
  booking: BookingRow | null;
  open: boolean;
  onClose: () => void;
  onRequestCancel: (booking: BookingRow) => void;
}) {
  const { t } = useTranslation("booking");
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="mt-6 h-[92dvh] rounded-t-3xl border-border bg-background p-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press absolute end-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-secondary text-foreground"
        >
          <X className="size-5" />
        </button>
        <DrawerTitle className="sr-only">Booking details</DrawerTitle>
        {booking && (
          <div className="flex h-full flex-col overflow-y-auto">
            <div className="relative h-40 shrink-0 overflow-hidden bg-muted">
              <img
                src={booking.businesses?.image_url || "/salons/hair.jpg"}
                alt={booking.businesses?.name ?? ""}
                className="size-full object-cover"
              />
              <div aria-hidden className="photo-scrim absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <StatusPill status={booking.status} />
              </div>
            </div>

            <div className="flex-1 space-y-5 p-5 pb-8">
              <div>
                <h2 className="flex items-center gap-1.5 text-xl font-extrabold">
                  {booking.services?.name}
                  {booking.businesses?.is_verified && (
                    <BadgeCheck
                      className="size-4 shrink-0 text-primary"
                      aria-label="Verified by Dallty"
                    />
                  )}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {booking.businesses?.name} · {booking.staff?.full_name}
                </p>
                {booking.reference && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Receipt className="size-3.5" />
                    {t("customer.reference_label")} #{booking.reference}
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-muted/60 p-4">
                <p className="flex items-center gap-2 text-sm font-bold">
                  <CalendarDays className="size-4 text-primary" />
                  {format(new Date(booking.starts_at), "EEEE d MMMM · HH:mm")} –{" "}
                  {format(new Date(booking.ends_at), "HH:mm")}
                </p>
                {(booking.businesses?.address || booking.businesses?.area) && (
                  <p className="mt-1.5 flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0" />
                    {[
                      booking.businesses?.address,
                      booking.businesses?.area,
                      booking.businesses?.city,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-border/60 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Invoice
                </p>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{booking.services?.name}</span>
                    <span className="font-semibold">
                      {formatMoney(
                        booking.original_price ?? booking.total_price,
                        booking.businesses?.currency ?? undefined,
                      )}
                    </span>
                  </div>
                  {booking.discount_amount > 0 && (
                    <div className="flex items-center justify-between text-primary">
                      <span>Discount</span>
                      <span className="font-semibold">
                        -
                        {formatMoney(
                          booking.discount_amount,
                          booking.businesses?.currency ?? undefined,
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between border-t border-border/60 pt-2 text-base font-extrabold">
                    <span>Total</span>
                    <span>
                      {formatMoney(booking.total_price, booking.businesses?.currency ?? undefined)}
                    </span>
                  </div>
                  {PAYMENT_LABEL[booking.payment_status] && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-muted-foreground">Payment</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${PAYMENT_TONE[booking.payment_status] ?? "bg-secondary text-foreground"}`}
                      >
                        {PAYMENT_LABEL[booking.payment_status]}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {booking.businesses?.phone && (
                <a
                  href={`tel:${booking.businesses.phone}`}
                  className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"
                >
                  <Phone className="size-4" />
                  {t("customer.call_salon")}
                </a>
              )}

              <div className="grid grid-cols-2 gap-2">
                {mapsHref(booking.businesses) && (
                  <a
                    href={mapsHref(booking.businesses)!}
                    target="_blank"
                    rel="noreferrer"
                    className={DRAWER_ACTION}
                  >
                    <MapPin className="size-4" />
                    {t("customer.get_directions")}
                  </a>
                )}
                <Link
                  to="/business/$businessSlug"
                  params={{ businessSlug: booking.businesses?.slug ?? "" }}
                  className={DRAWER_ACTION}
                >
                  <Info className="size-4" />
                  {t("customer.business_details")}
                </Link>
                {!isTerminalNegative(booking.status) && booking.status !== "completed" && (
                  <>
                    <Link
                      to="/reschedule/$bookingId"
                      params={{ bookingId: booking.id }}
                      className={DRAWER_ACTION}
                    >
                      <CalendarClock className="size-4" />
                      {t("customer.reschedule")}
                    </Link>
                    <button
                      type="button"
                      onClick={() => onRequestCancel(booking)}
                      className={`${DRAWER_ACTION} text-destructive`}
                    >
                      <X className="size-4" />
                      {t("customer.cancel")}
                    </button>
                  </>
                )}
                {(booking.status === "completed" || isTerminalNegative(booking.status)) &&
                  booking.services && (
                    <Link
                      to="/business/$businessSlug"
                      params={{ businessSlug: booking.businesses?.slug ?? "" }}
                      search={{
                        book: true,
                        service: booking.services.id,
                        staff: booking.staff?.id,
                      }}
                      className={DRAWER_ACTION}
                    >
                      <RotateCcw className="size-4" />
                      {t("customer.book_again")}
                    </Link>
                  )}
                {booking.status === "completed" && (
                  <Link
                    to="/business/$businessSlug"
                    params={{ businessSlug: booking.businesses?.slug ?? "" }}
                    search={{ tab: "reviews" }}
                    className={DRAWER_ACTION}
                  >
                    <Star className="size-4" />
                    {t("customer.leave_review")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
