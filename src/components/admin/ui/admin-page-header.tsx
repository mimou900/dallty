import type { ReactNode } from "react";

import {
  AdminBreadcrumbs,
  type AdminBreadcrumbItem,
} from "@/components/admin/ui/admin-breadcrumbs";

/**
 * Canonical page header (brief §17): large title, short readable subtitle,
 * one obvious primary action.
 *
 *   Businesses
 *   Manage businesses across the Dallty marketplace.
 *   [Create business]
 */
export function AdminPageHeader({
  title,
  description,
  action,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumbs?: AdminBreadcrumbItem[];
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {breadcrumbs && <AdminBreadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-h1">{title}</h1>
          {description && (
            <p className="text-body mt-1.5 max-w-2xl text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
