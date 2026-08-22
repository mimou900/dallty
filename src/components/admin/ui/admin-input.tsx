import * as React from "react";
import { Loader2, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Canonical Super Admin text input (brief §20). Bigger than the shadcn
 * default, states for error/loading covered explicitly since the Phase 00
 * audit found 10 of 12 platform pages with no visible field-level error
 * state at all.
 */
export interface AdminInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
  loading?: boolean;
}

const baseInputClass =
  "min-h-11 w-full rounded-2xl border border-input bg-card px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50";

const AdminInput = React.forwardRef<HTMLInputElement, AdminInputProps>(
  ({ className, error, loading, disabled, ...props }, ref) => (
    <div className="relative">
      <input
        ref={ref}
        className={cn(
          baseInputClass,
          loading && "pr-11",
          error &&
            "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
          className,
        )}
        disabled={disabled || loading}
        aria-invalid={error || undefined}
        {...props}
      />
      {loading && (
        <Loader2
          className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  ),
);
AdminInput.displayName = "AdminInput";

/** Search field with a leading icon and an optional clear button. */
export interface AdminSearchInputProps extends Omit<AdminInputProps, "type"> {
  onClear?: () => void;
}

const AdminSearchInput = React.forwardRef<HTMLInputElement, AdminSearchInputProps>(
  ({ className, value, onClear, loading, ...props }, ref) => (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={ref}
        type="search"
        value={value}
        className={cn(baseInputClass, "pl-11", (onClear || loading) && "pr-11", className)}
        {...props}
      />
      {loading ? (
        <Loader2
          className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          aria-hidden
        />
      ) : (
        onClear &&
        typeof value === "string" &&
        value.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )
      )}
    </div>
  ),
);
AdminSearchInput.displayName = "AdminSearchInput";

const AdminTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }
>(({ className, error, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-24 w-full resize-y rounded-2xl border border-input bg-card px-4 py-3 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
      error &&
        "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
      className,
    )}
    aria-invalid={error || undefined}
    {...props}
  />
));
AdminTextarea.displayName = "AdminTextarea";

/** Label + helper/error text, wired together for accessibility. */
export function AdminFieldLabel({
  htmlFor,
  children,
  optional,
}: {
  htmlFor: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="text-label mb-1.5 block text-foreground">
      {children}
      {optional && <span className="ml-1 font-medium text-muted-foreground">(optional)</span>}
    </label>
  );
}

export function AdminFieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1.5 text-sm font-medium text-destructive">
      {children}
    </p>
  );
}

export { AdminInput, AdminSearchInput, AdminTextarea };
