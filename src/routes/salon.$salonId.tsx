// Permanent redirect for the old /salon/$salonId URL. Kept as a thin shim
// (not a code back-compat layer -- the business rename dropped every other
// old name outright) purely so an already-shared or bookmarked link doesn't
// 404. Resolves straight to the business's current slug in one hop, rather
// than bouncing through the /business-id/<uuid> compatibility route.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/salon/$salonId")({
  beforeLoad: async ({ params, location }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("businesses")
      .select("slug")
      .eq("id", params.salonId)
      .maybeSingle();
    const target = data?.slug;
    if (!target) return; // No known business -- fall through to a 404 elsewhere.
    throw redirect({
      to: "/business/$businessSlug",
      params: { businessSlug: target },
      search: location.search,
      statusCode: 301,
    });
  },
});
