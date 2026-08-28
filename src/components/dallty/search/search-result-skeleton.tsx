import { Skeleton } from "@/components/dallty/skeleton";

/**
 * Matches `SearchResultCard`'s real dimensions exactly (Search redesign
 * §17) — same article shell, same 4:3 gallery area, same badge/favorite
 * footprint, same text-line stack — so nothing shifts when real data
 * replaces it. Replaces `skeletons.tsx`'s `SearchSkeleton`, which was built
 * against neither this card nor the old one (confirmed during planning).
 */
export function SearchResultSkeleton() {
  return (
    <article
      aria-hidden
      className="overflow-hidden rounded-3xl border border-border/50 bg-card shadow-soft"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Skeleton variant="image" className="absolute inset-0 rounded-none" />
        <Skeleton
          variant="circle"
          className="absolute end-3 top-3 size-11 rounded-2xl bg-primary/15"
        />
      </div>
      <div className="space-y-2.5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton variant="text" className="h-4 w-2/5" />
          <Skeleton variant="text" className="h-4 w-10" />
        </div>
        <Skeleton variant="text" className="w-4/5" />
        <Skeleton variant="text" className="w-2/5" />
      </div>
    </article>
  );
}
