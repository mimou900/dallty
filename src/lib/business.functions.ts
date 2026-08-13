import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { businessRegistrationSchema, type BusinessRegistration } from "@/lib/business-schema";
import { countryByCode } from "@/lib/countries";

/**
 * Finishes a business registration: attaches the pending salon record to the
 * signed-in owner. Ownership always comes from the verified session, never
 * from the request body. Refuses if the account already owns a business.
 */
export const registerBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: BusinessRegistration) => businessRegistrationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const ownerId = context.userId;

    // Platform admins manage every salon; they never own one themselves.
    const { data: isPlatformAdmin } = await context.supabase.rpc("is_platform_admin", {
      _user_id: ownerId,
    });
    if (isPlatformAdmin) {
      throw new Error("Platform admin accounts manage salons — they cannot own one.");
    }

    const { data: found, error: userError } = await supabaseAdmin.auth.admin.getUserById(ownerId);
    if (userError || !found?.user) throw new Error("Account not found — sign up again.");

    const { data: existing } = await supabaseAdmin
      .from("salons")
      .select("id")
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (existing) throw new Error("This account already has a business.");

    const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const b = data.business;

    const { data: salon, error } = await supabaseAdmin
      .from("salons")
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
        country_code: countryByCode(b.countryCode).code,
        currency: countryByCode(b.countryCode).currency,
        timezone: countryByCode(b.countryCode).timezone,
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
          salon_id: salon.id,
          name,
          category: "general",
          duration_minutes: 60,
          price: 0,
        })),
      );
    }

    if (b.galleryUrls.length) {
      await supabaseAdmin.from("salon_gallery").insert(
        b.galleryUrls.slice(0, 12).map((url, index) => ({
          salon_id: salon.id,
          url,
          category: "salon",
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
      salonId: salon.id,
    });

    return { salonId: salon.id, trialEndsAt: trialEnds };
  });
