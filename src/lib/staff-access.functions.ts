import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Owner view: login state of each team member + pending join requests. */
export const listStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ salonId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertManagesSalon } = await import("@/lib/staff-access.server");
    await assertManagesSalon(context.supabase, context.userId, data.salonId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: staff }, { data: requests }] = await Promise.all([
      supabaseAdmin
        .from("staff")
        .select("id, full_name, email, phone, user_id, invited_at, invite_accepted_at")
        .eq("salon_id", data.salonId),
      supabaseAdmin
        .from("staff_join_requests")
        .select("id, user_id, full_name, title, phone, message, status, created_at")
        .eq("salon_id", data.salonId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

    const emails = new Map<string, string>();
    for (const r of requests ?? []) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
      if (u?.user?.email) emails.set(r.user_id, u.user.email);
    }

    return {
      accounts: (staff ?? []).map((s) => ({
        staffId: s.id,
        email: s.email ?? null,
        phone: s.phone ?? null,
        hasLogin: Boolean(s.user_id),
        invitedAt: s.invited_at ?? null,
        acceptedAt: s.invite_accepted_at ?? null,
      })),
      requests: (requests ?? []).map((r) => ({
        id: r.id,
        userId: r.user_id,
        email: emails.get(r.user_id) ?? null,
        fullName: r.full_name,
        title: r.title,
        phone: r.phone ?? null,
        message: r.message ?? null,
        createdAt: r.created_at,
      })),
    };
  });

/** Creates the login for a team member and emails them a password-setup link. */
export const inviteStaffMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        staffId: z.string().uuid(),
        email: z.string().email(),
        origin: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertManagesSalon, ensureStaffAuthUser, passwordLink, safeOrigin } =
      await import("@/lib/staff-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

    const { data: member, error } = await supabaseAdmin
      .from("staff")
      .select("id, salon_id, full_name, user_id")
      .eq("id", data.staffId)
      .single();
    if (error) throw new Error(error.message);
    await assertManagesSalon(context.supabase, context.userId, member.salon_id);

    const { data: salon } = await supabaseAdmin
      .from("salons")
      .select("name")
      .eq("id", member.salon_id)
      .single();

    const email = data.email.trim().toLowerCase();
    const { userId } = await ensureStaffAuthUser(supabaseAdmin, email, member.full_name);

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role: "specialist" }, { onConflict: "user_id,role" });

    const { error: linkError } = await supabaseAdmin
      .from("staff")
      .update({ email, user_id: userId, invited_at: new Date().toISOString() })
      .eq("id", member.id);
    if (linkError) throw new Error(linkError.message);

    const url = await passwordLink(supabaseAdmin, email, safeOrigin(data.origin));
    const result = await sendTemplateEmail("staff-invite", email, {
      templateData: {
        staffName: member.full_name,
        salonName: salon?.name ?? "Your salon",
        actionUrl: url,
        mode: "invite",
      },
      idempotencyKey: `staff-invite-${member.id}-${Date.now()}`,
    });

    return { sent: result.sent, email };
  });

/** Sends an existing team member a fresh password recovery link. */
export const sendStaffPasswordLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ staffId: z.string().uuid(), origin: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertManagesSalon, passwordLink, safeOrigin } =
      await import("@/lib/staff-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

    const { data: member, error } = await supabaseAdmin
      .from("staff")
      .select("id, salon_id, full_name, email, user_id")
      .eq("id", data.staffId)
      .single();
    if (error) throw new Error(error.message);
    await assertManagesSalon(context.supabase, context.userId, member.salon_id);
    if (!member.email) throw new Error("Add a login email for this team member first");

    const { data: salon } = await supabaseAdmin
      .from("salons")
      .select("name")
      .eq("id", member.salon_id)
      .single();

    const url = await passwordLink(supabaseAdmin, member.email, safeOrigin(data.origin));
    const result = await sendTemplateEmail("staff-invite", member.email, {
      templateData: {
        staffName: member.full_name,
        salonName: salon?.name ?? "Your salon",
        actionUrl: url,
        mode: "reset",
      },
      idempotencyKey: `staff-recovery-${member.id}-${Date.now()}`,
    });
    return { sent: result.sent, email: member.email };
  });

/** Owner approves or rejects a specialist's request to join the team. */
export const reviewStaffRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid(), approve: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertManagesSalon } = await import("@/lib/staff-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: request, error } = await supabaseAdmin
      .from("staff_join_requests")
      .select("id, user_id, salon_id, full_name, title, status")
      .eq("id", data.requestId)
      .single();
    if (error) throw new Error(error.message);
    await assertManagesSalon(context.supabase, context.userId, request.salon_id);
    if (request.status !== "pending") throw new Error("That request was already reviewed");

    const { data: salon } = await supabaseAdmin
      .from("salons")
      .select("name")
      .eq("id", request.salon_id)
      .single();

    let staffId: string | null = null;

    if (data.approve) {
      const { data: existing } = await supabaseAdmin
        .from("staff")
        .select("id")
        .eq("salon_id", request.salon_id)
        .eq("user_id", request.user_id)
        .maybeSingle();

      if (existing) {
        staffId = existing.id;
      } else {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(request.user_id);
        const { data: created, error: createError } = await supabaseAdmin
          .from("staff")
          .insert({
            salon_id: request.salon_id,
            user_id: request.user_id,
            full_name: request.full_name,
            title: request.title,
            email: authUser?.user?.email ?? null,
            is_active: true,
            invite_accepted_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (createError) throw new Error(createError.message);
        staffId = created.id;
      }

      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: request.user_id, role: "specialist" }, { onConflict: "user_id,role" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("staff_join_requests")
      .update({
        status: data.approve ? "approved" : "rejected",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        staff_id: staffId,
      })
      .eq("id", request.id);
    if (updateError) throw new Error(updateError.message);

    await supabaseAdmin.from("notifications").insert({
      user_id: request.user_id,
      kind: data.approve ? "staff_request_approved" : "staff_request_rejected",
      title: data.approve ? "You joined the team" : "Join request declined",
      body: data.approve
        ? `${salon?.name ?? "The salon"} approved your request — open your specialist dashboard to set your working hours.`
        : `${salon?.name ?? "The salon"} declined your request to join their team.`,
    });

    return { ok: true, staffId };
  });
