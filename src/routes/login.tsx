import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({ next: z.string().optional() });

// /login has been merged into /auth (one canonical sign-in/sign-up route).
// Kept as a redirect so old bookmarks/links keep working.
export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth", search });
  },
});
