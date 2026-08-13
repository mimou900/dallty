// Permanent redirect for the old /salon/$salonId URL. Kept as a thin shim
// (not a code back-compat layer — the business rename dropped every other
// old name outright) purely so an already-shared or bookmarked link doesn't
// 404. Preserves the search string (e.g. ?book=true) across the redirect.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/salon/$salonId")({
  beforeLoad: ({ params, location }) => {
    throw redirect({
      to: "/business/$businessId",
      params: { businessId: params.salonId },
      search: location.search,
      replace: true,
    });
  },
});
