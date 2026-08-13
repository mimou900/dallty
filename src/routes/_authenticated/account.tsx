import { createFileRoute, redirect } from "@tanstack/react-router";

/** Account & security now lives inside the profile page — keep the URL working. */
export const Route = createFileRoute("/_authenticated/account")({
  beforeLoad: () => {
    throw redirect({ to: "/profile", replace: true });
  },
  component: () => null,
});
