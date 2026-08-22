import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A titled content grouping within a page — the generous-whitespace section
    rhythm the brief's visual direction depends on (brief §7). */
export function AdminSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-6 sm:py-8", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            {title && <h2 className="text-h3">{title}</h2>}
            {description && (
              <p className="text-body-sm mt-1 text-muted-foreground">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function AdminDivider({ className }: { className?: string }) {
  return <hr className={cn("border-t border-border/60", className)} />;
}
