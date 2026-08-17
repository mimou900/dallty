import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Download, Printer, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { SearchableSelect } from "@/components/admin/searchable-select";
import { BookingDetailsDialog } from "@/components/admin/booking-details-dialog";
import {
  STATUS_DOT,
  STATUS_STYLES,
  useManagedBookings,
  useManagedBusinesses,
  useManagedServices,
  useManagedStaff,
  type BookingStatus,
} from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/calendar")({
  head: () => ({
    meta: [
      { title: "Business calendar — Dallty Business" },
      {
        name: "description",
        content:
          "Day, week, month and timeline scheduling with drag & drop rescheduling, staff filters and live updates.",
      },
      { property: "og:title", content: "Business calendar — Dallty Business" },
      {
        property: "og:description",
        content: "Drag & drop scheduling for your whole team, updating in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const VIEWS = ["day", "week", "month", "timeline"] as const;
type View = (typeof VIEWS)[number];

const START_HOUR = 8;
const END_HOUR = 22;
const SLOT = 30;

function slotsOfDay(day: Date) {
  const out: Date[] = [];
  const base = new Date(day);
  base.setHours(START_HOUR, 0, 0, 0);
  const count = ((END_HOUR - START_HOUR) * 60) / SLOT;
  for (let i = 0; i < count; i += 1) out.push(addMinutes(base, i * SLOT));
  return out;
}

function CalendarPage() {
  const [view, setView] = useState<View>("day");
  const [anchor, setAnchor] = useState(() => new Date());
  const [staffFilter, setStaffFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [colorBy, setColorBy] = useState<"status" | "employee">("status");
  const [term, setTerm] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const businessesQuery = useManagedBusinesses();
  const allBusinesses = businessesQuery.data ?? [];
  const [businessScope, setBusinessScope] = useState("all");
  const businessIds = useMemo(
    () =>
      allBusinesses
        .filter((s) => businessScope === "all" || s.id === businessScope)
        .map((s) => s.id),
    [allBusinesses, businessScope],
  );
  const staffQuery = useManagedStaff(businessIds);
  const servicesQuery = useManagedServices(businessIds);

  const range = useMemo(() => {
    if (view === "month") return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    if (view === "week") {
      const from = startOfWeek(anchor, { weekStartsOn: 1 });
      return { from, to: addDays(from, 6) };
    }
    return { from: anchor, to: anchor };
  }, [view, anchor]);

  const fromISO = useMemo(() => {
    const d = new Date(range.from);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [range.from]);
  const toISO = useMemo(() => {
    const d = new Date(range.to);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  }, [range.to]);

  const bookingsQuery = useManagedBookings(businessIds, fromISO, toISO);

  const customerIds = useMemo(
    () => [
      ...new Set(
        (bookingsQuery.data ?? [])
          .map((b) => b.customer_id)
          .filter((id): id is string => id !== null),
      ),
    ],
    [bookingsQuery.data],
  );
  const customersQuery = useQuery({
    queryKey: ["admin-calendar-customers", customerIds],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", customerIds);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (businessIds.length === 0) return;
    const channel = supabase
      .channel("admin-calendar")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessIds.join(","), queryClient]);

  const staffList = staffQuery.data ?? [];
  const serviceList = servicesQuery.data ?? [];

  const events = useMemo(() => {
    const rows = bookingsQuery.data ?? [];
    const q = term.trim().toLowerCase();
    return rows
      .filter((b) => staffFilter === "all" || b.staff_id === staffFilter)
      .filter((b) => serviceFilter === "all" || b.service_id === serviceFilter)
      .map((b) => ({
        ...b,
        serviceName: serviceList.find((s) => s.id === b.service_id)?.name ?? "Service",
        staffName: staffList.find((s) => s.id === b.staff_id)?.full_name ?? "Specialist",
        customerName:
          (customersQuery.data ?? []).find((c) => c.id === b.customer_id)?.full_name ?? "Client",
        customerPhone:
          (customersQuery.data ?? []).find((c) => c.id === b.customer_id)?.phone ?? null,
      }))
      .filter(
        (b) =>
          !q ||
          b.serviceName.toLowerCase().includes(q) ||
          b.staffName.toLowerCase().includes(q) ||
          b.customerName.toLowerCase().includes(q) ||
          (b.notes ?? "").toLowerCase().includes(q),
      );
  }, [
    bookingsQuery.data,
    staffFilter,
    serviceFilter,
    term,
    serviceList,
    staffList,
    customersQuery.data,
  ]);

  const staffColor = (id: string) => {
    const idx = staffList.findIndex((s) => s.id === id);
    return ["bg-primary/20", "bg-gold/25", "bg-sky/25", "bg-rose/20", "bg-secondary"][
      (idx < 0 ? 0 : idx) % 5
    ];
  };

  async function moveBooking(id: string, nextStart: Date) {
    const booking = (bookingsQuery.data ?? []).find((b) => b.id === id);
    if (!booking) return;
    const duration = differenceInMinutes(new Date(booking.ends_at), new Date(booking.starts_at));
    const { error } = await supabase
      .from("bookings")
      .update({
        starts_at: nextStart.toISOString(),
        ends_at: addMinutes(nextStart, duration).toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Moved to ${format(nextStart, "EEE d MMM, HH:mm")}`);
    queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
  }

  function conflictAt(start: Date, staffId: string, ignoreId: string) {
    return events.some(
      (b) =>
        b.id !== ignoreId &&
        b.staff_id === staffId &&
        b.status !== "cancelled" &&
        new Date(b.starts_at) < addMinutes(start, SLOT) &&
        new Date(b.ends_at) > start,
    );
  }

  function step(dir: 1 | -1) {
    setAnchor((d) =>
      view === "month"
        ? addDays(d, dir * 30)
        : view === "week"
          ? addDays(d, dir * 7)
          : addDays(d, dir),
    );
  }

  function exportCsv() {
    const rows = [
      ["Date", "Time", "Service", "Specialist", "Status", "Price"],
      ...events.map((b) => [
        format(new Date(b.starts_at), "yyyy-MM-dd"),
        format(new Date(b.starts_at), "HH:mm"),
        b.serviceName,
        b.staffName,
        b.status,
        String(b.total_price),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `dallty-calendar-${format(anchor, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const days =
    view === "week"
      ? Array.from({ length: 7 }).map((_, i) =>
          addDays(startOfWeek(anchor, { weekStartsOn: 1 }), i),
        )
      : [anchor];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="rounded-3xl glass p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => step(-1)}
              className="grid size-9 place-items-center rounded-xl bg-secondary"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(new Date())}
              className="min-h-9 rounded-xl bg-secondary px-3 text-sm font-bold"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next"
              onClick={() => step(1)}
              className="grid size-9 place-items-center rounded-xl bg-secondary"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <p className="min-w-0 flex-1 truncate text-sm font-extrabold">
            {view === "month" ? format(anchor, "MMMM yyyy") : format(anchor, "EEEE d MMMM yyyy")}
          </p>

          <div className="flex rounded-2xl bg-secondary p-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`min-h-8 rounded-xl px-3 text-xs font-bold capitalize ${
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="grid size-9 place-items-center rounded-xl bg-secondary"
            aria-label="Print calendar"
          >
            <Printer className="size-4" />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="grid size-9 place-items-center rounded-xl bg-secondary"
            aria-label="Export calendar"
          >
            <Download className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <label className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-card/70 px-3 sm:max-w-xs">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search bookings"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          {allBusinesses.length > 1 ? (
            <SearchableSelect
              className="min-h-9 w-auto min-w-44 bg-card/70"
              value={businessScope}
              onChange={(next) => {
                setBusinessScope(next);
                setStaffFilter("all");
                setServiceFilter("all");
              }}
              searchPlaceholder="Search businesses…"
              options={[
                { value: "all", label: `All businesses (${allBusinesses.length})` },
                ...allBusinesses.map((s) => ({ value: s.id, label: s.name, hint: s.city ?? null })),
              ]}
            />
          ) : null}
          <SearchableSelect
            className="min-h-9 w-auto min-w-44 bg-card/70"
            value={staffFilter}
            onChange={setStaffFilter}
            searchPlaceholder="Search specialists…"
            options={[
              { value: "all", label: "All specialists" },
              ...staffList.map((s) => ({ value: s.id, label: s.full_name })),
            ]}
          />
          <SearchableSelect
            className="min-h-9 w-auto min-w-44 bg-card/70"
            value={serviceFilter}
            onChange={setServiceFilter}
            searchPlaceholder="Search services…"
            options={[
              { value: "all", label: "All services" },
              ...serviceList.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />

          <select
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as "status" | "employee")}
            className="min-h-9 rounded-xl bg-card/70 px-3 text-sm font-semibold"
          >
            <option value="status">Colour by status</option>
            <option value="employee">Colour by specialist</option>
          </select>
        </div>
      </div>

      {/* Views */}
      {view === "month" ? (
        <MonthGrid
          anchor={anchor}
          events={events}
          colorBy={colorBy}
          staffColor={staffColor}
          onOpen={setOpenId}
        />
      ) : view === "timeline" ? (
        <Timeline
          day={anchor}
          staff={staffList}
          events={events}
          onDrop={moveBooking}
          conflictAt={conflictAt}
          dragId={dragId}
          setDragId={setDragId}
          onOpen={setOpenId}
        />
      ) : (
        <div className={`grid gap-3 ${view === "week" ? "lg:grid-cols-7" : ""}`}>
          {days.map((day) => (
            <DayColumn
              key={day.toISOString()}
              day={day}
              events={events.filter((b) => isSameDay(new Date(b.starts_at), day))}
              colorBy={colorBy}
              staffColor={staffColor}
              onDrop={moveBooking}
              dragId={dragId}
              setDragId={setDragId}
              onOpen={setOpenId}
            />
          ))}
        </div>
      )}

      <BookingDetailsDialog
        booking={events.find((b) => b.id === openId) ?? null}
        onClose={() => setOpenId(null)}
        staffOptions={staffList.map((s) => ({
          id: s.id,
          full_name: s.full_name,
          business_id: s.business_id,
        }))}
      />

      <p className="text-xs text-muted-foreground">
        Drag an appointment onto another time slot to reschedule it — the customer and specialist
        are notified automatically. Breaks, closed days and vacations are managed in{" "}
        <Link
          to="/admin/availability"
          search={{ staff: undefined }}
          className="font-bold text-primary"
        >
          availability
        </Link>
        .
      </p>
    </div>
  );
}

type EventRow = {
  id: string;
  business_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  staff_id: string;
  total_price: number;
  payment_status?: string | null;
  notes: string | null;
  serviceName: string;
  staffName: string;
  customerName: string;
  customerPhone: string | null;
};

function DayColumn({
  day,
  events,
  colorBy,
  staffColor,
  onDrop,
  dragId,
  setDragId,
  onOpen,
}: {
  day: Date;
  events: EventRow[];
  colorBy: "status" | "employee";
  staffColor: (id: string) => string;
  onDrop: (id: string, start: Date) => void;
  dragId: string | null;
  setDragId: (v: string | null) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl glass">
      <header className="border-b border-border/50 px-4 py-3">
        <p className="text-sm font-extrabold">{format(day, "EEE d MMM")}</p>
        <p className="text-xs text-muted-foreground">{events.length} appointments</p>
      </header>
      <div className="max-h-[36rem] overflow-y-auto p-2">
        {slotsOfDay(day).map((slot) => {
          const inSlot = events.filter(
            (b) => new Date(b.starts_at) < addMinutes(slot, SLOT) && new Date(b.ends_at) > slot,
          );
          return (
            <div
              key={slot.toISOString()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) onDrop(dragId, slot);
                setDragId(null);
              }}
              className="flex min-h-11 items-stretch gap-2 border-b border-border/30 py-1 last:border-0"
            >
              <span className="w-12 shrink-0 pt-1 text-[11px] font-bold text-muted-foreground">
                {format(slot, "HH:mm")}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                {inSlot
                  .filter((b) => +new Date(b.starts_at) >= +slot)
                  .map((b) => (
                    <article
                      key={b.id}
                      draggable
                      onDragStart={() => setDragId(b.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => onOpen(b.id)}
                      className={`cursor-pointer rounded-xl px-2.5 py-1.5 text-start text-xs font-bold ${
                        colorBy === "status"
                          ? STATUS_STYLES[b.status as BookingStatus]
                          : staffColor(b.staff_id)
                      }`}
                    >
                      <span className="block truncate">
                        {format(new Date(b.starts_at), "HH:mm")} · {b.customerName}
                      </span>
                      <span className="block truncate font-semibold opacity-80">
                        {b.serviceName} · {b.staffName}
                      </span>
                    </article>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Timeline({
  day,
  staff,
  events,
  onDrop,
  conflictAt,
  dragId,
  setDragId,
  onOpen,
}: {
  day: Date;
  staff: { id: string; full_name: string }[];
  events: EventRow[];
  onDrop: (id: string, start: Date) => void;
  conflictAt: (start: Date, staffId: string, ignoreId: string) => boolean;
  dragId: string | null;
  setDragId: (v: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const slots = slotsOfDay(day);
  return (
    <div className="overflow-x-auto rounded-3xl glass">
      <div className="min-w-[900px]">
        <div
          className="grid"
          style={{ gridTemplateColumns: `10rem repeat(${slots.length}, 4rem)` }}
        >
          <div className="sticky start-0 z-10 bg-card/80 px-4 py-2 text-xs font-extrabold">
            Specialist
          </div>
          {slots.map((s) => (
            <div
              key={s.toISOString()}
              className="border-s border-border/40 py-2 text-center text-[11px] font-bold text-muted-foreground"
            >
              {format(s, "HH:mm")}
            </div>
          ))}

          {staff.map((member) => (
            <div key={member.id} className="contents">
              <div className="sticky start-0 z-10 truncate border-t border-border/40 bg-card/80 px-4 py-3 text-sm font-bold">
                {member.full_name}
              </div>
              {slots.map((slot) => {
                const booking = events.find(
                  (b) =>
                    b.staff_id === member.id &&
                    +new Date(b.starts_at) >= +slot &&
                    +new Date(b.starts_at) < +addMinutes(slot, SLOT),
                );
                const blocked = dragId ? conflictAt(slot, member.id, dragId) : false;
                return (
                  <div
                    key={slot.toISOString()}
                    onDragOver={(e) => !blocked && e.preventDefault()}
                    onDrop={() => {
                      if (dragId && !blocked) onDrop(dragId, slot);
                      setDragId(null);
                    }}
                    className={`min-h-12 border-s border-t border-border/40 p-0.5 ${
                      dragId && blocked ? "bg-destructive/10" : ""
                    }`}
                  >
                    {booking && (
                      <article
                        draggable
                        onDragStart={() => setDragId(booking.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => onOpen(booking.id)}
                        className={`h-full w-full cursor-pointer truncate text-start rounded-lg px-1.5 py-1 text-[11px] font-bold ${
                          STATUS_STYLES[booking.status as BookingStatus]
                        }`}
                        title={`${booking.customerName} · ${booking.serviceName}`}
                      >
                        {booking.customerName}
                      </article>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  anchor,
  events,
  colorBy,
  staffColor,
  onOpen,
}: {
  anchor: Date;
  events: EventRow[];
  colorBy: "status" | "employee";
  staffColor: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const first = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const cells = Array.from({ length: 42 }).map((_, i) => addDays(first, i));
  return (
    <div className="rounded-3xl glass p-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day) => {
          const rows = events.filter((b) => isSameDay(new Date(b.starts_at), day));
          const muted = day.getMonth() !== anchor.getMonth();
          return (
            <div
              key={day.toISOString()}
              className={`min-h-24 rounded-xl p-1.5 ${muted ? "opacity-40" : ""} ${
                isSameDay(day, new Date()) ? "ring-2 ring-primary" : "bg-secondary/40"
              }`}
            >
              <p className="text-[11px] font-bold">{format(day, "d")}</p>
              <div className="mt-1 space-y-0.5">
                {rows.slice(0, 3).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onOpen(b.id)}
                    className={`block w-full truncate rounded px-1 py-0.5 text-start text-[10px] font-bold ${
                      colorBy === "status"
                        ? STATUS_STYLES[b.status as BookingStatus]
                        : staffColor(b.staff_id)
                    }`}
                  >
                    {format(new Date(b.starts_at), "HH:mm")} {b.customerName}
                  </button>
                ))}
                {rows.length > 3 && (
                  <p className="text-[10px] font-bold text-muted-foreground">
                    +{rows.length - 3} more
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 px-1">
        {(["pending", "confirmed", "completed", "cancelled"] as BookingStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] font-bold capitalize">
            <span className={`size-2 rounded-full ${STATUS_DOT[s]}`} /> {s}
          </span>
        ))}
      </div>
    </div>
  );
}
