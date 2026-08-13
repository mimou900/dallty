import { useState } from "react";
import { AlertCircle, Coffee, Copy, Plus, Trash2 } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimeField, friendlyTime } from "./time-field";

export type BreakRow = {
  id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  label: string;
};

export type Preset = { label: string; starts_at: string; ends_at: string };

export const PRESETS: Preset[] = [
  { label: "Morning 9–1", starts_at: "09:00", ends_at: "13:00" },
  { label: "Full day 10–8", starts_at: "10:00", ends_at: "20:00" },
  { label: "Evening 2–10", starts_at: "14:00", ends_at: "22:00" },
];

const BREAK_LABELS = ["Lunch", "Prayer", "Cleanup", "Rest"];

type Props = {
  dayLabel: string;
  weekday: number;
  shift: { starts_at: string; ends_at: string } | null;
  breaks: BreakRow[];
  error?: string;
  breakError?: string;
  onToggle: (open: boolean) => void;
  onChange: (starts_at: string, ends_at: string) => void;
  onCopyAll: () => void;
  onCopyWeekdays: () => void;
  onAddBreak: (input: { weekday: number; starts_at: string; ends_at: string; label: string }) => void;
  onRemoveBreak: (id: string) => void;
};

export function DayCard({
  dayLabel,
  weekday,
  shift,
  breaks,
  error,
  breakError,
  onToggle,
  onChange,
  onCopyAll,
  onCopyWeekdays,
  onAddBreak,
  onRemoveBreak,
}: Props) {
  const open = Boolean(shift);
  const [breakOpen, setBreakOpen] = useState(false);
  const [draft, setDraft] = useState({ starts_at: "13:00", ends_at: "14:00", label: "Lunch" });

  const start = shift?.starts_at?.slice(0, 5) ?? "10:00";
  const end = shift?.ends_at?.slice(0, 5) ?? "20:00";

  return (
    <div className="rounded-3xl glass-soft p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-extrabold">{dayLabel}</p>
          <p className="text-xs text-muted-foreground">
            {open
              ? `Open ${friendlyTime(start)} – ${friendlyTime(end)}${
                  breaks.length ? ` · ${breaks.length} break${breaks.length > 1 ? "s" : ""}` : ""
                }`
              : "Closed all day"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground">{open ? "Open" : "Closed"}</span>
          <Switch
            checked={open}
            aria-label={`${dayLabel} open`}
            onCheckedChange={(checked) => onToggle(checked)}
          />
        </div>
      </div>

      {open && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.starts_at, p.ends_at)}
                className="press min-h-9 rounded-full bg-secondary px-3 text-xs font-bold"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-stretch gap-2">
            <TimeField
              label="Starts"
              ariaLabel={`${dayLabel} start time`}
              value={start}
              invalid={Boolean(error)}
              onChange={(v) => onChange(v, end)}
            />
            <TimeField
              label="Ends"
              ariaLabel={`${dayLabel} end time`}
              value={end}
              invalid={Boolean(error)}
              onChange={(v) => onChange(start, v)}
            />
          </div>

          {error && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopyAll}
              className="press flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-bold"
            >
              <Copy className="size-3.5" /> Copy to all days
            </button>
            <button
              type="button"
              onClick={onCopyWeekdays}
              className="press flex min-h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-bold"
            >
              <Copy className="size-3.5" /> Copy to Mon–Fri
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {breaks.map((b) => (
              <div key={b.id} className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2">
                <Coffee className="size-4 text-primary" />
                <span className="text-xs font-bold">
                  {friendlyTime(b.starts_at)} – {friendlyTime(b.ends_at)}
                </span>
                <span className="text-xs text-muted-foreground">{b.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${b.label} break on ${dayLabel}`}
                  onClick={() => onRemoveBreak(b.id)}
                  className="ms-auto grid size-8 place-items-center rounded-lg glass-soft"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}

            <Popover open={breakOpen} onOpenChange={setBreakOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="press flex min-h-10 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-bold"
                >
                  <Plus className="size-3.5" /> Add break
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-3 p-3">
                <p className="text-sm font-extrabold">Break on {dayLabel}</p>
                <div className="flex items-stretch gap-2">
                  <TimeField
                    label="From"
                    ariaLabel="Break start"
                    value={draft.starts_at}
                    onChange={(v) => setDraft({ ...draft, starts_at: v })}
                  />
                  <TimeField
                    label="To"
                    ariaLabel="Break end"
                    value={draft.ends_at}
                    onChange={(v) => setDraft({ ...draft, ends_at: v })}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {BREAK_LABELS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setDraft({ ...draft, label: l })}
                      aria-pressed={draft.label === l}
                      className={`min-h-9 rounded-full px-3 text-xs font-bold ${
                        draft.label === l ? "bg-primary text-primary-foreground" : "bg-secondary"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {breakError && (
                  <p role="alert" className="flex items-start gap-1.5 text-xs font-semibold text-destructive">
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    {breakError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => onAddBreak({ weekday, ...draft })}
                  className="press min-h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground"
                >
                  Save break
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}
