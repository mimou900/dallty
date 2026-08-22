import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Table visual foundation (brief §21) — large, clean, airy. Roomier than the
 * shadcn default (`h-10`/`p-2`/`text-sm`): soft row separators instead of
 * heavy borders, comfortable cell padding, base body-text size. Mobile
 * transformation is deferred (brief: "will be defined later") — wrap in
 * `AdminTableScroll` so wide tables scroll their own axis instead of
 * clipping (the concrete bug Phase 00 found in `reconciliation.tsx`).
 */
const AdminTableScroll = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("w-full overflow-x-auto rounded-3xl border border-border/60", className)}
    {...props}
  />
);

const AdminTable = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <table
      ref={ref}
      className={cn("w-full min-w-[640px] border-collapse text-left", className)}
      {...props}
    />
  ),
);
AdminTable.displayName = "AdminTable";

const AdminTableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("bg-secondary/60", className)} {...props} />
));
AdminTableHeader.displayName = "AdminTableHeader";

const AdminTableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />
));
AdminTableBody.displayName = "AdminTableBody";

const AdminTableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/40",
      className,
    )}
    {...props}
  />
));
AdminTableRow.displayName = "AdminTableRow";

const AdminTableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "text-label h-12 px-4 align-middle text-muted-foreground first:pl-5 last:pr-5",
      className,
    )}
    {...props}
  />
));
AdminTableHead.displayName = "AdminTableHead";

const AdminTableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("min-h-14 px-4 py-3.5 align-middle text-body-sm first:pl-5 last:pr-5", className)}
    {...props}
  />
));
AdminTableCell.displayName = "AdminTableCell";

export {
  AdminTableScroll,
  AdminTable,
  AdminTableHeader,
  AdminTableBody,
  AdminTableRow,
  AdminTableHead,
  AdminTableCell,
};
