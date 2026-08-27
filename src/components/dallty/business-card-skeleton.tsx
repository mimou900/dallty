import { Skeleton } from "@/components/dallty/skeleton";

/**
 * Placeholder for the compact `BusinessCard` (the homepage discovery rails),
 * matching its real dimensions exactly — same `glass-warm` article shell, same
 * 16:10 image area, same badge/favorite footprint, same three text lines and
 * CTA height — so nothing shifts when real data replaces it. This exists
 * specifically for "Recommended for you", the one rail backed by a real network
 * fetch (Trending/New render from static, already-in-memory fixture data with
 * no loading state to bridge).
 */
export function BusinessCardSkeleton() {
  return (
    <article
      aria-hidden
      className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-soft"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <Skeleton variant="image" className="absolute inset-0 rounded-none" />
        <Skeleton variant="button" className="absolute start-3 top-3 h-6 w-20 bg-primary/15" />
        <Skeleton
          variant="circle"
          className="absolute end-3 top-3 size-11 rounded-2xl bg-primary/15"
        />
      </div>
      <div className="space-y-2.5 p-4 sm:p-5">
        <Skeleton variant="text" className="h-4 w-3/5" />
        <Skeleton variant="text" className="w-2/5" />
        <Skeleton variant="text" className="w-1/2" />
        <Skeleton variant="button" className="mt-3 h-11 w-full" />
      </div>
    </article>
  );
}
