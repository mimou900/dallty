import type { ReactNode } from "react";
import { FileQuestion, ShieldAlert, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Canonical result states (brief §27-30). The Phase 00 audit found every
 * platform page hand-rolling its own version of these — some with icons,
 * some without, several with none at all, and zero shared error state
 * across 10 of 12 pages. This file is the single definition for all four.
 */
function AdminResultState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-14 text-center",
        className,
      )}
    >
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <div className="space-y-1">
        <p className="text-h3">{title}</p>
        {description && (
          <p className="text-body-sm max-w-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/**
 *   No businesses found
 *   Try changing your filters or search.
 *   [Clear filters]
 */
export function AdminEmptyState({
  title = "Nothing here yet",
  description,
  action,
  icon = FileQuestion,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <AdminResultState
      icon={icon}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

/**
 *   Something went wrong
 *   We couldn't load these businesses.
 *   [Try again]
 *
 * Never pass raw SQL/RPC/stack-trace/internal-ID text as `description` —
 * this component doesn't sanitize its input, the caller must (the server
 * layer already does this via `sanitizeDbError`; this is the UI-side rule
 * that keeps it that way).
 */
export function AdminErrorState({
  title = "Something went wrong",
  description = "Please try again in a moment.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <AdminResultState
      icon={TriangleAlert}
      title={title}
      description={description}
      className={cn("border-error/25 bg-error/5", className)}
      action={
        onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="press mt-1 min-h-11 rounded-2xl bg-primary px-5 text-button text-primary-foreground"
          >
            Try again
          </button>
        )
      }
    />
  );
}

/**
 *   Access restricted
 *   You don't have permission to perform this action.
 *
 * Never states which role/permission was missing or why — that detail
 * belongs in the audit/security log, not in front of the person being
 * denied.
 */
export function AdminPermissionDenied({
  description = "You don't have permission to perform this action.",
  className,
}: {
  description?: string;
  className?: string;
}) {
  return (
    <AdminResultState
      icon={ShieldAlert}
      title="Access restricted"
      description={description}
      className={cn("border-border bg-secondary/40", className)}
    />
  );
}

/**
 *   Business not found
 *   It may have been removed or the link may be out of date.
 */
export function AdminNotFound({
  entity = "Item",
  className,
}: {
  entity?: string;
  className?: string;
}) {
  return (
    <AdminResultState
      icon={FileQuestion}
      title={`${entity} not found`}
      description="It may have been removed, or the link may be out of date."
      className={className}
    />
  );
}
