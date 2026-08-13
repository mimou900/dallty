import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const MARKETPLACE_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "rejected",
  "hidden",
] as const;

export type MarketplaceStatus = (typeof MARKETPLACE_STATUSES)[number];

/** Readiness requirements a salon must meet before it can be submitted. */
export const READINESS_CHECKS = [
  { key: "profile_complete", label: "Salon profile completed", labelAr: "اكتمال ملف الصالون" },
  { key: "logo_uploaded", label: "Logo uploaded", labelAr: "تم رفع الشعار" },
  { key: "location_set", label: "Exact Google Maps location", labelAr: "الموقع الدقيق على الخريطة" },
  { key: "hours_set", label: "Business hours configured", labelAr: "تم ضبط ساعات العمل" },
  { key: "has_service", label: "At least one published service", labelAr: "خدمة منشورة واحدة على الأقل" },
  { key: "has_specialist", label: "At least one specialist", labelAr: "أخصائي واحد على الأقل" },
  { key: "service_assigned", label: "Specialist assigned to a service", labelAr: "ربط الأخصائي بخدمة" },
  { key: "working_hours_set", label: "Specialist working hours", labelAr: "ساعات عمل الأخصائي" },
  {
    key: "future_availability",
    label: "At least one future available appointment",
    labelAr: "موعد متاح واحد على الأقل",
  },
] as const;

export type ReadinessKey = (typeof READINESS_CHECKS)[number]["key"];
export type Readiness = Record<ReadinessKey, boolean>;

/** Marketplace review queue with per-salon readiness. Super Admin only. */
export const listMarketplaceQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertSuperAdmin, adminClient } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { data, error } = await supabaseAdmin
      .from("salons")
      .select(
        "id, name, city, country, logo_url, marketplace_status, marketplace_note, submitted_at, is_verified, verified_at, is_listed, status, owner_id, created_at",
      )
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const readiness = await Promise.all(
      rows.map(async (s) => {
        const { data: r } = await context.supabase.rpc("get_marketplace_readiness", {
          _salon_id: s.id,
        });
        return (r?.[0] ?? null) as Readiness | null;
      }),
    );

    return rows.map((s, i) => ({ ...s, readiness: readiness[i] }));
  });

/** Approve, reject, hide or reopen a marketplace listing. Super Admin only. */
export const setMarketplaceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { salonId: string; status: MarketplaceStatus; note?: string }) =>
    z
      .object({
        salonId: z.string().uuid(),
        status: z.enum(MARKETPLACE_STATUSES),
        note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { error } = await supabaseAdmin
      .from("salons")
      .update({
        marketplace_status: data.status,
        marketplace_note: data.note ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .eq("id", data.salonId);
    if (error) throw new Error(error.message);

    await logAdminAction(
      supabaseAdmin,
      context.userId,
      `marketplace.${data.status}`,
      "salon",
      data.salonId,
      { note: data.note ?? "" },
    );
    return { ok: true };
  });

/**
 * Grants or removes the "Verified by Dallty" badge. Super Admin only and
 * deliberately independent from marketplace approval.
 */
export const setSalonVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { salonId: string; verified: boolean }) =>
    z.object({ salonId: z.string().uuid(), verified: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertSuperAdmin, adminClient, logAdminAction } = await import("@/lib/platform.server");
    await assertSuperAdmin(context.supabase, context.userId);
    const supabaseAdmin = await adminClient();

    const { error } = await supabaseAdmin
      .from("salons")
      .update({
        is_verified: data.verified,
        verified_at: data.verified ? new Date().toISOString() : null,
        verified_by: data.verified ? context.userId : null,
      })
      .eq("id", data.salonId);
    if (error) throw new Error(error.message);

    await logAdminAction(
      supabaseAdmin,
      context.userId,
      data.verified ? "salon.verify" : "salon.unverify",
      "salon",
      data.salonId,
    );
    return { ok: true };
  });
