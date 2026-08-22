import type { ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/ui/admin-button";

/** Container for a search field + filter chips row (brief §22). */
export function AdminFilterBar({
  children,
  onClear,
  className,
}: {
  children: ReactNode;
  /** Shown as a trailing "Clear filters" action when any filter is active. */
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {onClear && (
        <AdminButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-muted-foreground"
        >
          <X className="size-3.5" aria-hidden />
          Clear filters
        </AdminButton>
      )}
    </div>
  );
}

/** A single toggleable filter chip. Plain, non-technical labels — the brief
    is explicit that filter labels should read like "Pending review", not
    "marketplace_status = pending_review". */
export function AdminFilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-label inline-flex min-h-9 cursor-pointer items-center rounded-full border px-4 transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-secondary",
      )}
    >
      {children}
    </button>
  );
}
