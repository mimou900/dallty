import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, startOfDay } from "date-fns";
import { PhoneOff, PhoneMissed, CheckCircle2, CalendarClock, Ban, History } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { CallButton } from "@/components/dallty/phone-field";
import { useTranslation } from "@/lib/i18n/hooks";
import { supabase } from "@/integrations/supabase/client";
import { useManagedBusinesses, useManagedServices, useManagedStaff } from "@/lib/admin";
import {
  recordConfirmationCall,
  listConfirmationCalls,
  cancelBookingStaff,
} from "@/lib/booking-ops.functions";

export const Route = createFileRoute("/_authenticated/admin/confirmations")({
  head: () => ({
    meta: [
      { title: "Confirmations — Dallty Business" },
      {
        name: "description",
        content: "Call customers ahead of their appointment and track confirmation outcomes.",
      },
    ],
  }),
  component: ConfirmationCenterPage,
});

type ConfirmationRow = {
  id: string;
  business_id: string;
  branch_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  service_id: string;
  staff_id: string;
  starts_at: string;
  total_price: number;
  confirmation_status: "not_required" | "pending" | "confirmed" | "unreachable" | "declined";
};

type Outcome = "called" | "no_answer" | "confirmed" | "reschedule_requested" | "wrong_number";

const OUTCOME_ICON: Record<Outcome, typeof PhoneOff> = {
  called: History,
  no_answer: PhoneMissed,
  confirmed: CheckCircle2,
  reschedule_requested: CalendarClock,
  wrong_number: PhoneOff,
};

function ConfirmationCenterPage() {
  const { t } = useTranslation("booking");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recordCall = useServerFn(recordConfirmationCall);
  const cancelBooking = useServerFn(cancelBookingStaff);
  const fetchCalls = useServerFn(listConfirmationCalls);

  const businessesQuery = useManagedBusinesses();
  const allBusinesses = useMemo(() => businessesQuery.data ?? [], [businessesQuery.data]);
  const [businessScope, setBusinessScope] = useState("all");
  const businessIds = useMemo(
    () =>
      allBusinesses
        .filter((b) => businessScope === "all" || b.id === businessScope)
        .map((b) => b.id),
    [allBusinesses, businessScope],
  );

  const [range, setRange] = useState<"today" | "upcoming" | "all">("today");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "unreachable" | "confirmed">(
    "pending",
  );
  const [openHistoryFor, setOpenHistoryFor] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    const today = startOfDay(new Date());
    if (range === "today")
      return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
    if (range === "upcoming")
      return { from: addDays(today, 1).toISOString(), to: addDays(today, 30).toISOString() };
    return { from: addDays(today, -30).toISOString(), to: addDays(today, 60).toISOString() };
  }, [range]);

  const bookingsQuery = useQuery({
    queryKey: ["admin-confirmations", businessIds, from, to],
    enabled: businessIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, business_id, branch_id, customer_id, customer_name, customer_phone, service_id, staff_id, starts_at, total_price, confirmation_status",
        )
        .in("business_id", businessIds)
        .eq("status", "confirmed")
        .neq("confirmation_status", "not_required")
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at");
      if (error) throw error;
      return data as ConfirmationRow[];
    },
  });

  const customerIds = [
    ...new Set(
      (bookingsQuery.data ?? []).map((b) => b.customer_id).filter((id): id is string => !!id),
    ),
  ];
  const customersQuery = useQuery({
    queryKey: ["admin-confirmation-customers", customerIds],
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

  const staffQuery = useManagedStaff(businessIds);
  const servicesQuery = useManagedServices(businessIds);

  const rows = useMemo(() => {
    const customers = customersQuery.data ?? [];
    const staff = staffQuery.data ?? [];
    const services = servicesQuery.data ?? [];
    return (bookingsQuery.data ?? [])
      .filter((b) => statusFilter === "all" || b.confirmation_status === statusFilter)
      .map((b) => ({
        ...b,
        displayName: b.customer_id
          ? (customers.find((c) => c.id === b.customer_id)?.full_name ?? "Customer")
          : (b.customer_name ?? "Guest"),
        displayPhone: b.customer_id
          ? (customers.find((c) => c.id === b.customer_id)?.phone ?? null)
          : (b.customer_phone ?? null),
        serviceName: services.find((s) => s.id === b.service_id)?.name ?? "Service",
        staffName: staff.find((s) => s.id === b.staff_id)?.full_name ?? "Specialist",
      }));
  }, [bookingsQuery.data, customersQuery.data, staffQuery.data, servicesQuery.data, statusFilter]);

  const historyQuery = useQuery({
    queryKey: ["confirmation-calls", openHistoryFor],
    enabled: Boolean(openHistoryFor),
    queryFn: () => fetchCalls({ data: { bookingId: openHistoryFor! } }),
  });

  async function act(bookingId: string, outcome: Outcome) {
    setBusyId(bookingId);
    try {
      await recordCall({
        data: { bookingId, outcome, note: noteDrafts[bookingId]?.trim() || undefined },
      });
      toast.success(t("confirmation_center.recorded"));
      setNoteDrafts((d) => ({ ...d, [bookingId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["admin-confirmations"] });
      queryClient.invalidateQueries({ queryKey: ["confirmation-calls", bookingId] });
      if (outcome === "reschedule_requested") {
        navigate({ to: "/reschedule/$bookingId", params: { bookingId } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(bookingId: string) {
    setBusyId(bookingId);
    try {
      await cancelBooking({ data: { bookingId } });
      toast.success(t("confirmation_center.cancel"));
      queryClient.invalidateQueries({ queryKey: ["admin-confirmations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-extrabold">{t("confirmation_center.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("confirmation_center.subtitle")}</p>
      </div>

      {allBusinesses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBusinessScope("all")}
            className={`rounded-2xl px-3 py-1.5 text-xs font-bold ${businessScope === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            All businesses
          </button>
          {allBusinesses.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBusinessScope(b.id)}
              className={`rounded-2xl px-3 py-1.5 text-xs font-bold ${businessScope === b.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-2xl bg-secondary p-1">
          {(["today", "upcoming", "all"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold ${range === r ? "bg-background shadow-soft" : "text-muted-foreground"}`}
            >
              {t(`confirmation_center.${r}` as never)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {(["pending", "unreachable", "confirmed", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`rounded-2xl px-3 py-1.5 text-xs font-bold ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >
              {s === "all"
                ? t("confirmation_center.all")
                : t(`confirmation_center.filter_${s}` as never)}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t("confirmation_center.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-3xl border bg-card p-4 shadow-soft sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {format(new Date(row.starts_at), "MMM d, HH:mm")}
                    </span>
                    <span className="text-sm text-muted-foreground">{row.displayName}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.serviceName} · {row.staffName}
                  </p>
                  {row.confirmation_status !== "confirmed" && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold-foreground">
                      {t("confirmation_center.confirmation_required")}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CallButton phone={row.displayPhone} name={row.displayName} />
                  <button
                    type="button"
                    onClick={() => setOpenHistoryFor(openHistoryFor === row.id ? null : row.id)}
                    className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-3 text-xs font-bold"
                  >
                    <History className="size-3.5" /> {t("confirmation_center.history")}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => act(row.id, "confirmed")}
                  className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-60"
                >
                  <CheckCircle2 className="size-3.5" /> {t("confirmation_center.confirm")}
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => act(row.id, "no_answer")}
                  className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-3 text-xs font-bold disabled:opacity-60"
                >
                  <PhoneMissed className="size-3.5" /> {t("confirmation_center.no_answer")}
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => act(row.id, "wrong_number")}
                  className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-3 text-xs font-bold disabled:opacity-60"
                >
                  <PhoneOff className="size-3.5" /> {t("confirmation_center.wrong_number")}
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => act(row.id, "reschedule_requested")}
                  className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-secondary px-3 text-xs font-bold disabled:opacity-60"
                >
                  <CalendarClock className="size-3.5" /> {t("confirmation_center.reschedule")}
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => cancel(row.id)}
                  className="press inline-flex min-h-9 items-center gap-1.5 rounded-2xl bg-destructive/10 px-3 text-xs font-bold text-destructive disabled:opacity-60"
                >
                  <Ban className="size-3.5" /> {t("confirmation_center.cancel")}
                </button>
              </div>

              <input
                value={noteDrafts[row.id] ?? ""}
                onChange={(e) => setNoteDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                placeholder={t("confirmation_center.note_placeholder")}
                className="mt-3 min-h-10 w-full rounded-2xl bg-secondary/60 px-3 text-sm outline-none ring-ring focus:ring-2"
              />

              {openHistoryFor === row.id && (
                <div className="mt-3 space-y-2 rounded-2xl bg-secondary/40 p-3">
                  {historyQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">…</p>
                  ) : (historyQuery.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("confirmation_center.no_history")}
                    </p>
                  ) : (
                    (historyQuery.data ?? []).map((call) => {
                      const Icon = OUTCOME_ICON[call.outcome as Outcome] ?? History;
                      return (
                        <div key={call.id} className="flex items-start gap-2 text-xs">
                          <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          <div>
                            <span className="font-bold">
                              {t(`confirmation_center.outcome_${call.outcome}` as never)}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {format(new Date(call.created_at), "MMM d, HH:mm")}
                            </span>
                            {call.note && <p className="text-muted-foreground">{call.note}</p>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
