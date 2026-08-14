// Compatibility route for pre-slug links: /business-id/<uuid> -> permanent
// redirect to the business's current slug. Keeps the canonical
// /business/$businessSlug route free of UUID-detection branching.
import { createFileRoute, redirect } from "@tanstack/react-router";

function LegacyBusinessNotFound() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-lg place-items-center px-6 text-center">
      <div className="rounded-3xl glass p-8">
        <h1 className="text-xl font-extrabold">This shop is no longer available</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be out of date, or the shop is not listed right now.
        </p>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/business-id/$businessId")({
  beforeLoad: async ({ params }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("businesses")
      .select("slug")
      .eq("id", params.businessId)
      .maybeSingle();
    if (!data) return;
    throw redirect({
      to: "/business/$businessSlug",
      params: { businessSlug: data.slug },
      statusCode: 301,
    });
  },
  notFoundComponent: LegacyBusinessNotFound,
  component: LegacyBusinessNotFound,
});
