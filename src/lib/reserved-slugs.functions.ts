import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const reservedSlugInput = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
  reason: z.string().trim().max(200).nullable().optional(),
  active: z.boolean().default(true),
});

/** Lists every reserved slug, active or not. Super Admin only. */
export const listReservedSlugsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin.from("reserved_slugs").select("*").order("slug");
    if (error) throw new Error(error.message);
    return data;
  });

/** Creates or updates a reserved slug. Super Admin only. */
export const upsertReservedSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reservedSlugInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin.from("reserved_slugs").upsert(data as never);
    if (error) throw new Error(error.message);
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "reserved_slug.upsert",
      "reserved_slug",
      data.id ?? null,
      data,
    );
    return { ok: true };
  });
