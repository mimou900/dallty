import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { businessRegistrationSchema, type BusinessRegistration } from "@/lib/business-schema";

/**
 * Finishes a business registration: attaches the pending business record to
 * the signed-in owner. Ownership always comes from the verified session,
 * never from the request body. Refuses if the account already owns a business.
 */
export const registerBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: BusinessRegistration) => businessRegistrationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ownerId = context.userId;

    // Platform admins manage every business; they never own one themselves.
    const { data: isPlatformAdmin } = await context.supabase.rpc("is_platform_admin", {
      _user_id: ownerId,
    });
    if (isPlatformAdmin) {
      throw new Error("Platform admin accounts manage businesses — they cannot own one.");
    }

    const { data: found, error: userError } = await supabaseAdmin.auth.admin.getUserById(ownerId);
    if (userError || !found?.user) throw new Error("Account not found — sign up again.");

    const { data: existing } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (existing) throw new Error("This account already has a business.");

    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const b = data.business;

    const { data: countryRow } = await supabaseAdmin
      .from("countries")
      .select("iso_code, currency_code, timezone")
      .eq("iso_code", b.countryCode)
      .maybeSingle();
    const { data: fallbackCountry } = countryRow
      ? { data: countryRow }
      : await supabaseAdmin
          .from("countries")
          .select("iso_code, currency_code, timezone")
          .eq("iso_code", "DZ")
          .single();
    const resolvedCountry = countryRow ?? fallbackCountry!;

    const { data: business, error } = await supabaseAdmin
      .from("businesses")
      .insert({
        owner_id: ownerId,
        name: b.name,
        description: b.description || null,
        business_type: b.businessType || b.categories[0],
        categories: b.categories,

        business_email: b.businessEmail,
        business_phone: b.businessPhone,
        website_url: b.website || null,
        instagram_url: b.instagram || null,
        facebook_url: b.facebook || null,
        tiktok_url: b.tiktok || null,
        country: b.country,
        country_code: resolvedCountry.iso_code,
        currency: resolvedCountry.currency_code,
        timezone: resolvedCountry.timezone,
        city: b.city,
        area: b.district || b.city,
        district: b.district || null,
        address: b.address,
        postal_code: b.postalCode || null,
        maps_url: b.mapsUrl || null,
        latitude: b.latitude ?? null,
        longitude: b.longitude ?? null,
        opens_at: b.opensAt,
        closes_at: b.closesAt,
        employee_count: b.employeeCount,
        branch_count: b.branchCount,
        logo_url: b.logoUrl || null,
        cover_url: b.coverUrl || null,
        image_url: b.coverUrl || null,
        plan: b.plan,
        trial_ends_at: trialEnds,
        terms_accepted_at: new Date().toISOString(),
        status: "pending",
        is_active: true,
        phone: b.businessPhone,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (b.services.length) {
      await supabaseAdmin.from("services").insert(
        b.services.slice(0, 20).map((name) => ({
          business_id: business.id,
          name,
          category: "general",
          duration_minutes: 60,
          price: 0,
        })),
      );
    }

    if (b.galleryUrls.length) {
      await supabaseAdmin.from("business_gallery").insert(
        b.galleryUrls.slice(0, 12).map((url, index) => ({
          business_id: business.id,
          url,
          category: "interior",
          sort_order: index,
        })),
      );
    }

    const { notifyBusinessStatus } = await import("@/lib/business-status-email.server");
    await notifyBusinessStatus({
      to: b.businessEmail || found.user.email,
      businessName: b.name,
      ownerName: found.user.user_metadata?.full_name as string | undefined,
      status: "pending",
      businessId: business.id,
    });

    return { businessId: business.id, trialEndsAt: trialEnds };
  });
