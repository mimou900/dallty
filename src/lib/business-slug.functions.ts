import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateSlugFormat, isReservedSlug } from "@/lib/slug-service";

const RESERVED_ERROR = "That URL is reserved and can't be used.";

const updateSlugInput = z.object({
  businessId: z.string().uuid(),
  newSlug: z.string().trim().toLowerCase(),
  redirectType: z.enum(["owner_rename", "admin_correction"]),
});

/** Owner (or Super Admin correcting) changes a business's public URL slug. */
export const updateBusinessSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSlugInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    const supabaseAdmin = await adminClient();

    const isSuperAdminCaller = data.redirectType === "admin_correction";
    if (isSuperAdminCaller) {
      await assertSuperAdmin(context.supabase, context.userId);
    } else {
      await assertCanManageBusiness(context.supabase, context.userId, data.businessId);
    }

    const format = validateSlugFormat(data.newSlug);
    if (!format.valid) throw new Error(`That URL isn't valid (${format.error}).`);
    if (await isReservedSlug(supabaseAdmin, data.newSlug)) throw new Error(RESERVED_ERROR);

    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("id, slug")
      .eq("id", data.businessId)
      .single();
    if (businessError) throw new Error(businessError.message);

    if (business.slug.toLowerCase() === data.newSlug) {
      throw new Error("That's already your current URL.");
    }

    if (!isSuperAdminCaller) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabaseAdmin
        .from("business_slug_redirects")
        .select("id", { count: "exact", head: true })
        .eq("business_id", data.businessId)
        .gte("created_at", since);
      if ((count ?? 0) >= 3) {
        throw new Error("You've reached the limit of 3 URL changes in 30 days. Try again later.");
      }

      const { data: lastChange } = await supabaseAdmin
        .from("business_slug_redirects")
        .select("created_at")
        .eq("business_id", data.businessId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastChange) {
        const hoursSince =
          (Date.now() - new Date(lastChange.created_at).getTime()) / (60 * 60 * 1000);
        if (hoursSince < 24) {
          const hoursLeft = Math.ceil(24 - hoursSince);
          throw new Error(`You can change your URL again in ${hoursLeft} hour(s).`);
        }
      }
    }

    const [{ data: liveHit }, { data: retiredHit }] = await Promise.all([
      supabaseAdmin
        .from("businesses")
        .select("id")
        .neq("id", data.businessId)
        .ilike("slug", data.newSlug)
        .maybeSingle(),
      supabaseAdmin
        .from("business_slug_redirects")
        .select("id")
        .ilike("old_slug", data.newSlug)
        .maybeSingle(),
    ]);
    if (liveHit || retiredHit) throw new Error("That URL is already taken.");

    const { error: redirectError } = await supabaseAdmin.from("business_slug_redirects").insert({
      business_id: data.businessId,
      old_slug: business.slug,
      new_slug: data.newSlug,
      redirect_type: data.redirectType,
      created_by: context.userId,
    });
    if (redirectError) throw new Error(redirectError.message);

    const { error: updateError } = await supabaseAdmin
      .from("businesses")
      .update({ slug: data.newSlug, slug_source: "custom" })
      .eq("id", data.businessId);
    if (updateError) throw new Error(updateError.message);

    if (isSuperAdminCaller) {
      await logAdminAction(
        supabaseAdmin,
        context.userId,
        "business.slug_correction",
        "business",
        data.businessId,
        { old_slug: business.slug, new_slug: data.newSlug },
      );
    }

    return { ok: true, slug: data.newSlug };
  });
