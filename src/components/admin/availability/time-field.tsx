import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

/** "14:30" -> "2:30 PM" — friendly for non-technical users. */
export function friendlyTime(value: string | null | undefined) {
  if (!value) return "--:--";
  const [hRaw, m] = value.slice(0, 5).split(":");
  const h = Number(hRaw);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

type Props = {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
  invalid?: boolean;
  disabled?: boolean;
};

const GROUPS: { title: string; from: number; to: number }[] = [
  { title: "Morning", from: 5, to: 11 },
  { title: "Afternoon", from: 12, to: 16 },
  { title: "Evening", from: 17, to: 21 },
  { title: "Late night", from: 22, to: 28 },
];

export function TimeField({ label, value, onChange, ariaLabel, invalid, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = value?.slice(0, 5) ?? null;
  const listRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({
        title: g.title,
        options: TIME_OPTIONS.filter((t) => {
          const h = Number(t.slice(0, 2));
          const norm = h < 5 ? h + 24 : h;
          return norm >= g.from && norm <= g.to;
        }),
      })).filter((g) => g.options.length),
    [],
  );

  // Scroll the current value into view so the list never opens on an unrelated hour.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "center" });
    }, 30);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={invalid ? true : undefined}
          className={cn(
            "press flex min-h-16 w-full flex-1 flex-col items-start justify-center rounded-2xl px-4 text-start disabled:opacity-50",
            invalid ? "bg-destructive/10 ring-1 ring-destructive" : "glass-soft",
          )}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="flex items-center gap-1.5 text-lg font-extrabold">
            <Clock className="size-4 shrink-0 text-primary" />
            {friendlyTime(selected)}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] p-0"
      >
        <p className="border-b px-4 py-3 text-sm font-extrabold">{label}</p>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {groups.map((g) => (
            <div key={g.title} className="mb-1">
              <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {g.title}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {g.options.map((opt) => {
                  const isActive = opt === selected;
                  return (
                    <button
                      key={opt}
                      type="button"
                      data-active={isActive}
                      onClick={() => {
                        onChange(opt);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between gap-1 rounded-xl px-3 text-sm font-bold",
                        isActive ? "bg-primary text-primary-foreground" : "bg-secondary/60 hover:bg-secondary",
                      )}
                    >
                      {friendlyTime(opt)}
                      {isActive && <Check className="size-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
