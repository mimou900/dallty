import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { CalendarPlus, Check, Clock, Loader2, NotebookPen, Search, X } from "lucide-react";
import { toast } from "sonner";
import { CallButton } from "@/components/dallty/phone-field";
import { formatPhoneDisplay } from "@/lib/phone";
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

import { supabase } from "@/integrations/supabase/client";
import { STATUS_STYLES, money, type BookingStatus } from "@/lib/admin";
import {
  createMyAppointment,
  listMyAppointments,
  rescheduleMyAppointment,
} from "@/lib/staff-desk.functions";

export const Route = createFileRoute("/_authenticated/admin/my-appointments")({
  head: () => ({
    meta: [
      { title: "My appointments — Dallty Business" },
      {
        name: "description",
        content:
          "Your personal appointment book: see only your own bookings, add walk-ins, reschedule, confirm, complete or cancel.",
      },
      { property: "og:title", content: "My appointments — Dallty Business" },
      {
        property: "og:description",
        content: "A specialist's own schedule with full booking control.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyAppointmentsPage,
});

type Range = "today" | "upcoming" | "past" | "all";
const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
  { id: "all", label: "All" },
];
const STATUSES: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];

type StaffAppointment = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  serviceId: string;
  serviceName: string;
  duration: number;
  startsAt: string;
  endsAt: string;
  status: BookingStatus;
  totalPrice: number;
  notes: string | null;
};

function MyAppointmentsPage() {
  const queryClient = useQueryClient();
  const fetchMine = useServerFn(listMyAppointments);
  const createFn = useServerFn(createMyAppointment);
  const rescheduleFn = useServerFn(rescheduleMyAppointment);
  const { t } = useTranslation("booking");

  const [range, setRange] = useState<Range>("today");
  const [status, setStatus] = useState<"all" | BookingStatus>("all");
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const [moveDraft, setMoveDraft] = useState("");
  const [pendingCancel, setPendingCancel] = useState<StaffAppointment | null>(null);

  const [draft, setDraft] = useState({ serviceId: "", customerId: "", startsAt: "", notes: "" });

  const desk = useQuery({
    queryKey: ["staff-desk"],
    queryFn: () => fetchMine(),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["staff-desk"] });

  const create = useMutation({
    mutationFn: (vars: {
      serviceId: string;
      customerId: string;
      startsAt: string;
      notes: string | null;
    }) => createFn({ data: vars }),
    onSuccess: () => {
      toast.success("Appointment added");
      setCreating(false);
      setDraft({ serviceId: "", customerId: "", startsAt: "", notes: "" });
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add the appointment"),
  });

  const move = useMutation({
    mutationFn: (vars: { bookingId: string; startsAt: string }) => rescheduleFn({ data: vars }),
    onSuccess: () => {
      toast.success("Appointment moved");
      setMoveFor(null);
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reschedule"),
  });

  const rows = useMemo(() => {
    const all = desk.data?.appointments ?? [];
    const q = term.trim().toLowerCase();
    const now = new Date();
    return all
      .filter((a) => {
        const at = new Date(a.startsAt);
        if (range === "today") return at >= startOfDay(now) && at <= endOfDay(now);
        if (range === "upcoming") return isAfter(at, now);
        if (range === "past") return isBefore(at, now);
        return true;
      })
      .filter((a) => status === "all" || a.status === status)
      .filter(
        (a) =>
          !q || a.customerName.toLowerCase().includes(q) || a.serviceName.toLowerCase().includes(q),
      )
      .sort((a, b) =>
        range === "past"
          ? +new Date(b.startsAt) - +new Date(a.startsAt)
          : +new Date(a.startsAt) - +new Date(b.startsAt),
      );
  }, [desk.data, range, status, term]);

  async function setStatusFor(id: string, next: BookingStatus) {
    setBusy(id);
    const { error } = await supabase.from("bookings").update({ status: next }).eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${next}`);
    refresh();
  }

  async function saveNote(id: string) {
    setBusy(id);
    const { error } = await supabase
      .from("bookings")
      .update({ notes: noteDraft.trim() || null })
      .eq("id", id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Note saved");
    setNoteFor(null);
    refresh();
  }

  if (desk.isLoading) return <p className="text-sm text-muted-foreground">Loading your book…</p>;

  if (desk.isError)
    return (
      <div className="rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
        {desk.error instanceof Error
          ? desk.error.message
          : "We couldn't load your appointments right now."}
      </div>
    );

  const services = desk.data?.services ?? [];
  const customers = desk.data?.customers ?? [];
  const today = (desk.data?.appointments ?? []).filter((a) => {
    const at = new Date(a.startsAt);
    return at >= startOfDay(new Date()) && at <= endOfDay(new Date()) && a.status !== "cancelled";
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">My appointments</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {today.length} booked today · {desk.data?.appointments.length ?? 0} in total
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="press flex min-h-10 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <CalendarPlus className="size-4" /> New appointment
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.serviceId || !draft.customerId || !draft.startsAt)
              return toast.error("Pick a service, a client and a time");
            create.mutate({
              serviceId: draft.serviceId,
              customerId: draft.customerId,
              startsAt: new Date(draft.startsAt).toISOString(),
              notes: draft.notes.trim() || null,
            });
          }}
          className="grid gap-3 rounded-3xl glass p-5 sm:grid-cols-2"
        >
          <label className="text-sm font-bold">
            Service
            <select
              value={draft.serviceId}
              onChange={(e) => setDraft({ ...draft, serviceId: e.target.value })}
              className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
            >
              <option value="">Select…</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration} min
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Client
            <select
              value={draft.customerId}
              onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}
              className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
            >
              <option value="">Select…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            Starts at
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
            />
          </label>
          <label className="text-sm font-bold">
            Note (optional)
            <input
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Allergy, preference, request…"
              className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
            />
          </label>
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              You aren't assigned to any service yet — ask your business owner to assign one.
            </p>
          )}
          {customers.length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Clients appear here after their first booking with you.
            </p>
          )}
          <div className="flex gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={create.isPending}
              className="press flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />} Add appointment
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="press min-h-11 rounded-2xl glass-soft px-5 text-sm font-bold"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            className={`press min-h-9 rounded-2xl px-4 text-sm font-bold ${
              range === r.id ? "bg-primary text-primary-foreground" : "glass-soft"
            }`}
          >
            {r.label}
          </button>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        {(["all", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`press min-h-9 rounded-2xl px-3 text-sm font-bold capitalize ${
              status === s ? "bg-foreground text-background" : "glass-soft"
            }`}
          >
            {s}
          </button>
        ))}
        <label className="ms-auto flex min-h-9 min-w-48 flex-1 items-center gap-2 rounded-2xl glass-soft px-3 text-sm sm:flex-none">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search client or service"
            className="w-full bg-transparent outline-none"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-3xl glass p-8 text-center">
          <Clock className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Nothing booked in this view.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((a) => (
            <article key={a.id} className="rounded-3xl glass p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {format(new Date(a.startsAt), "EEE dd MMM · HH:mm")} –{" "}
                    {format(new Date(a.endsAt), "HH:mm")}
                  </p>
                  <h3 className="mt-1 truncate text-base font-extrabold">{a.serviceName}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {a.customerName}
                    {a.customerPhone ? ` · ${formatPhoneDisplay(a.customerPhone)}` : ""} ·{" "}
                    {money(a.totalPrice)}
                  </p>
                  <div className="mt-2">
                    <CallButton phone={a.customerPhone} name={a.customerName} />
                  </div>
                  {a.notes && (
                    <p className="mt-2 rounded-2xl bg-secondary/60 px-3 py-2 text-sm">{a.notes}</p>
                  )}
                </div>
                <span
                  className={`rounded-xl px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLES[a.status]}`}
                >
                  {a.status}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
                {a.status === "pending" && (
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => setStatusFor(a.id, "confirmed")}
                    className="press flex min-h-9 items-center gap-1.5 rounded-2xl bg-primary px-3 text-primary-foreground disabled:opacity-60"
                  >
                    <Check className="size-4" /> Confirm
                  </button>
                )}
                {a.status !== "completed" && a.status !== "cancelled" && (
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => setStatusFor(a.id, "completed")}
                    className="press min-h-9 rounded-2xl glass-soft px-3 disabled:opacity-60"
                  >
                    Mark completed
                  </button>
                )}
                {a.status !== "cancelled" && (
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => setPendingCancel(a)}
                    className="press flex min-h-9 items-center gap-1.5 rounded-2xl glass-soft px-3 text-destructive disabled:opacity-60"
                  >
                    <X className="size-4" /> Cancel
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setMoveFor(moveFor === a.id ? null : a.id);
                    setMoveDraft(format(new Date(a.startsAt), "yyyy-MM-dd'T'HH:mm"));
                  }}
                  className="press min-h-9 rounded-2xl glass-soft px-3"
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNoteFor(noteFor === a.id ? null : a.id);
                    setNoteDraft(a.notes ?? "");
                  }}
                  className="press flex min-h-9 items-center gap-1.5 rounded-2xl glass-soft px-3"
                >
                  <NotebookPen className="size-4" /> Note
                </button>
              </div>

              {moveFor === a.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    value={moveDraft}
                    onChange={(e) => setMoveDraft(e.target.value)}
                    className="min-h-10 rounded-2xl glass-soft px-3 text-sm font-medium"
                  />
                  <button
                    type="button"
                    disabled={move.isPending}
                    onClick={() =>
                      move.mutate({
                        bookingId: a.id,
                        startsAt: new Date(moveDraft).toISOString(),
                      })
                    }
                    className="press min-h-10 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    Save time
                  </button>
                </div>
              )}

              {noteFor === a.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add a note for this visit"
                    className="min-h-10 flex-1 rounded-2xl glass-soft px-3 text-sm font-medium"
                  />
                  <button
                    type="button"
                    disabled={busy === a.id}
                    onClick={() => void saveNote(a.id)}
                    className="press min-h-10 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    Save note
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(pendingCancel)}
        onOpenChange={(open) => !open && setPendingCancel(null)}
      >
        <AlertDialogContent className="rounded-3xl border-0 bg-background p-0 sm:rounded-3xl">
          <div className="p-6">
            <AlertDialogHeader className="text-start">
              <AlertDialogTitle className="text-xl font-extrabold">
                {t("admin.cancel_title")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm leading-relaxed">
                {t("cancel_confirm_body")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {pendingCancel && (
              <div className="mt-4 rounded-2xl bg-muted p-4 text-sm">
                <p className="font-extrabold">{pendingCancel.serviceName}</p>
                <p className="mt-0.5 text-muted-foreground">{pendingCancel.customerName}</p>
                <p className="mt-2 font-semibold">
                  {format(new Date(pendingCancel.startsAt), "EEE d MMM · HH:mm")}
                </p>
              </div>
            )}
          </div>
          <AlertDialogFooter className="flex-col-reverse gap-2 border-t p-4 sm:flex-col-reverse">
            <AlertDialogCancel
              onClick={() => setPendingCancel(null)}
              className="min-h-12 w-full rounded-2xl border-0 bg-muted font-bold text-foreground hover:bg-muted/80"
            >
              {t("admin.keep")}
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
              {t("admin.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
