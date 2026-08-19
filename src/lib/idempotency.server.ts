import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { sanitizeDbError } from "@/lib/db-error.server";

type AnySupabase = SupabaseClient<Database>;

export class DuplicateRequestError extends Error {
  constructor() {
    super("This request is already being processed or was already completed");
    this.name = "DuplicateRequestError";
  }
}

/**
 * Runs `fn` at most once for a given (actor, operation, key) triple. A second call with the
 * same triple while the first is still running throws `DuplicateRequestError`; a second call
 * after the first completed returns the ORIGINAL cached response without re-running `fn` —
 * this is what makes a client-side retry (flaky connection, double-tap) safe instead of
 * double-executing a booking/payment/refund.
 *
 * Real consumers: `confirmBookingHold` (booking-engine.functions.ts), `markCashPayment` and
 * `createRefund` (financial.functions.ts). Coupon/affiliate systems still don't exist, so
 * there's nothing to wrap for those yet.
 */
export async function withIdempotency<T>(
  supabaseAdmin: AnySupabase,
  params: { actorId: string | null; operation: string; key: string },
  fn: () => Promise<T>,
): Promise<T> {
  const { actorId, operation, key } = params;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("idempotency_keys")
    .insert({ actor_id: actorId, operation, idempotency_key: key, status: "in_progress" } as never)
    .select("id")
    .single();

  if (insertError) {
    // Unique violation -> a row for this triple already exists. Postgres error code 23505.
    if ((insertError as { code?: string }).code === "23505") {
      // `.eq("actor_id", null)` compiles to `actor_id = null`, which PostgREST (like SQL
      // itself) never matches -- it must be `actor_id IS NULL` via `.is()`. Without this,
      // every guest (actorId always null) call landed here NEVER found its own "completed"
      // row and got DuplicateRequestError forever, even long after the original succeeded --
      // found live-testing Project 10's guest confirm path against the real deployment.
      let query = supabaseAdmin
        .from("idempotency_keys")
        .select("status, response")
        .eq("operation", operation)
        .eq("idempotency_key", key);
      query = actorId === null ? query.is("actor_id", null) : query.eq("actor_id", actorId);
      const { data: existing } = await query.maybeSingle();

      if (existing?.status === "completed") {
        return existing.response as T;
      }
      throw new DuplicateRequestError();
    }
    throw new Error(sanitizeDbError(insertError));
  }

  try {
    const result = await fn();
    await supabaseAdmin
      .from("idempotency_keys")
      .update({
        status: "completed",
        response: result as never,
        completed_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);
    return result;
  } catch (e) {
    // Delete rather than mark "failed" and leave it — a failed attempt should be
    // retryable with the same key, not permanently stuck. Callers that need to inspect
    // failure history should look at admin_audit_log instead.
    await supabaseAdmin.from("idempotency_keys").delete().eq("id", inserted.id);
    throw e;
  }
}
