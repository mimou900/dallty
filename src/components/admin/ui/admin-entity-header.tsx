import type { ReactNode } from "react";

import {
  AdminBreadcrumbs,
  type AdminBreadcrumbItem,
} from "@/components/admin/ui/admin-breadcrumbs";

/**
 * Canonical entity-detail header (brief §18):
 *
 *   Bella Beauty
 *   Beauty Salon · Algeria
 *   [Active] [Premium]
 *   [Edit] [View public] [More]
 */
export function AdminEntityHeader({
  name,
  meta,
  status,
  actions,
  breadcrumbs,
}: {
  name: string;
  /** Short context line — type, location, whatever grounds the entity. */
  meta?: string;
  /** Status/tag badges — pass AdminStatusBadge/AdminBadge elements. */
  status?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: AdminBreadcrumbItem[];
}) {
  return (
    <header className="mb-6 sm:mb-8">
      {breadcrumbs && <AdminBreadcrumbs items={breadcrumbs} />}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <h1 className="text-h2 truncate">{name}</h1>
          {meta && <p className="text-body-sm mt-1 text-muted-foreground">{meta}</p>}
          {status && <div className="mt-3 flex flex-wrap items-center gap-2">{status}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
