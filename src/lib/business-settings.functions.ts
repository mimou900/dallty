import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Private contact details of a business (business email / private business
 * phone). These columns are not readable by the Data API roles, so only the
 * verified owner or a platform admin can read them through this function.
 */
export const getBusinessPrivateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("is_platform_admin", {
      _user_id: context.userId,
    });
    if (roleError) throw new Error(roleError.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: business, error } = await supabaseAdmin
      .from("businesses")
      .select("id, owner_id, business_email, business_phone")
      .eq("id", data.businessId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!business) throw new Error("Business not found");
    if (!allowed && business.owner_id !== context.userId) {
      throw new Error("You do not manage this business");
    }

    return {
      businessEmail: business.business_email ?? "",
      businessPhone: business.business_phone ?? "",
    };
  });

const SETTINGS_COLUMNS = [
  "id",
  "name",
  "name_ar",
  "description",
  "description_ar",
  "business_type",
  "categories",
  "phone",
  "business_email",
  "business_phone",
  "website_url",
  "instagram_url",
  "facebook_url",
  "tiktok_url",
  "address",
  "country",
  "country_code",
  "city",
  "district",
  "area",
  "postal_code",
  "latitude",
  "longitude",
  "maps_url",
  "timezone",
  "currency",
  "opens_at",
  "closes_at",
  "logo_url",
  "cover_url",
  "image_url",
  "instant_booking",
  "booking_confirmation",
  "buffer_minutes",
  "cancellation_hours",
  "max_booking_days",
  "slot_interval_minutes",
  "min_notice_hours",
  "allow_waitlist",
  "cancellation_policy",
  "cancellation_policy_ar",
  "house_rules",
  "house_rules_ar",
  "owner_story",
  "notify_new_booking",
  "notify_cancellation",
  "notify_review",
  "notify_daily_summary",
  "notify_email_address",
  "accept_cash",
  "accept_card",
  "accept_online",
  "require_deposit",
  "deposit_percent",
  "tax_rate",
  "seo_title",
  "seo_description",
  "seo_keywords",
  "is_active",
  "marketplace_status",
  "is_verified",
  "plan",
  "trial_ends_at",
].join(", ");

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    name_ar: z.string().trim().max(120).nullable(),
    description: z.string().trim().max(4000).nullable(),
    description_ar: z.string().trim().max(4000).nullable(),
    business_type: z.string().trim().max(80).nullable(),
    categories: z.array(z.string().trim().max(60)).max(20),
    phone: z.string().trim().max(40).nullable(),
    business_email: z.string().trim().max(160).nullable(),
    business_phone: z.string().trim().max(40).nullable(),
    website_url: z.string().trim().max(300).nullable(),
    instagram_url: z.string().trim().max(300).nullable(),
    facebook_url: z.string().trim().max(300).nullable(),
    tiktok_url: z.string().trim().max(300).nullable(),
    address: z.string().trim().max(300).nullable(),
    country: z.string().trim().max(80).nullable(),
    country_code: z.string().trim().max(4),
    city: z.string().trim().max(120),
    district: z.string().trim().max(120).nullable(),
    area: z.string().trim().max(120),
    postal_code: z.string().trim().max(20).nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    maps_url: z.string().trim().max(500).nullable(),
    timezone: z.string().trim().max(60),
    currency: z.string().trim().max(8),
    opens_at: z.string().max(8),
    closes_at: z.string().max(8),
    logo_url: z.string().max(2000).nullable(),
    cover_url: z.string().max(2000).nullable(),
    image_url: z.string().max(2000).nullable(),
    instant_booking: z.boolean(),
    booking_confirmation: z.string().max(30),
    buffer_minutes: z.number().int().min(0).max(240),
    cancellation_hours: z.number().int().min(0).max(720),
    max_booking_days: z.number().int().min(1).max(365),
    slot_interval_minutes: z.number().int().min(5).max(120),
    min_notice_hours: z.number().int().min(0).max(240),
    allow_waitlist: z.boolean(),
    cancellation_policy: z.string().max(4000).nullable(),
    cancellation_policy_ar: z.string().max(4000).nullable(),
    house_rules: z.string().max(4000).nullable(),
    house_rules_ar: z.string().max(4000).nullable(),
    owner_story: z.string().max(4000).nullable(),
    notify_new_booking: z.boolean(),
    notify_cancellation: z.boolean(),
    notify_review: z.boolean(),
    notify_daily_summary: z.boolean(),
    notify_email_address: z.string().trim().max(160).nullable(),
    accept_cash: z.boolean(),
    accept_card: z.boolean(),
    accept_online: z.boolean(),
    require_deposit: z.boolean(),
    deposit_percent: z.number().min(0).max(100),
    tax_rate: z.number().min(0).max(100),
    seo_title: z.string().trim().max(120).nullable(),
    seo_description: z.string().trim().max(320).nullable(),
    seo_keywords: z.string().trim().max(300).nullable(),
    is_active: z.boolean(),
  })
  .partial();

export type BusinessSettingsPatch = z.infer<typeof patchSchema>;

const hoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      is_closed: z.boolean(),
      opens_at: z.string().max(8),
      closes_at: z.string().max(8),
    }),
  )
  .max(7);

async function assertManages(context: { supabase: any; userId: string }, businessId: string) {
  const { data: allowed, error } = await context.supabase.rpc("is_platform_admin", {
    _user_id: context.userId,
  });
  if (error) throw new Error(error.message);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: business, error: businessError } = await supabaseAdmin
    .from("businesses")
    .select("id, owner_id")
    .eq("id", businessId)
    .maybeSingle();
  if (businessError) throw new Error(businessError.message);
  if (!business) throw new Error("Business not found");
  if (!allowed && business.owner_id !== context.userId) {
    throw new Error("You do not manage this business");
  }
  return supabaseAdmin;
}

/** Every settings field for the business the caller manages. */
export const getBusinessSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ businessId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await assertManages(context as any, data.businessId);
    const [{ data: business, error }, { data: hours, error: hoursError }] = await Promise.all([
      admin.from("businesses").select(SETTINGS_COLUMNS).eq("id", data.businessId).maybeSingle(),
      admin
        .from("business_hours")
        .select("weekday, is_closed, opens_at, closes_at")
        .eq("business_id", data.businessId)
        .order("weekday"),
    ]);
    if (error) throw new Error(error.message);
    if (hoursError) throw new Error(hoursError.message);
    return { business: business as Record<string, any> | null, hours: hours ?? [] };
  });

/** Saves an allow-listed patch of settings, plus the weekly opening hours. */
export const saveBusinessSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        businessId: z.string().uuid(),
        patch: patchSchema,
        hours: hoursSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertManages(context as any, data.businessId);

    if (Object.keys(data.patch).length > 0) {
      const { error } = await admin
        .from("businesses")
        .update({ ...data.patch, updated_at: new Date().toISOString() })
        .eq("id", data.businessId);
      if (error) throw new Error(error.message);
    }

    if (data.hours && data.hours.length > 0) {
      const rows = data.hours.map((h) => ({ ...h, business_id: data.businessId }));
      const { error } = await admin
        .from("business_hours")
        .upsert(rows, { onConflict: "business_id,weekday" });
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });
