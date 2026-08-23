import { ChevronLeft, ChevronRight } from "lucide-react";

import { AdminButton } from "@/components/admin/ui/admin-button";

/** Simple prev/next pagination — matches what every platform page that
    paginates today actually needs (cursor/offset paging, not page numbers). */
export function AdminPagination({
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  label,
}: {
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  label?: string;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 pt-2 sm:justify-end"
    >
      {label && <p className="text-body-sm text-muted-foreground">{label}</p>}
      <div className="flex items-center gap-2">
        <AdminButton
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!hasPrevious}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </AdminButton>
        <AdminButton
          type="button"
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!hasNext}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-4" aria-hidden />
        </AdminButton>
      </div>
    </nav>
  );
}
