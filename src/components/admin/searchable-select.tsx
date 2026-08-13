import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  hint?: string | null;
  /** Optional grouping key — used by ScopedSelect (salon → item). */
  groupId?: string | null;
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Show the search box only when the list is long enough to need it. */
  searchThreshold?: number;
  disabled?: boolean;
};

/**
 * A dropdown that stays usable when there are hundreds of options: type to
 * filter, keyboard friendly, and large touch targets for low-IT users.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Type to search…",
  emptyText = "Nothing found.",
  className,
  searchThreshold = 8,
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "press inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-border/70 bg-background px-3 text-left text-sm font-semibold disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("min-w-0 truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-0"
      >
        <Command>
          {options.length >= searchThreshold ? (
            <CommandInput placeholder={searchPlaceholder} className="text-sm" />
          ) : null}
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.hint ?? ""}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="min-h-11 cursor-pointer gap-2 rounded-xl text-sm font-semibold"
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      option.value === value ? "opacity-100 text-primary" : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint ? (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      {option.hint}
                    </span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type ScopedSelectProps = {
  /** Step 1 — usually the salon list. */
  scopes: SelectOption[];
  scopeValue: string;
  onScopeChange: (value: string) => void;
  scopeLabel?: string;
  /** Step 2 — items carrying a `groupId` matching a scope value. */
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  optionLabel?: string;
  placeholder?: string;
  emptyText?: string;
  className?: string;
};

/**
 * Two-step picker: choose the salon first, then only that salon's items are
 * offered. Keeps long cross-salon lists (staff, services) manageable.
 */
export function ScopedSelect({
  scopes,
  scopeValue,
  onScopeChange,
  scopeLabel = "Salon",
  options,
  value,
  onChange,
  optionLabel = "Choose",
  placeholder = "Select…",
  emptyText = "Nothing found.",
  className,
}: ScopedSelectProps) {
  const scoped = useMemo(
    () => options.filter((o) => !scopeValue || !o.groupId || o.groupId === scopeValue),
    [options, scopeValue],
  );

  const multiScope = scopes.length > 1;

  return (
    <div className={cn("grid gap-2", multiScope && "sm:grid-cols-2", className)}>
      {multiScope ? (
        <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {scopeLabel}
          <SearchableSelect
            className="mt-1"
            value={scopeValue}
            onChange={(next) => {
              onScopeChange(next);
              const stillValid = options.some((o) => o.value === value && o.groupId === next);
              if (!stillValid) onChange("");
            }}
            options={scopes}
            placeholder="Select salon"
          />
        </label>
      ) : null}
      <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {optionLabel}
        <SearchableSelect
          className="mt-1"
          value={value}
          onChange={onChange}
          options={scoped}
          placeholder={placeholder}
          emptyText={emptyText}
        />
      </label>
    </div>
  );
}
