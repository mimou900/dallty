import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CircleAlert, Info, ShieldAlert, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const adminBadgeVariants = cva("inline-flex items-center gap-1.5 rounded-xl px-3 py-1 text-label", {
  variants: {
    variant: {
      neutral: "bg-neutral text-neutral-foreground",
      primary: "bg-secondary text-secondary-foreground",
      success: "bg-success/15 text-success",
      warning: "bg-warning/20 text-warning-foreground",
      error: "bg-error/12 text-error",
      info: "bg-info/15 text-info-foreground",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
});

export interface AdminBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof adminBadgeVariants> {}

/** Generic pill badge — replaces the drifting inline `<span>` markup Phase 00
    found repeated independently across `users.tsx`/`businesses.tsx`/etc. */
function AdminBadge({ className, variant, ...props }: AdminBadgeProps) {
  return <span className={cn(adminBadgeVariants({ variant }), className)} {...props} />;
}

/**
 * Status badge for entity lifecycle state (brief §12). Combines color with a
 * label and an icon — never color alone, per the brief's explicit
 * accessibility instruction.
 */
export type AdminStatus = "success" | "warning" | "error" | "info" | "neutral";

const STATUS_ICON: Record<AdminStatus, React.ComponentType<{ className?: string }>> = {
  success: ShieldCheck,
  warning: AlertTriangle,
  error: CircleAlert,
  info: Info,
  neutral: Info,
};

function AdminStatusBadge({
  status,
  children,
  className,
}: {
  status: AdminStatus;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return (
    <AdminBadge variant={status} className={className}>
      <Icon className="size-3.5" aria-hidden />
      {children}
    </AdminBadge>
  );
}

/**
 * Risk badge for the future Level 0-4 admin-action classification (brief
 * §13, master schema §5). Deliberately restrained — a small tinted pill, not
 * a full-bleed alert, so a Level 4 badge sits calmly next to a Level 0 one
 * rather than making the page look alarmist.
 */
export type AdminRiskLevel = 0 | 1 | 2 | 3 | 4;

const RISK_LABEL: Record<AdminRiskLevel, string> = {
  0: "View",
  1: "Low risk",
  2: "Medium risk",
  3: "High risk",
  4: "Critical",
};

const RISK_CLASS: Record<AdminRiskLevel, string> = {
  0: "bg-neutral text-neutral-foreground",
  1: "bg-info/15 text-info-foreground",
  2: "bg-warning/20 text-warning-foreground",
  3: "bg-risk-3/15 text-risk-3-foreground",
  4: "bg-error/12 text-error",
};

function AdminRiskBadge({ level, className }: { level: AdminRiskLevel; className?: string }) {
  return (
    <span className={cn(adminBadgeVariants({ variant: null }), RISK_CLASS[level], className)}>
      {level >= 3 && <ShieldAlert className="size-3.5" aria-hidden />}
      {RISK_LABEL[level]}
    </span>
  );
}

export { AdminBadge, adminBadgeVariants, AdminStatusBadge, AdminRiskBadge };
