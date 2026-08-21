import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { money } from "@/lib/admin";
import { markCashPayment } from "@/lib/financial.functions";

const REASONS = [
  { value: "tip", label: "Tip" },
  { value: "extra_service", label: "Extra service" },
  { value: "discount_adjustment", label: "Discount" },
  { value: "other", label: "Other" },
] as const;

/**
 * Cash settlement dialog (brief §29-31): the expected amount is always read server-side from
 * `bookings.total_price` — never trusted from this form. A difference between what's typed
 * here and that server-computed expectation requires an explicit reason before markCashPayment
 * will accept it (DIFFERENCE_REASON_REQUIRED), matching the brief's worked examples exactly:
 * an overage needs tip/extra_service/other, a shortfall needs discount_adjustment/other.
 */
export function CashPaymentDialog({
  bookingId,
  expectedAmount,
  currency,
  open,
  onOpenChange,
}: {
  bookingId: string;
  expectedAmount: number;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const markPaid = useServerFn(markCashPayment);
  const [received, setReceived] = useState(String(expectedAmount));
  const [reason, setReason] = useState<(typeof REASONS)[number]["value"] | "">("");
  const [note, setNote] = useState("");

  const diff = Math.round((Number(received || 0) - expectedAmount) * 100) / 100;
  const needsReason = Math.abs(diff) > 0.005;

  const submit = useMutation({
    mutationFn: () =>
      markPaid({
        data: {
          bookingId,
          receivedAmount: Number(received),
          differenceReason: needsReason ? (reason as (typeof REASONS)[number]["value"]) : undefined,
          differenceNote: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      onOpenChange(false);
      setReason("");
      setNote("");
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Could not record payment";
      const friendly: Record<string, string> = {
        DIFFERENCE_REASON_REQUIRED: "Pick a reason for the difference from expected.",
        DIFFERENCE_NOTE_REQUIRED: 'Add a short note for "Other".',
        INVALID_DIFFERENCE_REASON: "That reason doesn't match the direction of the difference.",
      };
      toast.error(friendly[message] ?? message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle>Record cash payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Expected:{" "}
            <span className="font-bold text-foreground">{money(expectedAmount, currency)}</span>
          </p>
          <label className="block text-sm font-bold">
            Amount received
            <input
              type="number"
              step="0.01"
              min="0"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-2xl bg-secondary/60 px-4 text-sm outline-none ring-ring focus:ring-2"
            />
          </label>
          {needsReason && (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-bold text-muted-foreground">
                  {diff > 0 ? "Why more than expected?" : "Why less than expected?"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {REASONS.filter((r) =>
                    diff > 0
                      ? r.value !== "discount_adjustment"
                      : r.value !== "tip" && r.value !== "extra_service",
                  ).map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      className={`rounded-2xl px-3 py-1.5 text-xs font-bold ${reason === r.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {reason === "other" && (
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Explain the difference…"
                  className="min-h-11 w-full rounded-2xl bg-secondary/60 px-4 text-sm outline-none ring-ring focus:ring-2"
                />
              )}
            </>
          )}
          <button
            type="button"
            disabled={!received || (needsReason && !reason) || submit.isPending}
            onClick={() => submit.mutate()}
            className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {submit.isPending && <Loader2 className="size-4 animate-spin" />} Confirm payment
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
