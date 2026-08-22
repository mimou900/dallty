import { Skeleton } from "@/components/ui/skeleton";

/**
 * Reusable skeleton system (brief §17-18). Each skeleton mirrors the shape of
 * its real destination layout so the transition from loading -> loaded state
 * doesn't jump. Compose these instead of ad hoc `animate-pulse` divs.
 */

export function BusinessCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl glass" aria-hidden>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
          <Skeleton className="h-7 w-14 shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-2/3" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-11 rounded-2xl" />
          <Skeleton className="h-11 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export function SearchSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label="Loading results"
    >
      {Array.from({ length: count }, (_, i) => (
        <BusinessCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function BusinessPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading business" aria-hidden>
      <Skeleton className="h-56 w-full rounded-4xl sm:h-72" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center justify-between rounded-3xl glass p-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3.5 w-24" />
            </div>
            <Skeleton className="h-9 w-20 rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BookingSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading booking" aria-hidden>
      <Skeleton className="h-6 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading calendar" aria-hidden>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 21 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading dashboard" aria-hidden>
      <div className="flex gap-3">
        <Skeleton className="h-11 w-32 rounded-2xl" />
        <Skeleton className="h-11 w-32 rounded-2xl" />
        <Skeleton className="h-11 w-32 rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-3xl glass p-4">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading table" aria-hidden>
      <Skeleton className="h-10 w-full rounded-2xl" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading profile" aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Generic loading state for a list of glass-card rows (customers, staff, etc). */
export function ListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
      aria-label="Loading"
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-3xl" />
      ))}
    </div>
  );
}

export function ReviewSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading reviews" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2 rounded-3xl glass p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      ))}
    </div>
  );
}
