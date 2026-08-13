import { useState } from "react";
import { format } from "date-fns";
import { AlertCircle, CalendarOff, Trash2 } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type TimeOffRow = { id: string; day: string; reason: string };

type Props = {
  rows: TimeOffRow[];
  error?: string | null;
  onAdd: (day: string, reason: string) => void;
  onRemove: (id: string) => void;
};

export function ClosedDates({ rows, error, onAdd, onRemove }: Props) {
  const [reason, setReason] = useState("");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selected = rows.map((r) => new Date(`${r.day}T00:00:00`));

  function handleSelect(day: Date | undefined) {
    if (!day) return;
    const key = format(day, "yyyy-MM-dd");
    const existing = rows.find((r) => r.day === key);
    if (existing) onRemove(existing.id);
    else onAdd(key, reason.trim());
  }

  return (
    <section className="mt-5 rounded-3xl glass p-5">
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <CalendarOff className="size-5 text-primary" />
        Days off
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Tap a date to close it. Tap it again to open it back up.
      </p>

      <input
        aria-label="Reason for closing (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional) — holiday, travel…"
        className="mt-3 min-h-11 w-full rounded-xl glass-soft px-3 text-sm font-semibold"
      />

      <div className="mt-3 flex justify-center">
        <Calendar
          mode="single"
          onSelect={handleSelect}
          selected={undefined}
          modifiers={{ closed: selected }}
          modifiersClassNames={{
            closed: "bg-destructive text-destructive-foreground rounded-md font-bold",
          }}
          disabled={{ before: today }}
          className={cn("rounded-2xl glass-soft p-3 pointer-events-auto")}
        />
      </div>

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="mt-4 space-y-2">
        {rows.length ? (
          rows.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl glass-soft px-4 py-3">
              <span className="text-sm font-semibold">
                {format(new Date(`${t.day}T00:00:00`), "EEE d MMM yyyy")}
              </span>
              {t.reason && <span className="text-xs text-muted-foreground">{t.reason}</span>}
              <button
                type="button"
                aria-label="Remove closed date"
                onClick={() => onRemove(t.id)}
                className="ms-auto grid size-9 place-items-center rounded-xl bg-secondary"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No days off yet.</p>
        )}
      </div>
    </section>
  );
}
