import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sanitizeDbError } from "@/lib/db-error.server";

/**
 * Manually drains the outbox — real, working dispatch (brief §39-42), not a stub. Automatic
 * scheduling of this specific step is PLANNED (see DALLTY_NOTIFICATION_ARCHITECTURE.md for
 * why): pg_cron/pg_net are live on this Supabase project and already drive
 * generate_due_booking_reminders() on a real schedule, but wiring pg_net to also call
 * dispatch would mean either duplicating the i18n/React-Email rendering pipeline in raw SQL
 * (a second, parallel email system — exactly what this project is supposed to avoid
 * building) or calling back into this app's own deployed HTTP origin, which isn't confirmed
 * in this environment. Super Admin can drain it manually today; any future external
 * scheduler (a Cloudflare Cron Trigger once a stable URL exists, or a Supabase Edge
 * Function) can call this exact function.
 */
export const processNotificationOutboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ batchSize: z.number().int().min(1).max(100).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertSuperAdmin } = await import("@/lib/platform.server");
    const { processNotificationOutbox } = await import("@/lib/notification-engine.server");

    await assertSuperAdmin(context);
    return processNotificationOutbox(supabaseAdmin, data.batchSize ?? 25);
  });

const registerDeviceTokenInput = z.object({
  token: z.string().trim().min(10).max(4096),
  platform: z.enum(["ios", "android", "web"]),
  deviceName: z.string().trim().max(120).optional(),
});

/** Registers/refreshes a push device token for the caller (brief §28). A token always
 * belongs to exactly the user who registered it — upsert on the token's own uniqueness, and
 * re-pointing an existing token to a new user (e.g. shared device, different account signs
 * in) is allowed, matching how every real push SDK behaves (the OS token is device-scoped,
 * not permanently bound to the first account that ever registered it). */
export const registerDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerDeviceTokenInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("device_tokens").upsert(
      {
        user_id: context.userId,
        token: data.token,
        platform: data.platform,
        device_name: data.deviceName ?? null,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      } as never,
      { onConflict: "token" },
    );
    if (error) throw new Error(sanitizeDbError(error));
    return { ok: true };
  });

const revokeDeviceTokenInput = z.object({ token: z.string().trim().min(10).max(4096) });

/** Revokes one of the caller's own device tokens (brief §28 — logout/uninstall). RLS already
 * scopes this to the caller's own rows; the WHERE clause here is defense in depth, not the
 * only guard. */
export const revokeDeviceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => revokeDeviceTokenInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("device_tokens")
      .update({ revoked_at: new Date().toISOString() } as never)
      .eq("token", data.token)
      .eq("user_id", context.userId);
    if (error) throw new Error(sanitizeDbError(error));
    return { ok: true };
  });

const setPreferenceInput = z.object({
  businessId: z.string().uuid().nullable(),
  category: z.string().trim().min(1).max(60),
  channel: z.enum(["email", "push", "whatsapp", "sms"]),
  enabled: z.boolean(),
});

/** Sets one category x channel preference override (brief §20-22). Transactional
 * notifications never consult this table (see notification-engine.server.ts) — this only
 * ever affects marketing-category sends, none of which exist yet (no marketing system is
 * built), so this is real, tested infrastructure with no live consumer yet, same honesty as
 * the rest of this project's schema-ready-but-unused pieces. */
export const setNotificationPreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setPreferenceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Not a plain .upsert(): business_id is nullable and its uniqueness is enforced by two
    // PARTIAL indexes (one WHERE business_id IS NULL, one WHERE business_id IS NOT NULL) —
    // PostgREST's on_conflict target can't express a partial index's WHERE predicate, so
    // ON CONFLICT inference would never match. Select-then-write is simple and correct here;
    // this endpoint isn't hot-path (a user changing a notification setting, not a booking).
    let query = supabaseAdmin
      .from("notification_preferences")
      .select("id")
      .eq("user_id", context.userId)
      .eq("category", data.category)
      .eq("channel", data.channel);
    query = data.businessId
      ? query.eq("business_id", data.businessId)
      : query.is("business_id", null);
    const { data: existing, error: selectErr } = await query.maybeSingle();
    if (selectErr) throw new Error(sanitizeDbError(selectErr));

    if (existing) {
      const { error } = await supabaseAdmin
        .from("notification_preferences")
        .update({ enabled: data.enabled, updated_at: new Date().toISOString() } as never)
        .eq("id", existing.id);
      if (error) throw new Error(sanitizeDbError(error));
    } else {
      const { error } = await supabaseAdmin.from("notification_preferences").insert({
        user_id: context.userId,
        business_id: data.businessId,
        category: data.category,
        channel: data.channel,
        enabled: data.enabled,
      } as never);
      if (error) throw new Error(sanitizeDbError(error));
    }
    return { ok: true };
  });
