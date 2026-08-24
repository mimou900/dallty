/**
 * Generic pending screen — the router's `defaultPendingComponent` for every route except
 * "/", which gets its own branded BootSplash instead (see router.tsx). Shows a plausible
 * page shape instead of a blank screen or the home page's splash bleeding into an
 * unrelated route. Individual routes/components should still prefer their own
 * content-shaped skeleton where one exists (e.g. bookings.tsx's own pulse blocks); this is
 * the floor for everything that doesn't.
 */
export function RouteSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4">
      <div className="flex items-center gap-3 rounded-3xl glass px-4 py-3">
        <div className="size-11 shrink-0 animate-pulse rounded-2xl bg-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3 w-1/3 animate-pulse rounded-full bg-muted" />
          <div className="h-2.5 w-1/2 animate-pulse rounded-full bg-muted" />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-3xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
