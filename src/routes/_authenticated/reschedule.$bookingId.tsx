import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ArrowLeft, Check, Loader2, Wifi } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/reschedule/$bookingId")({
  head: () => ({
    meta: [
      { title: "Reschedule your appointment — Dallty" },
      {
        name: "description",
        content:
          "Move your Dallty appointment to a new time while keeping the same service and specialist, with live availability.",
      },
      { property: "og:title", content: "Reschedule your appointment — Dallty" },
      {
        property: "og:description",
        content: "Same service, same specialist, a new time that suits you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReschedulePage,
});

type BookingDetail = {
  id: string;
  business_id: string;
  service_id: string;
  staff_id: string;
  starts_at: string;
  status: string;
  services: { name: string; duration_minutes: number } | null;
  staff: { full_name: string } | null;
  businesses: { name: string } | null;
};

function ReschedulePage() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const bookingQuery = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, business_id, service_id, staff_id, starts_at, status, services(name, duration_minutes), staff(full_name), businesses(name)",
        )
        .eq("id", bookingId)
        .single();
      if (error) throw error;
      return data as unknown as BookingDetail;
    },
  });

  const booking = bookingQuery.data ?? null;

  useEffect(() => {
    if (booking && !day) setDay(format(new Date(booking.starts_at), "yyyy-MM-dd"));
  }, [booking, day]);

  const slotsQuery = useQuery({
    queryKey: ["slots", booking?.staff_id, booking?.service_id, day],
    enabled: Boolean(booking && day),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_available_slots", {
        _staff_id: booking!.staff_id,
        _service_id: booking!.service_id,
        _day: day!,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!booking) return;
    const channel = supabase
      .channel(`reschedule-${booking.business_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `business_id=eq.${booking.business_id}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["slots"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [booking, queryClient]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(new Date(), i)), []);

  const reschedule = useMutation({
    mutationFn: async () => {
      if (!booking || !slot) throw new Error("Pick a new time first");
      const starts = new Date(slot);
      const ends = new Date(starts.getTime() + (booking.services?.duration_minutes ?? 30) * 60_000);
      const { error } = await supabase
        .from("bookings")
        .update({ starts_at: starts.toISOString(), ends_at: ends.toISOString() })
        .eq("id", booking.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.success("Appointment moved");
      navigate({ to: "/bookings" });
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not reschedule");
      queryClient.invalidateQueries({ queryKey: ["slots"] });
    },
  });

  const currentSlotIso = booking ? new Date(booking.starts_at).toISOString() : null;

  return (
    <div className="relative min-h-dvh px-4 pb-32 pt-4">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 start-[-10%] size-[34rem] rounded-full bg-primary/15 blur-3xl" />
      </div>

      <header className="mx-auto flex max-w-3xl items-center gap-3 rounded-3xl glass px-4 py-3">
        <Link
          to="/bookings"
          aria-label="Back to bookings"
          className="grid size-11 shrink-0 place-items-center rounded-2xl glass-soft"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-base font-extrabold">Reschedule</h1>
          <p className="truncate text-xs text-muted-foreground">
            {booking ? `${booking.services?.name} · ${booking.staff?.full_name}` : "Loading…"}
          </p>
        </div>
      </header>

      <main className="mx-auto mt-7 max-w-3xl">
        {booking && (
          <p className="rounded-3xl glass-soft p-4 text-sm">
            Keeping <strong>{booking.services?.name}</strong> with{" "}
            <strong>{booking.staff?.full_name}</strong> at {booking.businesses?.name}. Currently{" "}
            {format(new Date(booking.starts_at), "EEE d MMM · HH:mm")}.
          </p>
        )}

        <section className="mt-7">
          <h2 className="text-2xl font-extrabold">Pick a new date</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
            {days.map((d) => {
              const value = format(d, "yyyy-MM-dd");
              const active = value === day;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDay(value);
                    setSlot(null);
                  }}
                  aria-pressed={active}
                  className={`press rounded-3xl px-3 py-4 text-center ${
                    active ? "bg-primary text-primary-foreground" : "glass"
                  }`}
                >
                  <span className="block text-xs font-semibold uppercase opacity-80">
                    {format(d, "EEE")}
                  </span>
                  <span className="mt-1 block text-xl font-extrabold">{format(d, "d")}</span>
                  <span className="block text-xs opacity-80">{format(d, "MMM")}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <h2 className="text-2xl font-extrabold">Pick a new time</h2>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full glass-soft px-3 py-1.5 text-xs font-semibold">
              <Wifi className="size-3.5 text-primary" />
              Live availability
            </span>
          </div>

          {slotsQuery.isLoading ? (
            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (slotsQuery.data?.filter((s) => s.available).length ?? 0) === 0 ? (
            <p className="mt-6 rounded-3xl glass p-6 text-sm text-muted-foreground">
              No free times on this day. Try another date.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {slotsQuery.data?.map((s) => {
                const isCurrent = currentSlotIso === new Date(s.slot).toISOString();
                const selectable = s.available || isCurrent;
                const active = slot === s.slot;
                return (
                  <button
                    key={s.slot}
                    type="button"
                    disabled={!selectable}
                    onClick={() => setSlot(s.slot)}
                    aria-pressed={active}
                    className={`min-h-12 rounded-2xl text-sm font-bold transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : selectable
                          ? "glass"
                          : "bg-muted text-muted-foreground line-through"
                    }`}
                  >
                    {format(new Date(s.slot), "HH:mm")}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-3xl glass p-3">
          <Link
            to="/bookings"
            className="min-h-12 shrink-0 rounded-2xl glass-soft px-5 text-sm font-semibold leading-[3rem]"
          >
            Keep current
          </Link>
          <button
            type="button"
            disabled={!slot || reschedule.isPending}
            onClick={() => reschedule.mutate()}
            className="press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
          >
            {reschedule.isPending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Check className="size-5" />
            )}
            Confirm new time
          </button>
        </div>
      </div>
    </div>
  );
}
