import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const businessInput = z.object({ businessId: z.string().uuid() });

/**
 * Customer book for a single business: every client who ever booked there,
 * with spend, visit counts and contact details. Owners/managers only.
 */
export const listBusinessCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { businessId: string }) => businessInput.parse(input))
  .handler(async ({ data, context }) => {
    const { assertCanManageBusiness } = await import("@/lib/business-crm.server");
    await assertCanManageBusiness(context.supabase, context.userId, data.businessId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("id, customer_id, service_id, staff_id, starts_at, status, total_price")
      .eq("business_id", data.businessId)
      .order("starts_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const customerIds = [...new Set((bookings ?? []).map((b) => b.customer_id))];
    if (!customerIds.length) return [];

    const [{ data: profiles }, { data: services }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, phone, gender, birthday, skin_type, hair_type, allergies, beauty_notes")
        .in("id", customerIds),
      supabaseAdmin.from("services").select("id, name").eq("business_id", data.businessId),
    ]);

    const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
    const now = Date.now();

    return customerIds.map((id) => {
      const mine = (bookings ?? []).filter((b) => b.customer_id === id);
      const completed = mine.filter((b) => b.status === "completed");
      const upcoming = mine
        .filter((b) => new Date(b.starts_at).getTime() > now && b.status !== "cancelled")
        .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0];
      const past = mine.filter((b) => new Date(b.starts_at).getTime() <= now)[0];
      const counts = new Map<string, number>();
      mine.forEach((b) => counts.set(b.service_id, (counts.get(b.service_id) ?? 0) + 1));
      const favourite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const profile = profiles?.find((p) => p.id === id);

      return {
        id,
        fullName: profile?.full_name || "Guest",
        phone: profile?.phone ?? "",
        gender: profile?.gender ?? null,
        birthday: profile?.birthday ?? null,
        skinType: profile?.skin_type ?? null,
        hairType: profile?.hair_type ?? null,
        allergies: profile?.allergies ?? null,
        notes: profile?.beauty_notes ?? null,
        bookings: mine.length,
        cancelled: mine.filter((b) => b.status === "cancelled").length,
        totalSpent: completed.reduce((sum, b) => sum + Number(b.total_price ?? 0), 0),
        lastVisit: past?.starts_at ?? null,
        nextVisit: upcoming?.starts_at ?? null,
        favouriteService: favourite ? (serviceName.get(favourite) ?? null) : null,
      };
    });
  });
