import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // getSession() reads the persisted session and transparently refreshes an
    // expired access token, so a signed-in user is recognised immediately —
    // even right after signup or a hard refresh, and without a network round
    // trip that could bounce them to /auth on a flaky connection.
    let { data } = await supabase.auth.getSession();
    if (!data.session) {
      const refreshed = await supabase.auth.refreshSession();
      data = { session: refreshed.data.session };
    }
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});

