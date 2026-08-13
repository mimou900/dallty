import { supabase } from "@/integrations/supabase/client";

export type Landing =
  | "/bookings"
  | "/admin"
  | "/admin/my-appointments"
  | "/admin/platform/overview"
  | "/business/signup";

/** Does this user already own at least one salon? */
export async function hasOwnedSalon(userId: string): Promise<boolean> {
  const { data } = await supabase.from("salons").select("id").eq("owner_id", userId).limit(1);
  return Boolean(data?.length);
}

/**
 * Where a user should land after signing in.
 * Clients keep /bookings; business accounts go straight to their dashboard.
 * Salon owners who haven't created a salon yet resume the creation wizard
 * instead of hitting the (otherwise empty) owner dashboard.
 */
export async function resolveLanding(userId: string): Promise<Landing> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  if (roles.includes("super_admin") || roles.includes("admin")) return "/admin/platform/overview";
  if (roles.includes("salon_owner")) return (await hasOwnedSalon(userId)) ? "/admin" : "/business/signup";
  if (roles.includes("specialist")) return "/admin/my-appointments";
  return "/bookings";
}

/** Resolves landing for the currently signed-in user (falls back to /bookings). */
export async function resolveLandingForSession(): Promise<Landing> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return "/bookings";
  return resolveLanding(data.user.id);
}

/** Landing derived from already-loaded roles (client-side, no request). */
export function landingForRoles(roles: string[]): Landing {
  if (roles.includes("super_admin") || roles.includes("admin")) return "/admin/platform/overview";
  if (roles.includes("salon_owner")) return "/admin";
  if (roles.includes("specialist")) return "/admin/my-appointments";
  return "/bookings";
}
