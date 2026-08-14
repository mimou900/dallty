import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfDay, subDays } from "date-fns";
import {
  BellRing,
  CalendarPlus,
  Check,
  Copy,
  Printer,
  Search,
  UserCog,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CallButton } from "@/components/dallty/phone-field";
import { SearchableSelect } from "@/components/admin/searchable-select";
import { formatPhoneDisplay } from "@/lib/phone";
import { useLocale } from "@/lib/i18n";
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

import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_STYLES,
  money,
  useManagedBookings,
  useManagedBusinesses,
  useManagedServices,
  useManagedStaff,
  type BookingStatus,
} from "@/lib/admin";


export const Route = createFileRoute("/_authenticated/admin/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — Dallty Business" },
      {
        name: "description",
        content:
          "Manage every booking: confirm, cancel, reschedule, change specialist, send reminders and print invoices.",
      },
      { property: "og:title", content: "Appointments — Dallty Business" },
      {
        property: "og:description",
        content: "One place to run every appointment in your salon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppointmentsPage,
});

const STATUSES: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];

type AppointmentRow = {
  id: string;
  business_id: string;
  customer_id: string;
  service_id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  total_price: number;
  notes: string | null;
  created_at: string;
  serviceName: string;
  duration: number;
  staffName: string;
  customerName: string;
  customerPhone: string | null;
};

function AppointmentsPage() {

  const queryClient = useQueryClient();
  const { pick } = useLocale();
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingCancel, setPendingCancel] = useState<AppointmentRow | null>(null);



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

  // Stable day-aligned range: a raw `new Date()` here changes every render,
  // which changes the query key every render and keeps the list loading forever.
  const { from, to } = useMemo(() => {
    const today = startOfDay(new Date());
    return {
      from: subDays(today, 60).toISOString(),
      to: addDays(today, 120).toISOString(),
    };
  }, []);
  const bookingsQuery = useManagedBookings(businessIds, from, to);

  const customerIds = [...new Set((bookingsQuery.data ?? []).map((b) => b.customer_id))];
  const customersQuery = useQuery({
    queryKey: ["admin-appointment-customers", customerIds],
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

  const rows = useMemo(() => {
    const staff = staffQuery.data ?? [];
    const services = servicesQuery.data ?? [];
    const customers = customersQuery.data ?? [];
    const q = term.trim().toLowerCase();
    return (bookingsQuery.data ?? [])
      .map((b) => ({
        ...b,
        serviceName: services.find((s) => s.id === b.service_id)?.name ?? "Service",
        duration: services.find((s) => s.id === b.service_id)?.duration_minutes ?? 0,
        staffName: staff.find((s) => s.id === b.staff_id)?.full_name ?? "Specialist",
        customerName: customers.find((c) => c.id === b.customer_id)?.full_name ?? "Customer",
        customerPhone: customers.find((c) => c.id === b.customer_id)?.phone ?? null,
      }))
      .filter((b) => status === "all" || b.status === status)
      .filter(
        (b) =>
          !q ||
          b.serviceName.toLowerCase().includes(q) ||
          b.staffName.toLowerCase().includes(q) ||
          b.customerName.toLowerCase().includes(q),
      )
      .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
  }, [bookingsQuery.data, staffQuery.data, servicesQuery.data, customersQuery.data, status, term]);

  const counts = useMemo(() => {
    const all = bookingsQuery.data ?? [];
    return STATUSES.reduce<Record<string, number>>(
      (acc, s) => ({ ...acc, [s]: all.filter((b) => b.status === s).length }),
      { all: all.length },
    );
  }, [bookingsQuery.data]);

  async function setStatusFor(id: string, next: BookingStatus) {
    setBusy(id);
    const { error } = await supabase.from("bookings").update({ status: next }).eq("id", id);
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Marked ${next}`);
    queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
  }

  async function changeStaff(id: string, staffId: string) {
    const { error } = await supabase.from("bookings").update({ staff_id: staffId }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Specialist updated");
    queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
  }

  async function duplicate(id: string) {
    const source = (bookingsQuery.data ?? []).find((b) => b.id === id);
    if (!source) return;
    const { error } = await supabase.from("bookings").insert({
      customer_id: source.customer_id,
      business_id: source.business_id,
      service_id: source.service_id,
      staff_id: source.staff_id,
      starts_at: addDays(new Date(source.starts_at), 7).toISOString(),
      ends_at: addDays(new Date(source.ends_at), 7).toISOString(),
      status: "pending",
      total_price: source.total_price,
      notes: source.notes,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Duplicated to next week as pending");
    queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
  }

  async function sendReminder(row: (typeof rows)[number]) {
    const { error } = await supabase.from("notifications").insert({
      user_id: row.customer_id,
      kind: "booking_reminder",
      title: "Appointment reminder",
      body: `${row.serviceName} with ${row.staffName} on ${format(
        new Date(row.starts_at),
        "EEE d MMM 'at' HH:mm",
      )}.`,
      booking_id: row.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Reminder sent");
  }

  const open = rows.find((r) => r.id === openId);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl glass p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-card/70 px-3 sm:max-w-sm">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search customer, service or specialist"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          {allBusinesses.length > 1 ? (
            <SearchableSelect
              className="w-auto min-w-48 bg-card/70"
              value={businessScope}
              onChange={setBusinessScope}
              searchPlaceholder="Search salons…"
              options={[
                { value: "all", label: `All salons (${allBusinesses.length})` },
                ...allBusinesses.map((s) => ({ value: s.id, label: s.name, hint: s.city ?? null })),
              ]}
            />
          ) : null}
          <Link
            to="/admin/calendar"
            className="press inline-flex min-h-10 items-center gap-1.5 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            <CalendarPlus className="size-4" /> New appointment
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`min-h-9 rounded-2xl px-3 text-xs font-bold capitalize ${
                status === s ? "bg-primary text-primary-foreground" : "bg-secondary"
              }`}
            >
              {s} · {counts[s] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl glass">
        {bookingsQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading appointments…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No appointments match these filters.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((row) => (
              <li key={row.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    className="min-w-0 text-start"
                  >
                    <p className="truncate text-sm font-extrabold">
                      {row.customerName} · {row.serviceName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {format(new Date(row.starts_at), "EEE d MMM, HH:mm")} · {row.staffName} ·{" "}
                      {money(row.total_price)}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <CallButton phone={row.customerPhone} name={row.customerName} />
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold capitalize ${
                        STATUS_STYLES[row.status as BookingStatus]
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                </div>

                {openId === row.id && open && (
                  <div className="mt-3 space-y-3 rounded-2xl bg-secondary/50 p-3">
                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-bold uppercase text-muted-foreground">Customer</dt>
                        <dd className="flex flex-wrap items-center gap-2 font-semibold">
                          <span>
                            {open.customerName}
                            {open.customerPhone ? ` · ${formatPhoneDisplay(open.customerPhone)}` : ""}
                          </span>
                          <CallButton phone={open.customerPhone} name={open.customerName} />
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase text-muted-foreground">Duration</dt>
                        <dd className="font-semibold">{open.duration} min</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase text-muted-foreground">Price</dt>
                        <dd className="font-semibold">{money(open.total_price)}</dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase text-muted-foreground">Booked</dt>
                        <dd className="font-semibold">
                          {format(new Date(open.created_at), "d MMM yyyy")}
                        </dd>
                      </div>
                      {open.notes ? (
                        <div className="sm:col-span-2">
                          <dt className="font-bold uppercase text-muted-foreground">Notes</dt>
                          <dd className="font-semibold">{open.notes}</dd>
                        </div>
                      ) : null}
                    </dl>

                    <div className="flex flex-wrap gap-2">
                      {open.status !== "confirmed" && (
                        <button
                          type="button"
                          disabled={busy === open.id}
                          onClick={() => setStatusFor(open.id, "confirmed")}
                          className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground"
                        >
                          <Check className="size-3.5" /> Confirm
                        </button>
                      )}
                      {open.status !== "completed" && (
                        <button
                          type="button"
                          onClick={() => setStatusFor(open.id, "completed")}
                          className="press min-h-9 rounded-xl bg-secondary px-3 text-xs font-bold"
                        >
                          Mark completed
                        </button>
                      )}
                      {open.status !== "cancelled" && (
                        <button
                          type="button"
                          disabled={busy === open.id}
                          onClick={() => setPendingCancel(open)}
                          className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-destructive/15 px-3 text-xs font-bold text-destructive disabled:opacity-60"
                        >
                          <X className="size-3.5" /> Cancel
                        </button>
                      )}

                      <Link
                        to="/reschedule/$bookingId"
                        params={{ bookingId: open.id }}
                        className="press min-h-9 rounded-xl bg-secondary px-3 text-xs font-bold"
                      >
                        Reschedule
                      </Link>
                      <button
                        type="button"
                        onClick={() => duplicate(open.id)}
                        className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold"
                      >
                        <Copy className="size-3.5" /> Duplicate
                      </button>
                      <button
                        type="button"
                        onClick={() => sendReminder(open)}
                        className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold"
                      >
                        <BellRing className="size-3.5" /> Send reminder
                      </button>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold"
                      >
                        <Printer className="size-3.5" /> Print invoice
                      </button>
                      <div className="inline-flex min-w-52 items-center gap-1.5 rounded-xl bg-secondary px-2 py-1 text-xs font-bold">
                        <UserCog className="size-3.5 shrink-0" />
                        <SearchableSelect
                          className="min-h-9 border-0 bg-transparent px-1 text-xs"
                          value={open.staff_id}
                          onChange={(next) => changeStaff(open.id, next)}
                          searchPlaceholder="Search specialists…"
                          options={(staffQuery.data ?? [])
                            .filter((s) => s.business_id === open.business_id)
                            .map((s) => ({ value: s.id, label: s.full_name }))}
                        />
                      </div>

                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <AlertDialog open={Boolean(pendingCancel)} onOpenChange={(open) => !open && setPendingCancel(null)}>
          <AlertDialogContent className="rounded-3xl border-0 bg-background p-0 sm:rounded-3xl">
            <div className="p-6">
              <AlertDialogHeader className="text-start">
                <AlertDialogTitle className="text-xl font-extrabold">
                  {pick("Cancel appointment?", "إلغاء الموعد؟")}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-sm leading-relaxed">
                  {pick(
                    "Are you sure you want to cancel this appointment? This action cannot be undone.",
                    "هل أنت متأكد من إلغاء هذا الموعد؟ لا يمكن التراجع عن هذا الإجراء.",
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {pendingCancel && (
                <div className="mt-4 rounded-2xl bg-muted p-4 text-sm">
                  <p className="font-extrabold">{pendingCancel.serviceName}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {pendingCancel.customerName} · {pendingCancel.staffName}
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
                {pick("Keep appointment", "احتفظ بالموعد")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!pendingCancel) return;
                  const id = pendingCancel.id;
                  setPendingCancel(null);
                  await setStatusFor(id, "cancelled");
                }}
                className="min-h-12 w-full rounded-2xl bg-destructive font-bold text-destructive-foreground hover:bg-destructive/90"
              >
                {pick("Cancel appointment", "إلغاء الموعد")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

