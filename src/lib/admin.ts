import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatMoney } from "@/lib/countries";

export const CURRENCY = "AED";

/** Money in a given currency; defaults to AED when the business has none set. */
export function money(value: number | string | null | undefined, currency = CURRENCY) {
  return formatMoney(value, currency || CURRENCY);
}

/** Currency of the business currently being managed. */
export function useActiveCurrency() {
  const { business } = useActiveBusiness();
  return (business as { currency?: string } | null)?.currency ?? CURRENCY;
}

/** Time zone of the business currently being managed. */
export function useActiveTimezone() {
  const { business } = useActiveBusiness();
  return (business as { timezone?: string } | null)?.timezone ?? undefined;
}

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

export const STATUS_STYLES: Record<BookingStatus, string> = {
  pending: "bg-gold/20 text-gold-foreground",
  confirmed: "bg-primary/15 text-primary",
  completed: "bg-sky/20 text-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

export const STATUS_DOT: Record<BookingStatus, string> = {
  pending: "bg-gold",
  confirmed: "bg-primary",
  completed: "bg-sky",
  cancelled: "bg-destructive",
};

export const SERVICE_CATEGORIES = [
  "hair",
  "barber",
  "nails",
  "spa",
  "facial",
  "makeup",
  "waxing",
  "laser",
  "massage",
  "general",
] as const;

/**
 * Businesses the signed-in account can manage.
 * Owners see only their own businesses, specialists see the business they work at,
 * platform admins see everything.
 */
export function useManagedBusinesses() {
  const { user, hasRole, loading } = useAuth();
  const allowed =
    hasRole("business_owner") || hasRole("specialist") || hasRole("admin") || hasRole("super_admin");
  const isPlatform = hasRole("admin") || hasRole("super_admin");

  return useQuery({
    queryKey: ["admin-businesses", user?.id, isPlatform],
    enabled: Boolean(user) && allowed && !loading,
    queryFn: async () => {
      const columns =
        "id, name, area, city, image_url, opens_at, closes_at, phone, address, status, is_active, is_listed, plan, trial_ends_at, owner_id, country_code, currency, timezone";

      if (isPlatform) {
        const { data, error } = await supabase.from("businesses").select(columns).order("name");
        if (error) throw error;
        return data;
      }

      const { data: owned, error } = await supabase
        .from("businesses")
        .select(columns)
        .eq("owner_id", user!.id)
        .order("name");
      if (error) throw error;
      if (owned && owned.length) return owned;

      // Staff member: fall back to the businesses they are employed at.
      const { data: staffRows } = await supabase
        .from("staff")
        .select("business_id")
        .eq("user_id", user!.id);
      const ids = [...new Set((staffRows ?? []).map((r) => r.business_id))];
      if (!ids.length) return [];
      const { data: employed, error: employedError } = await supabase
        .from("businesses")
        .select(columns)
        .in("id", ids)
        .order("name");
      if (employedError) throw employedError;
      return employed;
    },
  });
}

/** The business currently being managed (first one for single-location owners). */
export function useActiveBusiness() {
  const businesses = useManagedBusinesses();
  const business = businesses.data?.[0] ?? null;
  return {
    business,
    businessId: business?.id ?? null,
    isLoading: businesses.isLoading,
    businesses: businesses.data ?? [],
  };
}

/**
 * The staff row belonging to the signed-in account, when they are a specialist
 * rather than an owner/admin. Used to scope the back-office to their own work.
 */
export function useMyStaffRecord() {
  const { user, hasRole, loading } = useAuth();
  const isStaffOnly =
    hasRole("specialist") &&
    !hasRole("business_owner") &&
    !hasRole("admin") &&
    !hasRole("super_admin");

  const query = useQuery({
    queryKey: ["my-staff-record", user?.id],
    enabled: Boolean(user) && hasRole("specialist") && !loading,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, business_id, full_name, title, avatar_url, is_active")
        .eq("user_id", user!.id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return {
    isStaffOnly,
    staff: query.data ?? null,
    staffId: query.data?.id ?? null,
    businessId: query.data?.business_id ?? null,
    isLoading: loading || query.isLoading,
  };
}

/** Working-hours coverage per staff member — used by the readiness checklist. */
export function useStaffSchedules(staffIds: string[]) {
  return useQuery({
    queryKey: ["admin-staff-schedules", staffIds],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_schedules")
        .select("id, staff_id, weekday, starts_at, ends_at")
        .in("staff_id", staffIds);
      if (error) throw error;
      return data;
    },
  });
}

/** Date-specific overrides + days off, used for "working today" / "next available". */
export function useStaffDayRules(staffIds: string[]) {
  const today = new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["admin-staff-day-rules", staffIds, today],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const [off, hours] = await Promise.all([
        supabase
          .from("staff_time_off")
          .select("staff_id, day")
          .in("staff_id", staffIds)
          .gte("day", today),
        supabase
          .from("staff_day_hours")
          .select("staff_id, day, starts_at, ends_at")
          .in("staff_id", staffIds)
          .gte("day", today),
      ]);
      if (off.error) throw off.error;
      if (hours.error) throw hours.error;
      return { timeOff: off.data ?? [], dayHours: hours.data ?? [] };
    },
  });
}

/** Average rating + review count per specialist. */
export function useStaffRatings(businessIds: string[]) {
  return useQuery({
    queryKey: ["admin-staff-ratings", businessIds],
    enabled: businessIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("staff_id, rating")
        .in("business_id", businessIds)
        .eq("is_hidden", false)
        .not("staff_id", "is", null);
      if (error) throw error;
      const map = new Map<string, { total: number; count: number }>();
      for (const r of data ?? []) {
        if (!r.staff_id) continue;
        const prev = map.get(r.staff_id) ?? { total: 0, count: 0 };
        map.set(r.staff_id, { total: prev.total + (r.rating ?? 0), count: prev.count + 1 });
      }
      return Object.fromEntries(
        [...map].map(([id, v]) => [id, { average: v.total / v.count, count: v.count }]),
      ) as Record<string, { average: number; count: number }>;
    },
  });
}

export function useManagedStaff(businessIds: string[]) {
  const { isStaffOnly, staffId } = useMyStaffRecord();
  const onlyMine = isStaffOnly ? staffId : null;

  return useQuery({
    queryKey: ["admin-staff", businessIds, onlyMine],
    enabled: businessIds.length > 0 && (!isStaffOnly || Boolean(onlyMine)),
    queryFn: async () => {
      let query = supabase
        .from("staff")
        .select(
          "id, business_id, full_name, title, avatar_url, is_active, bio, experience_years, languages, certificates, portfolio, social_links, user_id, invited_at, invite_accepted_at",
        )
        .in("business_id", businessIds);
      if (onlyMine) query = query.eq("id", onlyMine);
      const { data, error } = await query.order("full_name");
      if (error) throw error;
      return data;
    },
  });
}

export function useManagedServices(businessIds: string[]) {
  return useQuery({
    queryKey: ["admin-services", businessIds],
    enabled: businessIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id, business_id, name, category, description, duration_minutes, price, discount_price, is_active, image_url, deposit, processing_minutes, cleanup_minutes, tag",
        )

        .in("business_id", businessIds)
        .order("category");
      if (error) throw error;
      return data;
    },
  });
}

export function useManagedBookings(businessIds: string[], fromISO: string, toISO: string) {
  const { isStaffOnly, staffId } = useMyStaffRecord();
  const onlyMine = isStaffOnly ? staffId : null;

  return useQuery({
    queryKey: ["admin-bookings", businessIds, fromISO, toISO, onlyMine],
    enabled: businessIds.length > 0 && (!isStaffOnly || Boolean(onlyMine)),
    queryFn: async () => {
      let query = supabase
        .from("bookings")
        .select(
          "id, business_id, customer_id, service_id, staff_id, starts_at, ends_at, status, total_price, payment_status, paid_at, notes, created_at",
        )
        .in("business_id", businessIds)
        .gte("starts_at", fromISO)
        .lte("starts_at", toISO);
      if (onlyMine) query = query.eq("staff_id", onlyMine);
      const { data, error } = await query.order("starts_at");
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Marks a booking paid / unpaid. Revenue widgets read the same query cache, so
 * invalidating "admin-bookings" refreshes paid + unpaid totals immediately.
 */
export function useSetPaymentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; status: "paid" | "unpaid" | "refunded" }) => {
      const { error } = await supabase
        .from("bookings")
        .update({
          payment_status: vars.status,
          paid_at: vars.status === "paid" ? new Date().toISOString() : null,
        })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
  });
}

/* ------------------------- staff ↔ service assignment ------------------------ */

export function useStaffServices(businessIds: string[]) {
  const staff = useManagedStaff(businessIds);
  const staffIds = useMemo(() => (staff.data ?? []).map((s) => s.id), [staff.data]);

  return useQuery({
    queryKey: ["admin-staff-services", staffIds],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_services")
        .select("id, staff_id, service_id, custom_price, custom_duration_minutes")
        .in("staff_id", staffIds);
      if (error) throw error;
      return data;
    },
  });
}

/** Adds or removes a staff ↔ service link. */
export function useToggleStaffService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { staffId: string; serviceId: string; enabled: boolean }) => {
      if (vars.enabled) {
        const { error } = await supabase
          .from("staff_services")
          .insert({ staff_id: vars.staffId, service_id: vars.serviceId });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase
          .from("staff_services")
          .delete()
          .eq("staff_id", vars.staffId)
          .eq("service_id", vars.serviceId);
        if (error) throw error;
      }
    },
    onSuccess: () => invalidateCatalogue(queryClient),
  });
}

export type StaffServiceAssignment = {
  serviceId: string;
  customPrice: number | null;
  customDuration: number | null;
};

/**
 * Replaces the full service list of one specialist, keeping optional custom
 * price / duration overrides per service.
 */
export function useSaveStaffServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { staffId: string; assignments: StaffServiceAssignment[] }) => {
      const { error: delError } = await supabase
        .from("staff_services")
        .delete()
        .eq("staff_id", vars.staffId);
      if (delError) throw delError;
      if (!vars.assignments.length) return;
      const { error } = await supabase.from("staff_services").insert(
        vars.assignments.map((a) => ({
          staff_id: vars.staffId,
          service_id: a.serviceId,
          custom_price: a.customPrice,
          custom_duration_minutes: a.customDuration,
        })),
      );
      if (error) throw error;
    },
    onSuccess: () => invalidateCatalogue(queryClient),
  });
}

export function invalidateCatalogue(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["admin-staff-services"] });
  queryClient.invalidateQueries({ queryKey: ["admin-services"] });
  queryClient.invalidateQueries({ queryKey: ["admin-staff"] });
  queryClient.invalidateQueries({ queryKey: ["admin-businesses"] });
  queryClient.invalidateQueries({ queryKey: ["businesses"] });
}

/* --------------------------------- services -------------------------------- */

export const SERVICE_TAGS = ["Standard", "Top Selection", "New", "Popular", "Recommended"] as const;

export type ServiceInput = {
  id?: string;
  business_id: string;
  name: string;
  category: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  discount_price: number | null;
  is_active: boolean;
  image_url: string | null;
  deposit: number | null;
  processing_minutes: number;
  cleanup_minutes: number;
  tag: string | null;
};

export function useSaveService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ServiceInput) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from("services").update(rest).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("services").insert(input).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => invalidateCatalogue(queryClient),
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateCatalogue(queryClient),
  });
}

/* ------------------------------- specialists ------------------------------- */

export const SPECIALIST_ROLES = [
  "Stylist",
  "Senior stylist",
  "Colourist",
  "Barber",
  "Nail technician",
  "Beautician",
  "Therapist",
  "Makeup artist",
  "Receptionist",
] as const;

export type StaffInput = {
  id?: string;
  business_id: string;
  full_name: string;
  title: string;
  avatar_url: string | null;
  is_active: boolean;
  /** Contact columns are write-only for owners; reads go through a server fn. */
  email?: string | null;
  phone?: string | null;
  bio?: string | null;
  experience_years?: number | null;
  languages?: string[];
  certificates?: string[];
  portfolio?: string[];
  social_links?: Record<string, string>;
};

export function useSaveStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StaffInput) => {
      if (input.id) {
        const { id, ...rest } = input;
        const { error } = await supabase.from("staff").update(rest).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase.from("staff").insert(input).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => invalidateCatalogue(queryClient),
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateCatalogue(queryClient),
  });
}
