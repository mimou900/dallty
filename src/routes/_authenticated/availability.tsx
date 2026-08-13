import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/availability")({
  validateSearch: (search: Record<string, unknown>) => ({
    staff: typeof search.staff === "string" ? search.staff : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/availability", search, replace: true });
  },
});
