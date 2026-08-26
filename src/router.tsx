import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { supabase } from "@/integrations/supabase/client";
import { setOtpPending } from "@/lib/session";
import { RouteSkeleton } from "@/components/dallty/route-skeleton";

/**
 * `assertSuperAdmin`/`assertCanManageBusiness` (src/lib/platform.server.ts,
 * business-crm.server.ts) both require a session-scoped OTP step-up
 * (src/lib/step-up.server.ts) before letting a sensitive action through —
 * this exact string is what they throw. The client-side "have I stepped up"
 * flag (isOtpPending, src/lib/session.ts) is only ever set by the
 * password-sign-in path in auth.tsx; the phone/email OTP "Continue" flows
 * (the default sign-in method) never set it, and Supabase session rotation
 * can desync it even when it was set correctly. Rather than leave every
 * caller of a step-up-gated server function to notice and handle that
 * mismatch itself, this one global handler catches it wherever it happens —
 * a query OR a mutation, on any page — and routes the user through the
 * existing, already-correct /verify-otp flow instead of leaving them stuck
 * looking at raw error text with no way to comply.
 */
const STEP_UP_ERROR = "Security verification required";

function handleStepUpError(error: unknown) {
  if (!(error instanceof Error) || !error.message.includes(STEP_UP_ERROR)) return;
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) setOtpPending(data.session.user.id);
    const next = window.location.pathname + window.location.search;
    window.location.assign(`/verify-otp?next=${encodeURIComponent(next)}`);
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: handleStepUpError }),
    mutationCache: new MutationCache({ onError: handleStepUpError }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Generic content-shaped skeleton for any route's loader (the root's i18n
    // preload, or a slow page loader) that takes a moment — delayed so a
    // fast, already-cached navigation never flashes it, held for a minimum
    // stretch once shown so it never flickers in and out. Every route,
    // including home, uses this same real skeleton.
    defaultPendingComponent: RouteSkeleton,
    defaultPendingMs: 150,
    defaultPendingMinMs: 400,
  });

  return router;
};
