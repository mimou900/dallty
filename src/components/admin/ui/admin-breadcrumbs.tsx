import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export type AdminBreadcrumbItem = {
  label: string;
  to?: string;
};

/** The Phase 00 audit found no breadcrumbs anywhere in the admin shell —
    this is the reusable primitive for wherever they're added. */
export function AdminBreadcrumbs({ items }: { items: AdminBreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1.5 text-body-sm text-muted-foreground">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 && <ChevronRight className="size-3.5 shrink-0" aria-hidden />}
              <li>
                {item.to && !isLast ? (
                  <Link to={item.to} className="rounded px-1 hover:text-foreground hover:underline">
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={isLast ? "font-semibold text-foreground" : ""}
                  >
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
