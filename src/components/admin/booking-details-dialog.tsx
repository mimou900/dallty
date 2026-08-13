import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { differenceInMinutes, format } from "date-fns";
import { BadgeDollarSign, Check, ExternalLink, PencilLine, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/admin/searchable-select";
import { CallButton } from "@/components/dallty/phone-field";
import { formatPhoneDisplay } from "@/lib/phone";
import { STATUS_STYLES, money, type BookingStatus } from "@/lib/admin";

export type BookingDetails = {
  id: string;
  salon_id: string;
  staff_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  total_price: number;
  payment_status?: string | null;
  notes: string | null;
  serviceName: string;
  staffName: string;
  customerName: string;
  customerPhone: string | null;
};

const STATUSES: BookingStatus[] = ["pending", "confirmed", "completed", "cancelled"];

/** Shared appointment popup used by the calendar and other back-office views. */
export function BookingDetailsDialog({
  booking,
  onClose,
  staffOptions = [],
}: {
  booking: BookingDetails | null;
  onClose: () => void;
  staffOptions?: { id: string; full_name: string; salon_id: string }[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!booking) return null;

  const duration = differenceInMinutes(new Date(booking.ends_at), new Date(booking.starts_at));
  const paid = booking.payment_status === "paid";

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
  }

  type BookingPatch = Partial<{
    status: BookingStatus;
    staff_id: string;
    payment_status: "paid" | "unpaid" | "refunded";
    paid_at: string | null;
  }>;

  async function patch(values: BookingPatch, message: string) {
    if (!booking) return;
    setBusy(true);
    const { error } = await supabase.from("bookings").update(values).eq("id", booking.id);

    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(message);
    refresh();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setEditing(false);
          setConfirmCancel(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl border-0 bg-background sm:max-w-lg">
        <DialogHeader className="text-start">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
            {booking.serviceName}
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold capitalize ${
                STATUS_STYLES[booking.status as BookingStatus]
              }`}
            >
              {booking.status}
            </span>
          </DialogTitle>
        </DialogHeader>

        <dl className="grid gap-3 text-xs sm:grid-cols-2">
          <Field label="Client">
            <span className="flex flex-wrap items-center gap-2">
              {booking.customerName}
              <CallButton phone={booking.customerPhone} name={booking.customerName} />
            </span>
          </Field>
          <Field label="Phone">
            {booking.customerPhone ? formatPhoneDisplay(booking.customerPhone) : "—"}
          </Field>
          <Field label="Service">{booking.serviceName}</Field>
          <Field label="Specialist">{booking.staffName}</Field>
          <Field label="Date">{format(new Date(booking.starts_at), "EEE d MMM yyyy")}</Field>
          <Field label="Time">
            {format(new Date(booking.starts_at), "HH:mm")} –{" "}
            {format(new Date(booking.ends_at), "HH:mm")}
          </Field>
          <Field label="Duration">{duration} min</Field>
          <Field label="Price">{money(booking.total_price)}</Field>
          <Field label="Payment status">
            <span className="capitalize">{booking.payment_status ?? "unpaid"}</span>
          </Field>
          <Field label="Booking status">
            <span className="capitalize">{booking.status}</span>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">{booking.notes?.trim() ? booking.notes : "—"}</Field>
          </div>
        </dl>

        {editing && (
          <div className="space-y-2 rounded-2xl bg-secondary/50 p-3">
            <p className="text-xs font-bold uppercase text-muted-foreground">Edit appointment</p>
            <SearchableSelect
              className="min-h-10 bg-card/70"
              value={booking.staff_id}
              onChange={(next) => patch({ staff_id: next }, "Specialist updated")}
              searchPlaceholder="Search specialists…"
              options={staffOptions
                .filter((s) => s.salon_id === booking.salon_id)
                .map((s) => ({ value: s.id, label: s.full_name }))}
            />
            <div className="flex flex-wrap gap-2">
              {STATUSES.filter((s) => s !== booking.status).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => patch({ status: s }, `Marked ${s}`)}
                  className="press min-h-9 rounded-xl bg-card/70 px-3 text-xs font-bold capitalize"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="press inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold"
          >
            <PencilLine className="size-3.5" /> Edit
          </button>
          <Link
            to="/reschedule/$bookingId"
            params={{ bookingId: booking.id }}
            className="press inline-flex min-h-10 items-center rounded-xl bg-secondary px-3 text-xs font-bold"
          >
            Reschedule
          </Link>
          {booking.status !== "cancelled" &&
            (confirmCancel ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => patch({ status: "cancelled" }, "Appointment cancelled")}
                className="press inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-destructive px-3 text-xs font-bold text-destructive-foreground"
              >
                <X className="size-3.5" /> Tap to confirm cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="press inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-destructive/15 px-3 text-xs font-bold text-destructive"
              >
                <X className="size-3.5" /> Cancel
              </button>
            ))}
          <button
            type="button"
            disabled={busy || paid}
            onClick={() =>
              patch({ payment_status: "paid", paid_at: new Date().toISOString() }, "Marked paid")
            }
            className="press inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
          >
            {paid ? <Check className="size-3.5" /> : <BadgeDollarSign className="size-3.5" />}
            {paid ? "Paid" : "Mark paid"}
          </button>
          <Link
            to="/admin/appointments"
            className="press inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold"
          >
            <ExternalLink className="size-3.5" /> Open booking
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-bold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  );
}
