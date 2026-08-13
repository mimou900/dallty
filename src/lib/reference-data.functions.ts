import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const categoryInput = z.object({
  id: z.string().uuid().optional(),
  default_name: z.string().trim().min(1).max(80),
  translations: z.record(z.string().min(2).max(10), z.string().trim().min(1).max(80)).default({}),
  icon: z.string().trim().min(1).max(60),
  image_url: z.string().trim().max(4000).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  display_order: z.number().int().default(0),
  active: z.boolean().default(true),
});

/** Lists every category, active or not. Super Admin only. */
export const listCategoriesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin
      .from("categories")
      .select("*")
      .order("display_order");
    if (error) throw new Error(error.message);
    return data;
  });

/** Creates or updates a category. Super Admin only. */
export const upsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin.from("categories").upsert(data as never);
    if (error) throw new Error(error.message);
    await logAdminAction(
      supabaseAdmin,
      context.userId,
      "category.upsert",
      "category",
      data.id ?? null,
      data,
    );
    return { ok: true };
  });

const countryInput = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
  display_order: z.number().int(),
});

/** Lists every country, active or not. Super Admin only. */
export const listCountriesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin
      .from("countries")
      .select("*")
      .order("display_order")
      .order("default_name");
    if (error) throw new Error(error.message);
    return data;
  });

/** Updates a country's active state and display order. Super Admin only. */
export const upsertCountry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => countryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();
    const { error } = await supabaseAdmin
      .from("countries")
      .update({ active: data.active, display_order: data.display_order } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAdminAction(supabaseAdmin, context.userId, "country.update", "country", data.id, data);
    return { ok: true };
  });

/** Lists every currency. Super Admin only. */
export const listCurrenciesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();
    const { data, error } = await supabaseAdmin.from("currencies").select("*").order("code");
    if (error) throw new Error(error.message);
    return data;
  });
