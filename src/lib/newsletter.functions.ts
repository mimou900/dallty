import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { sanitizeDbError } from "@/lib/db-error.server";

/** Footer "Stay in the loop" signup. Public, unauthenticated — rate-limited by IP. */
export const subscribeToNewsletter = createServerFn({ method: "POST" })
  .inputValidator((input: { email: string; lang?: string }) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(255),
        lang: z.string().max(8).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertRateLimit, clientIpFromHeaders } = await import("@/lib/rate-limit.server");
    const { getRequest } = await import("@tanstack/react-start/server");

    const ip = clientIpFromHeaders(getRequest()?.headers ?? new Headers());
    await assertRateLimit(supabaseAdmin, `newsletter_subscribe:${ip}`, 10, 10);

    const { error } = await supabaseAdmin
      .from("newsletter_subscribers")
      .upsert(
        { email: data.email, lang: data.lang ?? null, unsubscribed_at: null },
        { onConflict: "email" },
      );
    if (error) throw new Error(sanitizeDbError(error));

    return { ok: true as const };
  });
