import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useManagedBranches, useManagedServices, useManagedStaff, money } from "@/lib/admin";
import { createWalkInBooking } from "@/lib/booking-engine.functions";
import { listBusinessCustomers } from "@/lib/business-crm.functions";

/**
 * Staff-authorized walk-in booking (brief §17-20): existing customer or guest (name+phone,
 * no account required) -> service(s) -> a specific specialist or "any available" -> start
 * now or a scheduled time -> booking created straight to 'confirmed'. Wraps
 * createWalkInBooking (booking-engine.functions.ts), extended in Phase 2 to support the
 * any-specialist option this dialog exposes.
 */
export function WalkInDialog({
  businessId,
  onCreated,
}: {
  businessId: string;
  onCreated?: (bookingId: string, reference: string) => void;
}) {
  const queryClient = useQueryClient();
  const createWalkIn = useServerFn(createWalkInBooking);
  const fetchCustomers = useServerFn(listBusinessCustomers);

  const [open, setOpen] = useState(false);
  const [customerMode, setCustomerMode] = useState<"existing" | "guest">("guest");
  const [customerId, setCustomerId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [branchId, setBranchId] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string>(""); // "" = any available
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");

  const branchesQuery = useManagedBranches([businessId]);
  const branches = branchesQuery.data ?? [];
  const servicesQuery = useManagedServices([businessId]);
  const services = (servicesQuery.data ?? []).filter((s) => s.is_active);
  const staffQuery = useManagedStaff([businessId]);
  const staff = staffQuery.data ?? [];
  const customersQuery = useQuery({
    queryKey: ["walk-in-customers", businessId],
    enabled: open,
    queryFn: () => fetchCustomers({ data: { businessId } }),
  });
  const customers = customersQuery.data ?? [];

  const totalPrice = useMemo(
    () =>
      services.filter((s) => serviceIds.includes(s.id)).reduce((sum, s) => sum + (s.price ?? 0), 0),
    [services, serviceIds],
  );

  const create = useMutation({
    mutationFn: () =>
      createWalkIn({
        data: {
          businessId,
          branchId: branchId || undefined,
          serviceIds,
          staffId: staffId || null,
          startsAt:
            scheduleMode === "now" || !startsAt ? undefined : new Date(startsAt).toISOString(),
          customerId: customerMode === "existing" ? customerId || undefined : undefined,
          customerName: customerMode === "guest" ? guestName.trim() || undefined : undefined,
          customerPhone: customerMode === "guest" ? guestPhone.trim() || undefined : undefined,
          notes: notes.trim() || undefined,
        },
      }),
    onSuccess: (result) => {
      toast.success(`Walk-in booked — ${result.reference}`);
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["admin-confirmations"] });
      setOpen(false);
      setServiceIds([]);
      setStaffId("");
      setGuestName("");
      setGuestPhone("");
      setCustomerId("");
      setNotes("");
      onCreated?.(result.id, result.reference);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not create walk-in"),
  });

  function toggleService(id: string) {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const canSubmit =
    serviceIds.length > 0 &&
    (customerMode === "existing"
      ? Boolean(customerId)
      : Boolean(guestName.trim() && guestPhone.trim()));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="press flex min-h-10 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <Sparkles className="size-4" /> Walk-in
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle>New walk-in</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return toast.error("Pick a service and a customer");
            create.mutate();
          }}
          className="space-y-4"
        >
          <div className="flex gap-1 rounded-2xl bg-secondary p-1">
            {(["guest", "existing"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setCustomerMode(m)}
                className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-bold ${customerMode === m ? "bg-background shadow-soft" : "text-muted-foreground"}`}
              >
                {m === "guest" ? "Guest" : "Existing customer"}
              </button>
            ))}
          </div>

          {customerMode === "guest" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Name"
                className="min-h-11 rounded-2xl bg-secondary/60 px-4 text-sm outline-none ring-ring focus:ring-2"
              />
              <input
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder="+213…"
                className="min-h-11 rounded-2xl bg-secondary/60 px-4 text-sm outline-none ring-ring focus:ring-2"
              />
            </div>
          ) : (
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="min-h-11 w-full rounded-2xl bg-secondary/60 px-4 text-sm"
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName ?? "Customer"}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          )}

          {branches.length > 1 && (
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="min-h-11 w-full rounded-2xl bg-secondary/60 px-4 text-sm"
            >
              <option value="">Main branch</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground">Services</p>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleService(s.id)}
                  className={`rounded-2xl px-3 py-1.5 text-xs font-bold ${serviceIds.includes(s.id) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                >
                  {s.name}
                </button>
              ))}
            </div>
            {serviceIds.length > 0 && (
              <p className="text-xs text-muted-foreground">Total: {money(totalPrice)}</p>
            )}
          </div>

          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="min-h-11 w-full rounded-2xl bg-secondary/60 px-4 text-sm"
          >
            <option value="">Any available specialist</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>

          <div className="flex gap-1 rounded-2xl bg-secondary p-1">
            {(["now", "later"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setScheduleMode(m)}
                className={`flex-1 rounded-xl px-3 py-1.5 text-xs font-bold ${scheduleMode === m ? "bg-background shadow-soft" : "text-muted-foreground"}`}
              >
                {m === "now" ? "Start now" : "Scheduled time"}
              </button>
            ))}
          </div>
          {scheduleMode === "later" && (
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="min-h-11 w-full rounded-2xl bg-secondary/60 px-4 text-sm"
            />
          )}

          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Note (optional)"
            className="min-h-11 w-full rounded-2xl bg-secondary/60 px-4 text-sm outline-none ring-ring focus:ring-2"
          />

          <button
            type="submit"
            disabled={!canSubmit || create.isPending}
            className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />} Create walk-in
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
