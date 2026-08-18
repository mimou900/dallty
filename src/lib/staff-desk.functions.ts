import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Every appointment belonging to the signed-in specialist, with names resolved. */
export const listMyAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireStaffRecord } = await import("@/lib/staff-desk.server");
    const { staffId, businessId } = await requireStaffRecord(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select(
        "id, customer_id, business_id, service_id, staff_id, starts_at, ends_at, status, total_price, notes, created_at",
      )
      .eq("staff_id", staffId)
      .order("starts_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);

    const customerIds = [
      ...new Set(
        (bookings ?? []).map((b) => b.customer_id).filter((id): id is string => id !== null),
      ),
    ];

    const [{ data: services }, profilesResult, { data: myServices }] = await Promise.all([
      supabaseAdmin
        .from("services")
        .select("id, name, duration_minutes, price, discount_price, is_active")
        .eq("business_id", businessId),
      customerIds.length
        ? supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", customerIds)
        : Promise.resolve({
            data: [] as { id: string; full_name: string; phone: string | null }[],
          }),
      supabaseAdmin.from("staff_services").select("service_id").eq("staff_id", staffId),
    ]);

    const profiles = profilesResult.data ?? [];
    const mine = new Set((myServices ?? []).map((r) => r.service_id));
    const serviceById = new Map((services ?? []).map((s) => [s.id, s]));
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    return {
      staffId,
      businessId,
      appointments: (bookings ?? []).map((b) => {
        const s = serviceById.get(b.service_id);
        const p = b.customer_id ? profileById.get(b.customer_id) : undefined;
        return {
          id: b.id,
          customerId: b.customer_id,
          customerName: p?.full_name || "Guest",
          customerPhone: p?.phone ?? null,
          serviceId: b.service_id,
          serviceName: s?.name ?? "Service",
          duration: s?.duration_minutes ?? 0,
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          status: b.status as "pending" | "confirmed" | "completed" | "cancelled",
          totalPrice: Number(b.total_price ?? 0),
          notes: b.notes ?? null,
        };
      }),
      services: (services ?? [])
        .filter((s) => s.is_active && mine.has(s.id))
        .map((s) => ({
          id: s.id,
          name: s.name,
          duration: s.duration_minutes,
          price: Number(s.discount_price ?? s.price),
        })),
      customers: customerIds.map((id) => ({
        id,
        name: profileById.get(id)?.full_name || "Guest",
        phone: profileById.get(id)?.phone ?? null,
      })),
    };
  });

/** Books an appointment for the signed-in specialist, checking conflicts first. */
export const createMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        serviceId: z.string().uuid(),
        customerId: z.string().uuid(),
        startsAt: z.string().min(1),
        notes: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireStaffRecord } = await import("@/lib/staff-desk.server");
    const { staffId, businessId } = await requireStaffRecord(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: service, error: serviceError } = await supabaseAdmin
      .from("services")
      .select("id, duration_minutes, price, discount_price, business_id")
      .eq("id", data.serviceId)
      .single();
    if (serviceError) throw new Error(serviceError.message);
    if (service.business_id !== businessId)
      throw new Error("That service belongs to another business");

    const starts = new Date(data.startsAt);
    if (Number.isNaN(starts.getTime())) throw new Error("Invalid start time");
    const ends = new Date(starts.getTime() + service.duration_minutes * 60_000);

    const { data: clashes, error: clashError } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("staff_id", staffId)
      .in("status", ["pending", "confirmed"])
      .lt("starts_at", ends.toISOString())
      .gt("ends_at", starts.toISOString());
    if (clashError) throw new Error(clashError.message);
    if ((clashes ?? []).length) throw new Error("You already have an appointment in that window");

    const { resolveStaffPrimaryBranchId } = await import("@/lib/branch.server");
    const branchId = await resolveStaffPrimaryBranchId(supabaseAdmin, staffId, businessId);

    const { data: created, error } = await supabaseAdmin
      .from("bookings")
      .insert({
        customer_id: data.customerId,
        business_id: businessId,
        branch_id: branchId,
        service_id: service.id,
        staff_id: staffId,
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        status: "confirmed",
        total_price: Number(service.discount_price ?? service.price),
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id as string };
  });

/** Reschedules one of the specialist's own appointments. */
export const rescheduleMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bookingId: z.string().uuid(), startsAt: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireStaffRecord } = await import("@/lib/staff-desk.server");
    const { staffId } = await requireStaffRecord(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("id, staff_id, starts_at, ends_at")
      .eq("id", data.bookingId)
      .single();
    if (bookingError) throw new Error(bookingError.message);
    if (booking.staff_id !== staffId) throw new Error("That appointment is not yours");

    const length = +new Date(booking.ends_at) - +new Date(booking.starts_at);
    const starts = new Date(data.startsAt);
    if (Number.isNaN(starts.getTime())) throw new Error("Invalid start time");
    const ends = new Date(starts.getTime() + length);

    const { data: clashes } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("staff_id", staffId)
      .neq("id", booking.id)
      .in("status", ["pending", "confirmed"])
      .lt("starts_at", ends.toISOString())
      .gt("ends_at", starts.toISOString());
    if ((clashes ?? []).length) throw new Error("That window clashes with another appointment");

    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ starts_at: starts.toISOString(), ends_at: ends.toISOString() })
      .eq("id", booking.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
