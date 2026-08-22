import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Solid card — the default admin surface (brief §4: white elevated content
 * over the cream canvas). Use this, not AdminGlassCard, for ordinary content
 * — glass is reserved for floating/overlay surfaces (brief §10).
 */
const AdminCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-3xl border border-border/60 bg-card p-5 shadow-elevation-low sm:p-6",
        className,
      )}
      {...props}
    />
  ),
);
AdminCard.displayName = "AdminCard";

/** Glass variant — floating controls, selected/contextual surfaces, drawers. */
const AdminGlassCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("glass rounded-3xl p-5 sm:p-6", className)} {...props} />
  ),
);
AdminGlassCard.displayName = "AdminGlassCard";

const AdminCardHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mb-4 flex items-start justify-between gap-3", className)} {...props} />
);

const AdminCardTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn("text-h3", className)} {...props} />
);

const AdminCardDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-body-sm mt-1 text-muted-foreground", className)} {...props} />
);

export { AdminCard, AdminGlassCard, AdminCardHeader, AdminCardTitle, AdminCardDescription };
