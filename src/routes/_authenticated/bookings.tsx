import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { BellRing, CalendarClock, CalendarDays, Info, MapPin, Phone, X } from "lucide-react";
import { toast } from "sonner";

import { formatMoney } from "@/lib/countries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { landingForRoles, resolveLanding } from "@/lib/post-login";
import { useManagedBusinesses } from "@/lib/admin";
import { claimGuestBookingsForCurrentUser } from "@/lib/account.functions";
import { ClientShell } from "@/components/dallty/client-shell";
import { useTranslation } from "@/lib/i18n/hooks";
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

export const Route = createFileRoute("/_authenticated/bookings")({
  // Owners/staff/admins manage appointments in their own dashboard — never here.
  // Booking itself stays open to every role; only this list view is customer-only.
  beforeLoad: async ({ context }) => {
    const userId = (context as { user?: { id: string } }).user?.id;
    if (!userId) return;
    const landing = await resolveLanding(userId);
    if (landing !== "/bookings") throw redirect({ to: landing, replace: true });
  },
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

const ROLE_LABEL: Record<AppRole, string> = {
  client: "Client",
  business_owner: "Business owner",
  specialist: "Specialist",
  admin: "Administrator",
  super_admin: "Super Admin",
};

type BookingRow = {
  id: string;
  business_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  total_price: number;
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
  } | null;
  services: { name: string; duration_minutes: number } | null;
  staff: { full_name: string } | null;
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

function mapsHref(business: BookingRow["businesses"]) {
  if (!business) return null;
  if (business.maps_url) return business.maps_url;
  const q = [business.name, business.address, business.area, business.city]
    .filter(Boolean)
    .join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function BookingsPage() {
  const { user, primaryRole, roles } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation("booking");
  const isManager = primaryRole !== "client";
  const [pendingCancel, setPendingCancel] = useState<BookingRow | null>(null);
  const cancelling = Boolean(pendingCancel);
  const managedBusinesses = useManagedBusinesses();

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
          "id, business_id, starts_at, ends_at, status, total_price, businesses(name, slug, area, currency, timezone, address, city, maps_url, phone), services(name, duration_minutes), staff(full_name)",
        )
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

  const bookings = bookingsQuery.data ?? [];
  const upcoming = bookings.filter(
    (b) => new Date(b.starts_at) >= new Date() && b.status !== "cancelled",
  );
  const past = bookings.filter((b) => !upcoming.includes(b));

  const nextUp = upcoming[0];

  return (
    <ClientShell
      title={isManager ? "Business calendar" : "Your bookings"}
      subtitle={
        isManager
          ? "Every appointment you can manage, updating live."
          : "Live status for every appointment you booked."
      }
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-bold">
            {ROLE_LABEL[primaryRole]}
          </span>
          {roles.length === 0 && (
            <span className="text-xs text-muted-foreground">Role is being set up…</span>
          )}
        </div>

        {/* Next appointment, front and centre on mobile */}
        {nextUp && (
          <section className="mt-4 rounded-3xl bg-primary p-5 text-primary-foreground">
            <p className="text-[0.7rem] font-bold uppercase tracking-wide opacity-80">Next up</p>
            <h2 className="mt-1 truncate text-lg font-extrabold">{nextUp.services?.name}</h2>
            <p className="mt-0.5 truncate text-sm opacity-90">
              {nextUp.businesses?.name} · {nextUp.staff?.full_name}
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm font-bold">
              <CalendarDays className="size-4" />
              {format(new Date(nextUp.starts_at), "EEE d MMM · HH:mm")}
            </p>
            <div className="mt-4 space-y-2">
              {nextUp.businesses?.phone && (
                <a
                  href={`tel:${nextUp.businesses.phone}`}
                  className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-background px-4 text-sm font-extrabold text-foreground"
                >
                  <Phone className="size-4" />
                  Call business
                </a>
              )}
              <div className="grid grid-cols-2 gap-2">
                {mapsHref(nextUp.businesses) && (
                  <a
                    href={mapsHref(nextUp.businesses)!}
                    target="_blank"
                    rel="noreferrer"
                    className="press flex min-h-10 items-center justify-center gap-1.5 rounded-2xl border border-primary-foreground/40 px-3 text-sm font-bold"
                  >
                    <MapPin className="size-4" />
                    Location
                  </a>
                )}
                <Link
                  to="/business/$businessSlug"
                  params={{ businessSlug: nextUp.businesses?.slug ?? "" }}
                  className="press flex min-h-10 items-center justify-center gap-1.5 rounded-2xl border border-primary-foreground/40 px-3 text-sm font-bold"
                >
                  <Info className="size-4" />
                  Business details
                </Link>
                <Link
                  to="/reschedule/$bookingId"
                  params={{ bookingId: nextUp.id }}
                  className="press flex min-h-10 items-center justify-center gap-1.5 rounded-2xl border border-primary-foreground/40 px-3 text-sm font-bold"
                >
                  <CalendarClock className="size-4" />
                  Reschedule
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingCancel(nextUp)}
                  className="press flex min-h-10 items-center justify-center gap-1.5 rounded-2xl border border-primary-foreground/40 px-3 text-sm font-bold"
                >
                  <X className="size-4" />
                  Cancel
                </button>
              </div>
            </div>
          </section>
        )}

        {bookingsQuery.isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-muted" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="mt-8 rounded-3xl glass p-8 text-center">
            <CalendarDays className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-bold">Nothing booked yet</p>
            <Link
              to="/"
              className="press mt-5 inline-flex min-h-12 items-center rounded-2xl bg-primary px-6 font-bold text-primary-foreground"
            >
              Find a salon
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-8">
            <Section
              title="Upcoming"
              items={upcoming}
              onUpdate={updateStatus}
              onRequestCancel={setPendingCancel}
              isManager={isManager}
            />
            <Section
              title="Past & cancelled"
              items={past}
              onUpdate={updateStatus}
              onRequestCancel={setPendingCancel}
              isManager={isManager}
              muted
            />
          </div>
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
      </div>
    </ClientShell>
  );
}

function Section({
  title,
  items,
  onUpdate,
  onRequestCancel,
  isManager,
  muted,
}: {
  title: string;
  items: BookingRow[];
  onUpdate: (id: string, status: "confirmed" | "cancelled") => void;
  onRequestCancel: (booking: BookingRow) => void;
  isManager: boolean;
  muted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">
        {items.map((b) => (
          <article key={b.id} className={`rounded-3xl glass p-5 ${muted ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate text-base font-extrabold">{b.services?.name}</h3>
                <p className="truncate text-sm text-muted-foreground">
                  {b.businesses?.name} · {b.staff?.full_name}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-secondary px-3 py-1 text-xs font-bold capitalize">
                {b.status}
              </span>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="size-4 text-primary" />
              {format(new Date(b.starts_at), "EEE d MMM · HH:mm")} –{" "}
              {format(new Date(b.ends_at), "HH:mm")}
            </p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-lg font-extrabold">
                  {formatMoney(b.total_price, b.businesses?.currency ?? undefined)}
                </span>
                {b.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => onUpdate(b.id, "confirmed")}
                    className="min-h-10 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
                  >
                    {isManager ? "Confirm" : "Confirm slot"}
                  </button>
                )}
              </div>
              {b.businesses?.phone && (
                <a
                  href={`tel:${b.businesses.phone}`}
                  className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"
                >
                  <Phone className="size-4" />
                  Call business
                </a>
              )}
              <div className="grid grid-cols-2 gap-2">
                {mapsHref(b.businesses) && (
                  <a
                    href={mapsHref(b.businesses)!}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-10 items-center justify-center gap-1.5 rounded-2xl glass-soft px-3 text-sm font-semibold"
                  >
                    <MapPin className="size-4" />
                    Location
                  </a>
                )}
                <Link
                  to="/business/$businessSlug"
                  params={{ businessSlug: b.businesses?.slug ?? "" }}
                  className="flex min-h-10 items-center justify-center gap-1.5 rounded-2xl glass-soft px-3 text-sm font-semibold"
                >
                  <Info className="size-4" />
                  Business details
                </Link>
                {b.status !== "cancelled" && b.status !== "completed" && (
                  <>
                    <Link
                      to="/reschedule/$bookingId"
                      params={{ bookingId: b.id }}
                      className="flex min-h-10 items-center justify-center gap-1.5 rounded-2xl glass-soft px-3 text-sm font-semibold"
                    >
                      <CalendarClock className="size-4" />
                      Reschedule
                    </Link>
                    <button
                      type="button"
                      onClick={() => onRequestCancel(b)}
                      className="flex min-h-10 items-center justify-center gap-1.5 rounded-2xl glass-soft px-3 text-sm font-semibold text-destructive"
                    >
                      <X className="size-4" />
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
