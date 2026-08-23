import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { z } from "zod";
import {
  Apple,
  ArrowLeft,
  BadgeCheck,
  BellRing,
  CalendarDays,
  Check,
  Clock,
  Loader2,
  ShieldAlert,
  Star,
  TriangleAlert,
  Wallet,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { formatMoney, formatInTimezone } from "@/lib/countries";
import { savePendingBooking, readPendingBooking, clearPendingBooking } from "@/lib/pending-booking";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/dallty/bottom-nav";
import { LanguageSwitcher } from "@/components/dallty/language-switcher";
import { useTranslation } from "@/lib/i18n/hooks";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";
import { FavoriteButton } from "@/components/dallty/favorite-button";
import { BusinessReviews } from "@/components/dallty/business-reviews";
import { BusinessOverview } from "@/components/dallty/business-overview";
import { BusinessPageSkeleton } from "@/components/dallty/skeletons";
import {
  AvailabilityCalendar,
  type DayAvailability,
} from "@/components/dallty/availability-calendar";
import { PhoneField, type PhoneFieldValue } from "@/components/dallty/phone-field";
import { guessCountryCode, isValidE164, splitE164, toE164 } from "@/lib/phone";
import { getCountryByCode, getDefaultCountry, useCategories } from "@/lib/reference-data";
import { useLocale } from "@/lib/i18n";
import {
  getBusinessPublicStaff,
  getBusinessAvailabilityOverview,
  getStaffDayAvailability,
  getAvailableSlots,
  checkPromoCode,
} from "@/lib/business-detail.functions";
import {
  createBookingHold,
  confirmBookingHold,
  cancelBookingHold,
} from "@/lib/booking-engine.functions";

export const Route = createFileRoute("/business/$businessSlug")({
  beforeLoad: async ({ params }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: live } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", params.businessSlug)
      .maybeSingle();
    if (live) return;

    const { data: retired } = await supabase
      .from("business_slug_redirects")
      .select("business_id")
      .eq("old_slug", params.businessSlug)
      .maybeSingle();
    if (!retired) return; // Let the component's own 404 handling take over.

    const { data: current } = await supabase
      .from("businesses")
      .select("slug")
      .eq("id", retired.business_id)
      .maybeSingle();
    if (!current) return;

    await supabase.rpc("bump_slug_redirect_hit", { _old_slug: params.businessSlug });

    const { redirect } = await import("@tanstack/react-router");
    throw redirect({
      to: "/business/$businessSlug",
      params: { businessSlug: current.slug },
      statusCode: 301,
    });
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { book?: boolean; tab?: "overview" | "book" | "reviews" } => ({
    book: search.book === true || search.book === "true" ? true : undefined,
    tab:
      search.tab === "overview" || search.tab === "book" || search.tab === "reviews"
        ? search.tab
        : undefined,
  }),
  errorComponent: () => <BusinessProblem title="We couldn't load this shop" />,
  notFoundComponent: () => <BusinessProblem title="This shop is no longer available" />,
  head: () => ({
    meta: [
      { title: "Shop details & booking — Dallty" },
      {
        name: "description",
        content:
          "See services, prices, opening hours and location for this shop, then book your appointment with live availability.",
      },
      { property: "og:title", content: "Shop details & booking — Dallty" },
      {
        property: "og:description",
        content: "Services, prices, hours, location and instant booking on Dallty.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookingFlow,
});

const STEPS = ["Service", "Specialist", "Date", "Time", "Your Info", "Payment", "Confirm"] as const;

/**
 * Maps the server's machine-readable booking error codes (booking-engine.functions.ts
 * BOOKING_ERROR_CODES) to a localized, customer-facing message (en/fr/ar via booking.json's
 * "hold" namespace). Never shows a raw error, RPC name, or Postgres detail to the customer —
 * an unrecognized code (including a bare network failure) falls back to a generic message
 * rather than leaking internals.
 */
function bookingErrorMessage(
  code: string,
  tb: (key: NamespaceKeyMap["booking"]) => string,
): string {
  switch (code) {
    case "SLOT_UNAVAILABLE":
      return tb("hold.error_slot_unavailable");
    case "HOLD_EXPIRED":
      return tb("hold.error_hold_expired");
    case "BOOKING_NOT_FOUND":
      return tb("hold.error_booking_not_found");
    case "UNAUTHORIZED_BOOKING":
      return tb("hold.error_unauthorized");
    case "BOOKING_ALREADY_CONFIRMED":
      return tb("hold.error_already_confirmed");
    case "SPECIALIST_UNAVAILABLE":
      return tb("hold.error_specialist_unavailable");
    case "NO_ELIGIBLE_SPECIALIST":
      return tb("hold.error_no_eligible_specialist");
    case "BUSINESS_CLOSED":
      return tb("hold.error_business_closed");
    case "BOOKING_HORIZON_EXCEEDED":
      return tb("hold.error_horizon_exceeded");
    case "MINIMUM_NOTICE_REQUIRED":
      return tb("hold.error_minimum_notice");
    case "BOOKING_LIMIT_REACHED":
      return tb("hold.error_limit_reached");
    case "INVALID_BOOKING_CONTEXT":
      return tb("hold.error_invalid_context");
    case "CUSTOMER_ACCOUNT_REQUIRED":
      return tb("hold.error_customer_account_required");
    case "NETWORK_ERROR":
      return tb("hold.error_network");
    default:
      return tb("hold.error_generic");
  }
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "book", label: "Book" },
  { id: "reviews", label: "Reviews" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Shown instead of a blank page when a shop can't be loaded. */
function BusinessProblem({ title }: { title: string }) {
  return (
    <div className="mx-auto grid min-h-dvh max-w-lg place-items-center px-6 text-center">
      <div className="rounded-3xl glass p-8">
        <h1 className="text-xl font-extrabold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link may be out of date, or the shop is not listed right now.
        </p>
        <Link
          to="/search"
          search={{
            q: "",
            country: "",
            state: "",
            city: "",
            type: "",
            sort: "rating",
            instant: false,
            open: false,
          }}
          className="press mt-5 inline-flex min-h-12 items-center rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground"
        >
          Browse shops
        </Link>
      </div>
    </div>
  );
}

function BookingFlow() {
  const { businessSlug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const { data: categories } = useCategories();
  const { lang } = useLocale();
  const { t } = useTranslation("common");
  const { t: tb } = useTranslation("booking");

  const { book: bookIntent, tab: tabParam } = Route.useSearch();
  // Tab lives in the URL so deep links, refreshes and the back button all work.
  const tab: TabId = tabParam ?? (bookIntent ? "book" : "overview");
  const setTab = (id: TabId) =>
    navigate({
      to: "/business/$businessSlug",
      params: { businessSlug },
      search: (prev) => ({ ...prev, tab: id }),
    });
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [day, setDay] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [slot, setSlot] = useState<string | null>(null);
  // Set when the customer left to sign in with a slot already chosen.
  const [autoConfirm, setAutoConfirm] = useState(false);
  const restored = useRef(false);

  // Coming back from sign-in, OR just recovering from a plain refresh/dropped connection
  // while already signed in: pick the booking up as close as possible to where it was left,
  // never a dead restart from Service.
  useEffect(() => {
    if (authLoading || restored.current) return;
    restored.current = true;
    const pending = readPendingBooking(businessSlug);
    if (!pending) return;
    if (pending.serviceId) setServiceId(pending.serviceId);
    if (pending.staffId) setStaffId(pending.staffId);
    if (pending.day) setDay(pending.day);
    if (pending.slot) setSlot(pending.slot);
    setTab("book");
    const canAutoConfirm = Boolean(pending.autoConfirm && pending.slot && user);
    if (canAutoConfirm) {
      // Left signed out with a slot already chosen and ready to go — resume and confirm
      // automatically, the same "finish what I started before the sign-in detour" promise
      // this mechanism has always made. Keep the intent stored until the booking actually
      // lands, so a refresh during confirmation resumes instead of losing the slot.
      setStep(4);
      setAutoConfirm(true);
      toast.info("Signed in — confirming your booking…");
    } else if (user) {
      // Already signed in — this is a plain refresh/reconnect, not a sign-in detour. Never
      // silently confirm on their behalf; just land as close as possible to where they were.
      // Anything past "Your Info" needs a real hold, which any refresh always loses along with
      // all other component state — step 4 recreates one automatically (see the
      // auto-create-hold effect near createHold's declaration) and the identityComplete effect
      // advances straight back to Payment the moment it lands, so this is at most one extra
      // beat on the way back, never a dead end.
      setStep(Math.min(pending.step, 4));
      clearPendingBooking();
    } else {
      // Signed out, not a resume-and-confirm — land on the actual step they'd reached, never
      // jump ahead of a selection they hadn't made yet (e.g. no specialist chosen shouldn't
      // skip straight to Time). Capped at 4: past that needs a signed-in session either way,
      // which is exactly what step 4 itself asks for.
      setStep(Math.min(pending.step, 4));
      clearPendingBooking();
      toast.info("Picked up where you left off — review and confirm.");
    }
  }, [businessSlug, authLoading, user]);

  function stashBooking() {
    savePendingBooking({
      businessId: businessSlug,
      serviceId,
      staffId,
      day,
      slot,
      step,
      // Only meaningful for the signed-out -> OAuth round trip ("I'd already decided, confirm
      // automatically once I'm back") — never set while already signed in, where the same
      // mechanism now also runs just to survive a plain refresh; auto-confirming someone's
      // booking behind their back because their connection blipped would be a real regression.
      autoConfirm: Boolean(!user && slot && serviceId && staffId && step >= 4),
    });
  }

  // Keep the choice mirrored to storage continuously — both signed out (so signing in from
  // anywhere comes back to this exact slot) and signed in (so an accidental refresh or a
  // dropped connection mid-flow doesn't throw away service/specialist/date/slot progress).
  useEffect(() => {
    if (authLoading || !restored.current) return;
    if (!serviceId && !staffId && !slot) return;
    stashBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, businessSlug, serviceId, staffId, day, slot, step]);

  const businessQuery = useQuery({
    queryKey: ["business", businessSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select(
          "id, owner_id, name, name_ar, description, description_ar, area, area_ar, city, image_url, rating, review_count, price_range, distance_km, opens_at, closes_at, instant_booking, is_active, created_at, amenities, languages, awards, certifications, brands, cancellation_policy, cancellation_policy_ar, house_rules, house_rules_ar, owner_story, owner_story_ar, faq, video_tour_url, instagram_url, tiktok_url, address, status, business_type, categories, website_url, facebook_url, country, district, postal_code, maps_url, employee_count, branch_count, logo_url, cover_url, is_listed, is_verified, country_code, currency, timezone, require_deposit, deposit_percent",
        )
        .eq("slug", businessSlug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    // A missing shop should show its own screen straight away, not spin.
    retry: 1,
    staleTime: 60_000,
  });

  const business = businessQuery.data;

  // Every booking must resolve to a specific branch, chosen explicitly by the customer when a
  // business has more than one (Business -> Branch -> Services -> ...). A single-branch
  // business — every real business today — skips the branch screen entirely.
  const branchesQuery = useQuery({
    queryKey: ["branches", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_branches")
        .select("id, name, is_main, city, address, latitude, longitude")
        .eq("business_id", business!.id)
        .eq("status", "active")
        .order("is_main", { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const branches = useMemo(() => branchesQuery.data ?? [], [branchesQuery.data]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const needsBranchChoice = branches.length > 1;

  // Auto-skip: a single-branch business never shows the branch step at all.
  useEffect(() => {
    if (needsBranchChoice || !branches.length || selectedBranchId) return;
    setSelectedBranchId(branches[0].id);
  }, [needsBranchChoice, branches, selectedBranchId]);

  const branchId = needsBranchChoice ? (selectedBranchId ?? undefined) : branches[0]?.id;

  const servicesQuery = useQuery({
    queryKey: ["services", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("business_id", business!.id)
        .eq("is_active", true)
        .order("price");
      if (error) throw error;
      return data;
    },
  });

  const staffQuery = useQuery({
    queryKey: ["staff", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => getBusinessPublicStaff({ data: { businessId: business!.id } }),
  });

  /**
   * Open-slot counts for every specialist ↔ service pair over the next two
   * weeks, so we can show what's really bookable instead of an empty time step.
   */
  const availabilityQuery = useQuery({
    queryKey: ["availability-summary", business?.id, branchId],
    enabled: Boolean(business?.id && branchId),
    queryFn: async () =>
      getBusinessAvailabilityOverview({
        data: { businessId: business!.id, branchId: branchId!, days: 14 },
      }),
  });

  const availability = availabilityQuery.data ?? [];

  /** Availability of one specialist for one service. */
  const pairInfo = (staff: string, service: string | null) =>
    service
      ? availability.find((a) => a.staff_id === staff && a.service_id === service)
      : undefined;

  /** Bookability of a service across every specialist who performs it. */
  const serviceInfo = (service: string) => {
    const rows = availability.filter((a) => a.service_id === service);
    return {
      specialists: rows.length,
      withHours: rows.filter((r) => r.has_schedule).length,
      openSlots: rows.reduce((sum, r) => sum + Number(r.open_slots ?? 0), 0),
    };
  };

  /** Only specialists who actually perform the chosen service.
   * Memoized: this feeds useQueries below, which needs a referentially
   * stable array or it treats every render as a brand-new query set. */
  const eligibleStaff = useMemo(
    () =>
      (staffQuery.data ?? []).filter(
        (m) => !serviceId || (m.service_ids ?? []).includes(serviceId),
      ),
    [staffQuery.data, serviceId],
  );

  /** Average rating per specialist, for the specialist cards. */
  const staffRatingQuery = useQuery({
    queryKey: ["staff-ratings", business?.id],
    enabled: Boolean(business?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("staff_id, rating")
        .eq("business_id", business!.id)
        .eq("is_hidden", false)
        .not("staff_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const staffRatings = useMemo(() => {
    const acc = new Map<string, { avg: number; count: number }>();
    for (const r of staffRatingQuery.data ?? []) {
      if (!r.staff_id) continue;
      const prev = acc.get(r.staff_id) ?? { avg: 0, count: 0 };
      const count = prev.count + 1;
      acc.set(r.staff_id, { avg: (prev.avg * prev.count + Number(r.rating)) / count, count });
    }
    return acc;
  }, [staffRatingQuery.data]);

  /** First open day per eligible specialist for the chosen service.
   * The `queries` array passed to useQueries must be referentially stable
   * across renders that don't actually change the input — otherwise the
   * observer treats it as a new query set every render, which (confirmed
   * live: a real, pre-existing bug this project surfaced for the first time
   * once a real business had real services/staff/availability to render
   * against) causes a continuous request loop, not just a wasted re-render. */
  const nextAvailableQueriesConfig = useMemo(
    () =>
      eligibleStaff.map((m) => ({
        queryKey: ["day-availability", m.id, serviceId, branchId],
        enabled: Boolean(serviceId && branchId),
        queryFn: async () =>
          (await getStaffDayAvailability({
            data: { staffId: m.id, branchId: branchId!, serviceId: serviceId!, days: 14 },
          })) as DayAvailability[],
      })),
    [eligibleStaff, serviceId, branchId],
  );
  const nextAvailableQueries = useQueries({ queries: nextAvailableQueriesConfig });

  const nextAvailableByStaff = useMemo(() => {
    const map = new Map<string, string>();
    eligibleStaff.forEach((m, i) => {
      const rows = nextAvailableQueries[i]?.data ?? [];
      const first = rows.find((d) => d.status === "open" || d.status === "limited");
      if (first) map.set(m.id, first.day);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextAvailableQueries.map((q) => q.dataUpdatedAt).join(","), eligibleStaff.length]);

  /** Selecting a service resets the specialist, day and time, then advances. Releases any hold
   * from a previously-chosen time — it no longer matches this selection. */
  function selectService(id: string) {
    resetHold();
    setServiceId(id);
    setStaffId(null);
    setSlot(null);
    setStep(1);
  }

  /** Selecting a specialist resets the time, then advances to the date step. */
  function selectStaff(id: string) {
    resetHold();
    setStaffId(id);
    setSlot(null);
    setStep(2);
  }

  const slotsQuery = useQuery({
    queryKey: ["slots", staffId, serviceId, day, branchId],
    enabled: Boolean(staffId && serviceId && branchId && step >= 3),
    queryFn: async () =>
      getAvailableSlots({
        data: { staffId: staffId!, branchId: branchId!, serviceId: serviceId!, day },
      }),
  });

  /**
   * Day-by-day status for the chosen specialist ↔ service, so the calendar can
   * show open / limited / fully booked / closed before a date is tapped.
   * Refetches instantly whenever the specialist or service changes.
   */
  const dayAvailabilityQuery = useQuery({
    queryKey: ["day-availability", staffId, serviceId, branchId],
    enabled: Boolean(staffId && serviceId && branchId),
    queryFn: async () =>
      (await getStaffDayAvailability({
        data: { staffId: staffId!, branchId: branchId!, serviceId: serviceId!, days: 14 },
      })) as DayAvailability[],
  });

  const dayStatuses = dayAvailabilityQuery.data ?? [];
  const selectedDayInfo = dayStatuses.find((d) => d.day === day);
  const dayBookable =
    !staffId ||
    !serviceId ||
    dayAvailabilityQuery.isLoading ||
    !selectedDayInfo ||
    selectedDayInfo.status === "open" ||
    selectedDayInfo.status === "limited";

  // Land the customer on the first bookable date instead of a dead day.
  useEffect(() => {
    if (!dayStatuses.length) return;
    const current = dayStatuses.find((d) => d.day === day);
    if (current && (current.status === "open" || current.status === "limited")) return;
    const first = dayStatuses.find((d) => d.status === "open" || d.status === "limited");
    if (first && first.day !== day) {
      setDay(first.day);
      setSlot(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayAvailabilityQuery.data]);

  // Real-time availability: any booking change for this business refreshes open slots.
  useEffect(() => {
    if (!business?.id) return;
    const channel = supabase
      .channel(`bookings-${business.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `business_id=eq.${business.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["slots"] });
          queryClient.invalidateQueries({ queryKey: ["availability-summary"] });
          queryClient.invalidateQueries({ queryKey: ["day-availability"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [business?.id, queryClient]);

  // Keep a lightweight "recently viewed" trail for signed-in customers.
  useEffect(() => {
    if (!user || !business?.id) return;
    supabase
      .from("recently_viewed")
      .upsert(
        { user_id: user.id, business_id: business.id, viewed_at: new Date().toISOString() },
        { onConflict: "user_id,business_id" },
      )
      .then(() => undefined);
  }, [user, business?.id]);

  const service = servicesQuery.data?.find((s) => s.id === serviceId) ?? null;
  const staffMember = staffQuery.data?.find((s) => s.id === staffId) ?? null;

  // A reachable phone number is required to confirm — Google sign-ups often
  // arrive without one, so we collect it inline on the confirmation step.
  const profileQuery = useQuery({
    queryKey: ["booking-profile", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, country_code")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const savedPhone = profileQuery.data?.phone ?? null;
  const [phone, setPhone] = useState<PhoneFieldValue>({
    countryCode: guessCountryCode(),
    national: "",
  });
  const phoneSeeded = useRef(false);

  useEffect(() => {
    if (phoneSeeded.current || !profileQuery.isSuccess) return;
    phoneSeeded.current = true;
    const raw = profileQuery.data?.phone;
    if (raw) {
      setPhone(splitE164(raw));
    } else if (profileQuery.data?.country_code) {
      setPhone({ countryCode: guessCountryCode(profileQuery.data.country_code), national: "" });
    }
  }, [profileQuery.isSuccess, profileQuery.data]);

  const phoneE164 = toE164(
    (getCountryByCode(phone.countryCode) ?? getDefaultCountry()).calling_code,
    phone.national,
  );
  // Every booking is a customer account now -- no guest checkout. `name` is collected once
  // authenticated (step 4, if the profile doesn't already have one); `phone` is the number
  // typed pre-auth to receive the inline sign-in SMS OTP -- a *different* phone concern than
  // the top-level `phone` state above, which is the post-auth "profile is missing a phone"
  // case and is what actually gets saved once signed in.
  const [customerDraft, setCustomerDraft] = useState<{ name: string; phone: PhoneFieldValue }>({
    name: "",
    phone: { countryCode: guessCountryCode(), national: "" },
  });
  const customerDraftPhoneE164 = toE164(
    (getCountryByCode(customerDraft.phone.countryCode) ?? getDefaultCountry()).calling_code,
    customerDraft.phone.national,
  );

  // Inline phone-first authentication for step 4 — every booking requires a signed-in
  // customer account, so a time slot picked while signed out advances straight here instead
  // of creating any hold; the hold itself is only ever created afterward, once `user` exists
  // (see the auto-create-hold effect below), always through the same authenticated path a
  // returning customer uses. Reuses `customerDraft.phone` as the number to verify.
  // Full sign-in, not just phone — mirrors the standalone /auth "choose" step's hierarchy
  // (phone primary, email secondary, Google/Apple below a divider) so a customer isn't
  // limited to a number they can't receive SMS on. Email OTP and OAuth both land back on
  // this exact page: OAuth via `redirectTo`, and the booking selections survive the round
  // trip via the pre-existing pending-booking stash/restore effects above (`stashBooking`).
  const [inlineAuthMethod, setInlineAuthMethod] = useState<"phone" | "email">("phone");
  const [inlineAuthOtp, setInlineAuthOtp] = useState("");
  const [inlineAuthOtpSent, setInlineAuthOtpSent] = useState(false);
  const [inlineAuthEmail, setInlineAuthEmail] = useState("");
  const [inlineAuthEmailOtpSent, setInlineAuthEmailOtpSent] = useState(false);
  const [inlineAuthBusy, setInlineAuthBusy] = useState(false);

  async function sendInlineAuthOtp() {
    if (!isValidE164(customerDraftPhoneE164)) {
      toast.error("Enter a valid phone number");
      return;
    }
    setInlineAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: customerDraftPhoneE164 });
      if (error) throw error;
      setInlineAuthOtpSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the code. Try again.");
    } finally {
      setInlineAuthBusy(false);
    }
  }

  async function verifyInlineAuthOtp() {
    if (inlineAuthOtp.trim().length < 4) {
      toast.error("Enter the code we sent you");
      return;
    }
    setInlineAuthBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: customerDraftPhoneE164,
        token: inlineAuthOtp.trim(),
        type: "sms",
      });
      if (error) throw error;
      // `user` updates via the app-wide auth listener once the session lands; nothing else to
      // do here — the step-4 render below reacts to it automatically.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code didn't work. Try again.");
    } finally {
      setInlineAuthBusy(false);
    }
  }

  async function sendInlineAuthEmailOtp() {
    const parsed = z.string().trim().email().safeParse(inlineAuthEmail);
    if (!parsed.success) {
      toast.error("Enter a valid email address");
      return;
    }
    setInlineAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setInlineAuthEmailOtpSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the code. Try again.");
    } finally {
      setInlineAuthBusy(false);
    }
  }

  async function verifyInlineAuthEmailOtp() {
    if (inlineAuthOtp.trim().length < 4) {
      toast.error("Enter the code we sent you");
      return;
    }
    setInlineAuthBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: inlineAuthEmail.trim(),
        token: inlineAuthOtp.trim(),
        type: "email",
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That code didn't work. Try again.");
    } finally {
      setInlineAuthBusy(false);
    }
  }

  async function inlineOAuth(provider: "google" | "apple") {
    setInlineAuthBusy(true);
    try {
      stashBooking();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.href },
      });
      if (error) {
        toast.error(`${provider === "google" ? "Google" : "Apple"} sign-in failed`);
        setInlineAuthBusy(false);
      }
      // On success the browser navigates away immediately — no need to reset busy here.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed. Try again.");
      setInlineAuthBusy(false);
    }
  }

  // Once inline auth succeeds and the profile already has a name (e.g. from a Google
  // account), carry it into customerDraft so the name field doesn't ask again — but never
  // clobber something the customer already typed here themselves.
  useEffect(() => {
    if (!user || !profileQuery.isSuccess) return;
    const name = profileQuery.data?.full_name?.trim();
    if (name) setCustomerDraft((c) => (c.name ? c : { ...c, name }));
  }, [user, profileQuery.isSuccess, profileQuery.data]);

  // Briefly holds the just-confirmed booking's reference before the full-screen success
  // takeover (every booking is a signed-in customer now, so that takeover always fires).
  const [bookingResult, setBookingResult] = useState<{ id: string; reference: string } | null>(
    null,
  );

  // Optional coupon, applied only on the confirmation step.
  const basePrice = service ? Number(service.discount_price ?? service.price) : 0;
  const [coupon, setCoupon] = useState("");
  const [promo, setPromo] = useState<{
    id: string;
    code: string;
    discount: number;
    final: number;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);

  const applyCoupon = useMutation({
    mutationFn: async () => {
      const code = coupon.trim();
      if (!code) throw new Error("Enter a coupon code");
      const row = await checkPromoCode({
        data: { businessId: business!.id, code, amount: basePrice },
      });
      if (!row || !row.valid || !row.promotion_id) {
        const reason =
          row?.reason === "expired"
            ? "This coupon has expired."
            : row?.reason === "used_up"
              ? "This coupon has reached its limit."
              : row?.reason === "min_amount"
                ? "This coupon needs a higher order total."
                : "That coupon code isn't valid.";
        throw new Error(reason);
      }
      return {
        id: row.promotion_id,
        code: code.toUpperCase(),
        discount: Number(row.discount),
        final: Number(row.final_price),
      };
    },
    onSuccess: (value) => {
      setPromo(value);
      setCouponError(null);
      toast.success("Coupon applied");
    },
    onError: (error) => {
      setPromo(null);
      setCouponError(error instanceof Error ? error.message : "Coupon check failed");
    },
  });

  // A changed service invalidates any applied discount.
  useEffect(() => {
    setPromo(null);
    setCouponError(null);
  }, [serviceId]);

  // ============================================================
  // Booking state machine (Project 10): IDLE -> HOLDING -> HELD -> CONFIRMING -> SUCCESS,
  // with HOLD_EXPIRED / SLOT_UNAVAILABLE / ERROR side exits. The browser never decides
  // availability, price, or booking status — every transition here reflects a server
  // response, never an optimistic local guess.
  // ============================================================
  type BookingPhase =
    | "idle"
    | "holding"
    | "held"
    | "confirming"
    | "success"
    | "hold_expired"
    | "slot_unavailable"
    | "account_blocked"
    | "error";
  type HoldState = {
    holdId: string;
    reference: string;
    staffId: string;
    expiresAt: string;
    totalPrice: number;
    currency: string;
  };

  const [bookingPhase, setBookingPhase] = useState<BookingPhase>("idle");
  const [hold, setHold] = useState<HoldState | null>(null);
  const [bookingErrorCode, setBookingErrorCode] = useState<string | null>(null);

  // Every hold is now created through the same authenticated path (createBookingHold) --
  // there's no more guest-owned hold, so a still-missing phone/name always feeds `phone`/
  // `customerDraft.name` and always gets saved onto `profiles` at confirm time.
  const needsPhone = Boolean(user) && profileQuery.isSuccess && !isValidE164(savedPhone ?? "");
  const phoneReady = !needsPhone || isValidE164(phoneE164);
  // The profile's own full_name, never customerDraft.name -- checking the input's own live
  // value here made the field hide itself the instant the customer typed anything into it
  // (this same flag also gates whether the input renders at all, so "needed" flipping false
  // the moment it had content made it vanish mid-keystroke).
  const needsInlineName =
    Boolean(user) && profileQuery.isSuccess && !profileQuery.data?.full_name?.trim();
  const nameReady = !needsInlineName || Boolean(customerDraft.name.trim());

  // Step 4 ("Customer Information") is skipped entirely once we already know
  // who's booking — an authenticated user with a phone on file. Every place
  // that sets `step` to 4 (time-slot pick, the sign-in-detour restore, the
  // autoConfirm effect, a manual progress-pill click) keeps working
  // unmodified; this just bounces past it the instant nothing is missing.
  const identityLoading = authLoading || (Boolean(user) && profileQuery.isLoading);
  const identityComplete =
    Boolean(user) && profileQuery.isSuccess && !needsPhone && !needsInlineName;
  useEffect(() => {
    if (step !== 4 || identityLoading) return;
    if (identityComplete) setStep(5);
  }, [step, identityLoading, identityComplete]);
  // Generated once per hold, reused across every confirm retry for that hold so a flaky
  // connection or a double-tap can never create two bookings (withIdempotency, server-side).
  const idempotencyKeyRef = useRef<string | null>(null);

  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (bookingPhase !== "held" && bookingPhase !== "confirming") return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [bookingPhase]);
  // Purely cosmetic — the server re-checks hold_expires_at itself at confirm time regardless.
  const holdSecondsLeft = hold
    ? Math.max(0, Math.floor((new Date(hold.expiresAt).getTime() - nowTick) / 1000))
    : 0;
  useEffect(() => {
    if (bookingPhase === "held" && hold && holdSecondsLeft <= 0) setBookingPhase("hold_expired");
  }, [bookingPhase, hold, holdSecondsLeft]);

  // Best-effort release if the customer navigates away entirely (closes the tab, goes back to
  // search) while still holding a slot — not required for correctness (the hold expires on its
  // own regardless), just frees the slot for other customers sooner.
  const holdRef = useRef<HoldState | null>(null);
  const bookingPhaseRef = useRef(bookingPhase);
  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);
  useEffect(() => {
    bookingPhaseRef.current = bookingPhase;
  }, [bookingPhase]);
  useEffect(() => {
    return () => {
      if (holdRef.current && bookingPhaseRef.current !== "success") releaseHold(holdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before losing real progress -- reaching the Time step means a slot was actually
  // picked (or is about to be), which is the point real work starts being at risk. Nothing to
  // lose before that (still just browsing services/specialists/dates), and nothing to lose
  // after a successful confirmation either. `enableBeforeUnload` also wires up the browser's
  // own (unstylable, but real) confirmation for an actual tab close or refresh -- this custom
  // modal only covers in-app navigation (clicking Home, Search, the back button, etc.).
  const hasBookingProgress = tab === "book" && step >= 3 && bookingPhase !== "success";
  const exitBlocker = useBlocker({
    shouldBlockFn: () => hasBookingProgress,
    enableBeforeUnload: hasBookingProgress,
    withResolver: true,
  });

  /** Best-effort — frees the slot for other customers a little sooner. The hold's own expiry
   * is what actually guarantees release, so a lost request here is never a correctness issue. */
  function releaseHold(target: HoldState | null) {
    if (!target) return;
    cancelBookingHold({ data: { holdId: target.holdId } }).catch(() => {});
  }

  function resetHold() {
    releaseHold(hold);
    setHold(null);
    setBookingPhase("idle");
    setBookingErrorCode(null);
    idempotencyKeyRef.current = null;
  }

  const createHold = useMutation({
    mutationFn: async (params: { staffId: string | null; startsAt: string }) => {
      if (!service || !branchId) throw new Error("INVALID_BOOKING_CONTEXT");
      const payload = {
        businessId: business!.id,
        branchId,
        serviceIds: [service.id],
        staffId: params.staffId,
        startsAt: params.startsAt,
      };
      return await createBookingHold({ data: payload });
    },
    onMutate: () => {
      setBookingPhase("holding");
      setBookingErrorCode(null);
    },
    onSuccess: (result) => {
      setHold(result as HoldState);
      idempotencyKeyRef.current = crypto.randomUUID();
      setBookingPhase("held");
      // "Any specialist" resolves to a real one server-side — reflect that choice back.
      if (result.staffId !== staffId) setStaffId(result.staffId);
      setStep(4);
    },
    onError: (error) => {
      const code = error instanceof Error ? error.message : "NETWORK_ERROR";
      setBookingErrorCode(code);
      setBookingPhase(
        code === "SLOT_UNAVAILABLE"
          ? "slot_unavailable"
          : code === "CUSTOMER_ACCOUNT_REQUIRED"
            ? "account_blocked"
            : "error",
      );
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      if (code !== "SLOT_UNAVAILABLE" && code !== "CUSTOMER_ACCOUNT_REQUIRED") {
        toast.error(bookingErrorMessage(code, tb));
      }
    },
  });

  // A time slot picked while signed out (see the Time step's onClick above) advances straight
  // to step 4 without creating a hold. The moment inline sign-in succeeds and `user` lands,
  // create the hold now, through the same authenticated path a returning customer uses — then
  // let the normal step-by-step flow continue (profile completion, payment, explicit confirm)
  // rather than skipping ahead. Distinct from the `autoConfirm` effect below, which is only
  // for the OAuth-redirect-and-fully-resume case and deliberately also auto-confirms.
  useEffect(() => {
    if (autoConfirm) return;
    if (!user || !service || !slot || hold) return;
    if (bookingPhase !== "idle" || createHold.isPending) return;
    createHold.mutate({ staffId, startsAt: slot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, service, staffId, slot, hold, bookingPhase, autoConfirm]);

  const confirmBooking = useMutation({
    mutationFn: async () => {
      if (!hold) throw new Error("BOOKING_NOT_FOUND");
      if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();
      const couponCode = promo ? coupon.trim() : undefined;
      if (needsPhone && !isValidE164(phoneE164)) {
        throw new Error("Add a valid phone number to confirm");
      }
      if (needsInlineName && !customerDraft.name.trim()) {
        throw new Error("Add your name to confirm");
      }
      if (needsPhone || needsInlineName) {
        const profileUpdates: { phone?: string; country_code?: string; full_name?: string } = {};
        if (needsPhone) {
          profileUpdates.phone = phoneE164;
          profileUpdates.country_code = phone.countryCode;
        }
        if (needsInlineName) profileUpdates.full_name = customerDraft.name.trim();
        const { error: profileError } = await supabase
          .from("profiles")
          .update(profileUpdates)
          .eq("id", user!.id);
        if (profileError) throw profileError;
      }
      return await confirmBookingHold({
        data: {
          holdId: hold.holdId,
          idempotencyKey: idempotencyKeyRef.current,
          customerPhone: needsPhone ? phoneE164 : undefined,
          couponCode,
        },
      });
    },
    onMutate: () => {
      setBookingPhase("confirming");
      setBookingErrorCode(null);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      queryClient.invalidateQueries({ queryKey: ["availability-summary"] });
      queryClient.invalidateQueries({ queryKey: ["day-availability"] });
      clearPendingBooking();
      setAutoConfirm(false);
      setBookingPhase("success");
      setBookingResult({ id: data.id, reference: data.reference });
      // Full-screen success takeover (below) shows briefly, then redirects to /bookings
      // itself — see the timed-redirect effect near the mutation's declaration.
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking-profile"] });
    },
    onError: (error) => {
      const code = error instanceof Error ? error.message : "NETWORK_ERROR";
      setBookingErrorCode(code);
      setAutoConfirm(false);
      if (code === "HOLD_EXPIRED") {
        setBookingPhase("hold_expired");
        setHold(null);
        clearPendingBooking();
        return;
      }
      if (code === "BOOKING_ALREADY_CONFIRMED") {
        // A duplicate submission landed after the first one already went through (e.g. a
        // retried request racing its own earlier success) — this IS the success case.
        setBookingPhase("success");
        return;
      }
      if (code === "CUSTOMER_ACCOUNT_REQUIRED") {
        setBookingPhase("account_blocked");
        return;
      }
      setBookingPhase("error");
      toast.error(bookingErrorMessage(code, tb));
    },
  });

  // Full-screen success takeover, signed-in customers only (guests get the inline success
  // card below instead — there's no /bookings to send them to, it's auth-guarded). Shows
  // briefly then redirects on its own; the booking itself is already fully committed by the
  // time this fires, so the delay is pure UX, never something correctness depends on.
  useEffect(() => {
    if (bookingPhase !== "success" || !user) return;
    const id = setTimeout(() => navigate({ to: "/bookings" }), 2400);
    return () => clearTimeout(id);
  }, [bookingPhase, user, navigate]);

  // Finish the booking the customer started before the sign-in detour: create the hold now
  // that they're authenticated, then confirm it, same two-step flow as a live customer.
  useEffect(() => {
    if (!autoConfirm || !user || !service || !slot) return;
    if (!profileQuery.isSuccess) return;
    if (needsPhone) {
      setAutoConfirm(false);
      clearPendingBooking();
      setStep(4);
      toast.info("Add your phone number to finish the booking.");
      return;
    }
    if (bookingPhase === "idle" && !createHold.isPending) {
      createHold.mutate({ staffId, startsAt: slot });
      return;
    }
    if (bookingPhase === "held" && !confirmBooking.isPending && !confirmBooking.isSuccess) {
      setAutoConfirm(false);
      confirmBooking.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConfirm, user, service, staffId, slot, needsPhone, profileQuery.isSuccess, bookingPhase]);

  const waitlistQuery = useQuery({
    queryKey: ["waitlist", user?.id, staffId, serviceId, day],
    enabled: Boolean(user && staffId && serviceId && step >= 3),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist_entries")
        .select("*")
        .eq("customer_id", user!.id)
        .eq("staff_id", staffId!)
        .eq("service_id", serviceId!)
        .eq("day", day)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const waitlistEntry = waitlistQuery.data ?? null;

  const [autoBook, setAutoBook] = useState(true);
  const [requireConfirmation, setRequireConfirmation] = useState(true);

  const joinWaitlist = useMutation({
    mutationFn: async () => {
      if (!user || !serviceId || !staffId) throw new Error("Pick a service and specialist first");
      if (!branchId) throw new Error("Pick a service and specialist first");
      const { error } = await supabase.from("waitlist_entries").insert({
        customer_id: user.id,
        business_id: business!.id,
        branch_id: branchId,
        service_id: serviceId,
        staff_id: staffId,
        day,
        auto_book: autoBook,
        require_confirmation: requireConfirmation,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist"] });
      toast.success(
        autoBook
          ? requireConfirmation
            ? "You're on the waitlist — we'll hold a freed slot for you to confirm."
            : "You're on the waitlist — a freed slot will be booked automatically."
          : "You're on the waitlist — we'll alert you if a slot frees up.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not join the waitlist"),
  });

  const canContinue = [
    Boolean(serviceId),
    Boolean(staffId),
    Boolean(day) && dayBookable,
    // The time step advances automatically once its hold succeeds (createHold.onSuccess) —
    // "held" here just guards the sticky-footer Continue button from double-advancing while
    // the hold request for the just-tapped slot is still in flight or already failed.
    Boolean(slot) && bookingPhase === "held",
    // Signed out: the inline-auth UI has its own send/verify buttons, not this footer, so
    // there's nothing for Continue to gate here until `user` exists.
    Boolean(user) && phoneReady && nameReady,
    // Payment: "Pay at salon" needs no selection today (see the Payment step's own comment) --
    // just needs the hold to still be valid, same guard the Confirm step's own button already
    // has, so an expired hold can't be clicked past here either.
    bookingPhase === "held",
    true,
  ][step];

  function next() {
    if (step < 6) setStep(step + 1);
  }

  // Prices and times always follow the business's own country settings.
  const currency = business?.currency ?? "AED";
  const businessTz = business?.timezone ?? undefined;

  // Never leave a blank page: a missing or failed shop gets its own screen.
  if (businessQuery.isError) {
    return <BusinessProblem title="We couldn't load this shop" />;
  }
  if (businessQuery.isSuccess && !business) {
    return <BusinessProblem title="This shop is no longer available" />;
  }

  return (
    <div className="relative min-h-dvh pb-32">
      {exitBlocker.status === "blocked" && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-foreground/50 px-6 backdrop-blur-sm animate-fade-up"
          onClick={() => exitBlocker.reset?.()}
        >
          <div
            className="relative w-full max-w-sm rounded-4xl bg-card p-7 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => exitBlocker.reset?.()}
              aria-label="Close"
              className="press absolute end-4 top-4 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-gold/15 text-gold">
              <TriangleAlert className="size-8" />
            </div>
            <h2 className="mt-5 text-xl font-extrabold text-foreground">
              Leave without finishing?
            </h2>
            <p className="mt-2 text-sm text-foreground/70">
              Your appointment isn't confirmed yet. If you leave now, you'll lose your progress and
              need to start over.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => exitBlocker.reset?.()}
                className="press min-h-12 rounded-2xl bg-lime text-base font-bold text-lime-foreground"
              >
                Continue booking
              </button>
              <button
                type="button"
                onClick={() => exitBlocker.proceed?.()}
                className="press min-h-11 rounded-2xl text-sm font-semibold text-foreground/60"
              >
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      )}
      {bookingPhase === "success" && user && (
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-background px-6 animate-fade-up">
          <div
            aria-hidden
            className="glow-blob -z-10 size-[36rem]"
            style={{ top: "50%", left: "50%" }}
          />
          <div className="text-center">
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-(image:--gradient-primary) text-primary-foreground shadow-(--shadow-glow-primary)">
              <Check className="size-10" />
            </div>
            <h1 className="mt-6 text-2xl font-extrabold">Booking confirmed</h1>
            {service && (
              <p className="mt-2 text-sm text-muted-foreground">
                {service.name}
                {staffMember ? ` with ${staffMember.full_name}` : ""}
              </p>
            )}
            {slot && (
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {formatInTimezone(
                  slot,
                  businessTz,
                  {
                    weekday: "long",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  },
                  lang,
                )}
              </p>
            )}
            {bookingResult && (
              <p className="mt-3 font-mono text-xs font-bold text-muted-foreground">
                {bookingResult.reference}
              </p>
            )}
          </div>
        </div>
      )}

      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="glow-blob -top-32 start-[-10%] size-[34rem]" />
        <div
          className="glow-blob bottom-0 end-[-10%] size-[30rem]"
          style={{ animationDelay: "-8s" }}
        />
      </div>

      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-3xl glass px-4 py-3">
          <Link
            to="/"
            aria-label="Back to home"
            className="grid size-11 shrink-0 place-items-center rounded-2xl glass-soft"
          >
            <ArrowLeft className="size-5 rtl:rotate-180" />
          </Link>
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 truncate text-base font-extrabold">
              <span className="truncate">{business?.name ?? "Loading…"}</span>
              {business?.is_verified ? (
                <BadgeCheck className="size-4 shrink-0 text-gold" aria-label="Verified by Dallty" />
              ) : null}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {business ? `${business.area} · ${business.city}` : ""}
            </p>
          </div>

          {business && (
            <span className="ms-auto flex shrink-0 items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold">
              <Star className="size-4 fill-gold text-gold" />
              {Number(business.rating).toFixed(1)}
            </span>
          )}
          {business && user && (
            <FavoriteButton kind="business" targetId={business.id} label={business.name} />
          )}
          <LanguageSwitcher variant="icon" />
        </div>

        <div
          role="tablist"
          aria-label="Business sections"
          className="mx-auto mt-3 flex max-w-3xl gap-2 rounded-3xl glass p-2"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`press min-h-10 flex-1 rounded-2xl text-sm font-bold transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        {businessQuery.isLoading && (
          <div className="mt-6" aria-busy="true">
            <BusinessPageSkeleton />
          </div>
        )}
        {tab === "overview" && business && (
          <BusinessOverview
            business={business as never}
            services={(servicesQuery.data ?? []) as never}
            staffCount={(staffQuery.data ?? []).length}
            categories={categories ?? []}
            lang={lang}
            onBook={(id) => {
              if (id) {
                setServiceId(id);
                setStaffId(null);
                setSlot(null);
              }
              setStep(id ? 1 : 0);
              setTab("book");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}
        {tab === "reviews" && business && (
          <BusinessReviews businessId={business.id} isOwner={business.owner_id === user?.id} />
        )}

        {tab === "book" && needsBranchChoice && !selectedBranchId && (
          <section className="mt-7 animate-fade-up">
            <h2 className="text-2xl font-extrabold">Choose a location</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {business?.name} has {branches.length} locations — pick the one that works for you.
            </p>
            <div className="mt-4 grid gap-3">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBranchId(b.id)}
                  className="press flex items-center justify-between gap-4 rounded-3xl glass p-5 text-start transition-colors"
                >
                  <span>
                    <span className="block text-sm font-bold">
                      {b.name}
                      {b.is_main && (
                        <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-[0.65rem] font-semibold text-secondary-foreground">
                          Main
                        </span>
                      )}
                    </span>
                    {(b.city || b.address) && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {[b.address, b.city].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </span>
                  <ArrowLeft className="size-4 rotate-180 text-muted-foreground rtl:rotate-0" />
                </button>
              ))}
            </div>
          </section>
        )}

        {tab === "book" && (branchId || !needsBranchChoice) && (
          <>
            {/* Progress */}
            <ol className="mt-6 grid grid-cols-7 gap-1.5">
              {STEPS.map((label, i) => (
                <li key={label}>
                  <button
                    type="button"
                    disabled={i > step}
                    onClick={() => setStep(i)}
                    aria-current={i === step ? "step" : undefined}
                    className="w-full text-center disabled:cursor-default"
                  >
                    <span
                      className={`block h-1.5 rounded-full transition-colors ${
                        i <= step ? "bg-primary" : "bg-border"
                      }`}
                    />
                    <span
                      className={`mt-2 block text-[0.7rem] font-semibold sm:text-xs ${
                        i <= step ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            {/* Step 1 — service */}
            {step === 0 && (
              <section className="mt-7 animate-fade-up">
                <h2 className="text-2xl font-extrabold">Choose your service</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick one service — we&apos;ll show the specialists who offer it next.
                </p>
                <div className="mt-4 grid gap-3">
                  {servicesQuery.data?.map((s) => {
                    const info = serviceInfo(s.id);
                    const loadingAvailability = availabilityQuery.isLoading;
                    const bookable = loadingAvailability || info.openSlots > 0;
                    const reason =
                      info.specialists === 0
                        ? "Currently unavailable"
                        : info.withHours === 0
                          ? "No working hours set"
                          : "Fully booked";
                    const selected = serviceId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!bookable}
                        onClick={() => selectService(s.id)}
                        aria-pressed={selected}
                        className={`press flex items-center justify-between gap-4 rounded-3xl p-5 text-start transition-colors ${
                          selected ? "bg-primary text-primary-foreground" : "glass"
                        } ${bookable ? "" : "cursor-not-allowed opacity-60"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-base font-bold">{s.name}</span>
                          <span
                            className={`block text-sm ${selected ? "opacity-80" : "text-muted-foreground"}`}
                          >
                            {s.duration_minutes} min
                            {bookable && !loadingAvailability
                              ? ` · ${info.openSlots} slots open`
                              : ""}
                          </span>
                          {s.description ? (
                            <span
                              className={`mt-1 block line-clamp-2 text-xs ${selected ? "opacity-80" : "text-muted-foreground"}`}
                            >
                              {s.description}
                            </span>
                          ) : null}
                          {!bookable && (
                            <span className="mt-1 inline-block rounded-xl bg-gold/20 px-2 py-0.5 text-xs font-bold">
                              {reason}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-lg font-extrabold">
                          {formatMoney(s.discount_price ?? s.price, currency, lang)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Step 2 — specialist */}
            {step === 1 && (
              <section className="mt-7 animate-fade-up">
                <h2 className="text-2xl font-extrabold">Choose your specialist</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {service ? `Specialists who perform ${service.name}` : "Pick a service first"}
                </p>

                {eligibleStaff.length === 0 ? (
                  <div className="mt-5 space-y-4 rounded-3xl glass p-6 text-center">
                    <p className="text-sm text-muted-foreground">
                      No specialists are currently available for this service.
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="press min-h-12 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground"
                    >
                      Choose another service
                    </button>
                  </div>
                ) : (
                  <>
                    {eligibleStaff.length === 1 && (
                      <p className="mt-3 rounded-2xl bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary">
                        {eligibleStaff[0].full_name} is the only specialist for this service.
                      </p>
                    )}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {eligibleStaff.map((m) => {
                        const info = pairInfo(m.id, serviceId);
                        const open = Number(info?.open_slots ?? 0);
                        const free = availabilityQuery.isLoading || open > 0;
                        const chip = availabilityQuery.isLoading
                          ? "Checking…"
                          : open > 0
                            ? `${open} slots open`
                            : info?.has_schedule
                              ? "Fully booked"
                              : "No hours set";
                        const selected = staffId === m.id;
                        const rating = staffRatings.get(m.id);
                        const nextDay = nextAvailableByStaff.get(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            disabled={!free}
                            onClick={() => selectStaff(m.id)}
                            aria-pressed={selected}
                            className={`press flex items-start gap-3 rounded-3xl p-4 text-start transition-colors ${
                              selected ? "bg-primary text-primary-foreground" : "glass"
                            } ${free ? "" : "cursor-not-allowed opacity-60"}`}
                          >
                            {m.avatar_url ? (
                              <img
                                src={m.avatar_url}
                                alt={m.full_name}
                                width={56}
                                height={56}
                                loading="lazy"
                                className="size-14 shrink-0 rounded-2xl object-cover"
                              />
                            ) : (
                              <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-secondary text-lg font-extrabold text-secondary-foreground">
                                {m.full_name.slice(0, 1)}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base font-bold">
                                {m.full_name}
                              </span>
                              <span
                                className={`block truncate text-sm ${selected ? "opacity-80" : "text-muted-foreground"}`}
                              >
                                {m.title}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-2">
                                {rating ? (
                                  <span className="flex items-center gap-1 text-xs font-bold">
                                    <Star className="size-3.5 fill-gold text-gold" />
                                    {rating.avg.toFixed(1)} ({rating.count})
                                  </span>
                                ) : null}
                                <span
                                  className={`inline-block rounded-xl px-2 py-0.5 text-xs font-bold ${
                                    selected
                                      ? "bg-primary-foreground/20 text-primary-foreground"
                                      : open > 0
                                        ? "bg-primary/15 text-primary"
                                        : "bg-gold/20 text-foreground"
                                  }`}
                                >
                                  {chip}
                                </span>
                              </span>
                              {nextDay ? (
                                <span
                                  className={`mt-1 block text-xs font-semibold ${selected ? "opacity-80" : "text-muted-foreground"}`}
                                >
                                  Next available{" "}
                                  {format(new Date(`${nextDay}T00:00:00`), "EEE d MMM")}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* Step 3 — date */}
            {step === 2 && (
              <section className="mt-7 animate-fade-up">
                <h2 className="text-2xl font-extrabold">Pick a date</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {staffMember ? `Next two weeks with ${staffMember.full_name}` : "Next two weeks"}
                </p>
                <div className="mt-4">
                  <AvailabilityCalendar
                    data={dayStatuses}
                    loading={dayAvailabilityQuery.isLoading}
                    ready={Boolean(staffId && serviceId)}
                    value={day}
                    onSelect={(value) => {
                      resetHold();
                      setDay(value);
                      setSlot(null);
                      setStep(3);
                    }}
                  />
                </div>
              </section>
            )}

            {/* Step 4 — time */}
            {step === 3 && (
              <section className="mt-7 animate-fade-up">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                  <h2 className="text-2xl font-extrabold">Pick a time</h2>
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full glass-soft px-3 py-1.5 text-xs font-semibold">
                    <Wifi className="size-3.5 text-primary" />
                    Live availability
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {format(new Date(day), "EEEE d MMMM")} with {staffMember?.full_name}
                </p>

                {slotsQuery.isLoading ? (
                  <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-12 animate-pulse rounded-2xl bg-muted" />
                    ))}
                  </div>
                ) : (slotsQuery.data?.filter((s) => s.available).length ?? 0) === 0 ? (
                  <div className="mt-6 space-y-4 rounded-3xl glass p-6">
                    <p className="text-sm text-muted-foreground">
                      No times left on this day. Join the waitlist and we&apos;ll let you know the
                      moment a slot opens up.
                    </p>
                    {waitlistEntry ? (
                      <p className="flex items-center gap-2 text-sm font-bold text-primary">
                        <BellRing className="size-4" />
                        You&apos;re on the waitlist for this day.
                      </p>
                    ) : user ? (
                      <>
                        <label className="flex cursor-pointer items-center gap-3 rounded-2xl glass-soft px-4 py-3">
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">
                              Book it for me automatically
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              The first freed slot on this day becomes yours.
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            className="ms-auto size-5 accent-[hsl(var(--primary))]"
                            checked={autoBook}
                            onChange={(e) => setAutoBook(e.target.checked)}
                          />
                        </label>
                        {autoBook && (
                          <label className="flex cursor-pointer items-center gap-3 rounded-2xl glass-soft px-4 py-3">
                            <span className="min-w-0">
                              <span className="block text-sm font-bold">
                                Ask me to confirm first
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                We hold the slot as pending until you confirm it.
                              </span>
                            </span>
                            <input
                              type="checkbox"
                              className="ms-auto size-5 accent-[hsl(var(--primary))]"
                              checked={requireConfirmation}
                              onChange={(e) => setRequireConfirmation(e.target.checked)}
                            />
                          </label>
                        )}
                        <button
                          type="button"
                          disabled={joinWaitlist.isPending}
                          onClick={() => joinWaitlist.mutate()}
                          className="press flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
                        >
                          {joinWaitlist.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <BellRing className="size-4" />
                          )}
                          Join the waitlist
                        </button>
                      </>
                    ) : (
                      <Link
                        to="/auth"
                        onClick={stashBooking}
                        search={{ next: `/business/${businessSlug}` }}
                        className="press inline-flex min-h-12 items-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                      >
                        Sign in to join the waitlist
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {bookingPhase === "slot_unavailable" && (
                      <p className="col-span-full rounded-2xl bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive">
                        {bookingErrorMessage("SLOT_UNAVAILABLE", tb)}
                      </p>
                    )}
                    {bookingPhase === "account_blocked" && (
                      <div className="col-span-full space-y-3 rounded-2xl bg-destructive/10 px-4 py-3.5 text-center">
                        <p className="text-sm font-semibold text-destructive">
                          {bookingErrorMessage("CUSTOMER_ACCOUNT_REQUIRED", tb)}
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            await supabase.auth.signOut();
                            setBookingErrorCode(null);
                            setBookingPhase("idle");
                          }}
                          className="press min-h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                        >
                          {tb("hold.sign_out_continue_as_customer")}
                        </button>
                      </div>
                    )}
                    {slotsQuery.data?.map((s) => {
                      const active = slot === s.slot;
                      const pickingThis = active && createHold.isPending;
                      return (
                        <button
                          key={s.slot}
                          type="button"
                          disabled={!s.available || createHold.isPending}
                          onClick={() => {
                            resetHold();
                            setSlot(s.slot);
                            // Every booking needs a signed-in customer account -- if the
                            // visitor isn't authenticated yet, go straight to the inline
                            // sign-in step instead of creating a hold. The hold is created
                            // automatically the moment `user` lands (see the effect near
                            // createHold's declaration), through the same authenticated path
                            // a returning customer uses.
                            if (user) {
                              createHold.mutate({ staffId, startsAt: s.slot });
                            } else {
                              setStep(4);
                            }
                          }}
                          aria-pressed={active}
                          aria-busy={pickingThis}
                          className={`flex min-h-12 items-center justify-center gap-1.5 rounded-2xl text-sm font-bold transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : s.available
                                ? "glass"
                                : "bg-muted text-muted-foreground line-through"
                          } ${createHold.isPending && !pickingThis ? "opacity-50" : ""}`}
                        >
                          {pickingThis && <Loader2 className="size-3.5 animate-spin" />}
                          {formatInTimezone(
                            s.slot,
                            businessTz,
                            { hour: "2-digit", minute: "2-digit", hour12: false },
                            lang,
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Step 5 — customer information */}
            {step === 4 && (
              <section className="mt-7 animate-fade-up">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div>
                    <h2 className="text-2xl font-extrabold">
                      {user ? "Your information" : "Continue to book"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {user
                        ? "Just need a bit more to confirm your appointment."
                        : "Sign in to confirm this appointment."}
                    </p>
                  </div>
                  <HoldCountdown phase={bookingPhase} secondsLeft={holdSecondsLeft} tb={tb} />
                </div>

                {bookingPhase === "hold_expired" && (
                  <div className="mt-5 space-y-3 rounded-3xl bg-destructive/10 p-5 text-center">
                    <p className="text-sm font-semibold text-destructive">
                      {bookingErrorMessage("HOLD_EXPIRED", tb)}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        resetHold();
                        setSlot(null);
                        setStep(3);
                      }}
                      className="press min-h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                    >
                      {tb("hold.pick_new_time")}
                    </button>
                  </div>
                )}

                {bookingPhase === "hold_expired" ? null : identityLoading ? (
                  <div className="mt-5 h-32 animate-pulse rounded-3xl bg-muted" />
                ) : user ? (
                  (needsPhone || needsInlineName) && (
                    <div className="mt-5 space-y-4 rounded-3xl glass p-6">
                      {needsInlineName && (
                        <div>
                          <label
                            htmlFor="customer-name"
                            className="mb-1.5 block text-sm font-semibold"
                          >
                            Full name<span className="text-destructive"> *</span>
                          </label>
                          <input
                            id="customer-name"
                            value={customerDraft.name}
                            onChange={(e) =>
                              setCustomerDraft((c) => ({ ...c, name: e.target.value }))
                            }
                            autoComplete="name"
                            className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
                          />
                        </div>
                      )}
                      {needsPhone && (
                        <PhoneField
                          id="booking-phone"
                          value={phone}
                          onChange={setPhone}
                          label="Phone number"
                          required
                        />
                      )}
                    </div>
                  )
                ) : (
                  // Full sign-in inline — same hierarchy as the standalone /auth page's
                  // "choose" step (phone primary, email secondary, Google/Apple below a
                  // divider), but embedded directly in the booking flow. No redirect for
                  // phone/email OTP; Google/Apple necessarily bounce through the provider,
                  // but return to this exact page (stashBooking + pending-booking restore).
                  <div className="mt-5 space-y-4 rounded-3xl glass p-6">
                    {inlineAuthMethod === "phone" ? (
                      <>
                        <PhoneField
                          id="auth-phone"
                          value={customerDraft.phone}
                          onChange={(next) => setCustomerDraft((c) => ({ ...c, phone: next }))}
                          label="Phone number"
                          required
                          disabled={inlineAuthOtpSent || inlineAuthBusy}
                        />
                        {inlineAuthOtpSent && (
                          <div>
                            <label
                              htmlFor="booking-auth-otp"
                              className="mb-1.5 block text-sm font-semibold"
                            >
                              Verification code
                            </label>
                            <input
                              id="booking-auth-otp"
                              inputMode="numeric"
                              maxLength={10}
                              value={inlineAuthOtp}
                              onChange={(e) => setInlineAuthOtp(e.target.value)}
                              autoComplete="one-time-code"
                              className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base tracking-[0.4em] outline-none ring-ring focus:ring-2"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={inlineAuthBusy}
                          onClick={inlineAuthOtpSent ? verifyInlineAuthOtp : sendInlineAuthOtp}
                          className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime text-base font-bold text-lime-foreground disabled:opacity-60"
                        >
                          {inlineAuthBusy && <Loader2 className="size-4 animate-spin" />}
                          {inlineAuthOtpSent ? "Verify and continue" : "Continue"}
                        </button>
                        {inlineAuthOtpSent && (
                          <button
                            type="button"
                            onClick={() => {
                              setInlineAuthOtpSent(false);
                              setInlineAuthOtp("");
                            }}
                            className="w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4"
                          >
                            Use a different number
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div>
                          <label
                            htmlFor="booking-auth-email"
                            className="mb-1.5 block text-sm font-semibold"
                          >
                            Email address
                          </label>
                          <input
                            id="booking-auth-email"
                            type="email"
                            value={inlineAuthEmail}
                            onChange={(e) => setInlineAuthEmail(e.target.value)}
                            autoComplete="email"
                            disabled={inlineAuthEmailOtpSent || inlineAuthBusy}
                            className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2 disabled:opacity-60"
                          />
                        </div>
                        {inlineAuthEmailOtpSent && (
                          <div>
                            <label
                              htmlFor="booking-auth-email-otp"
                              className="mb-1.5 block text-sm font-semibold"
                            >
                              Verification code
                            </label>
                            <input
                              id="booking-auth-email-otp"
                              inputMode="numeric"
                              maxLength={10}
                              value={inlineAuthOtp}
                              onChange={(e) => setInlineAuthOtp(e.target.value)}
                              autoComplete="one-time-code"
                              className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base tracking-[0.4em] outline-none ring-ring focus:ring-2"
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={inlineAuthBusy}
                          onClick={
                            inlineAuthEmailOtpSent
                              ? verifyInlineAuthEmailOtp
                              : sendInlineAuthEmailOtp
                          }
                          className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-lime text-base font-bold text-lime-foreground disabled:opacity-60"
                        >
                          {inlineAuthBusy && <Loader2 className="size-4 animate-spin" />}
                          {inlineAuthEmailOtpSent ? "Verify and continue" : "Continue"}
                        </button>
                        {inlineAuthEmailOtpSent && (
                          <button
                            type="button"
                            onClick={() => {
                              setInlineAuthEmailOtpSent(false);
                              setInlineAuthOtp("");
                            }}
                            className="w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4"
                          >
                            Use a different email
                          </button>
                        )}
                      </>
                    )}

                    {!inlineAuthOtpSent && !inlineAuthEmailOtpSent && (
                      <>
                        <p className="text-center text-sm">
                          <button
                            type="button"
                            onClick={() =>
                              setInlineAuthMethod(inlineAuthMethod === "phone" ? "email" : "phone")
                            }
                            className="font-semibold text-muted-foreground underline underline-offset-4"
                          >
                            {inlineAuthMethod === "phone"
                              ? "Continue with email"
                              : "Continue with phone"}
                          </button>
                        </p>

                        <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                          <span className="h-px flex-1 bg-border" />
                          or
                          <span className="h-px flex-1 bg-border" />
                        </div>

                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => inlineOAuth("google")}
                            disabled={inlineAuthBusy}
                            className="press flex min-h-12 w-full items-center gap-3 rounded-2xl glass-soft px-4 text-base font-semibold disabled:opacity-60"
                          >
                            <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                              <path
                                fill="#FFC107"
                                d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                              />
                              <path
                                fill="#FF3D00"
                                d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
                              />
                              <path
                                fill="#4CAF50"
                                d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                              />
                              <path
                                fill="#1976D2"
                                d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                              />
                            </svg>
                            Continue with Google
                          </button>
                          <button
                            type="button"
                            onClick={() => inlineOAuth("apple")}
                            disabled={inlineAuthBusy}
                            className="press flex min-h-12 w-full items-center gap-3 rounded-2xl glass-soft px-4 text-base font-semibold disabled:opacity-60"
                          >
                            <Apple className="size-4 shrink-0" />
                            Continue with Apple
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Step 6 — payment method. "Pay at salon" is the only option that actually
                collects anything today; no online payment gateway is wired up yet (see
                DALLTY_FINANCIAL_ARCHITECTURE.md). A business's deposit setting, if any, is
                shown as information only — the amount actually due is always resolved
                server-side at confirm time, never trusted from here. */}
            {step === 5 && (
              <section className="mt-7 animate-fade-up">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div>
                    <h2 className="text-2xl font-extrabold">Payment</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      How you'll pay for this appointment.
                    </p>
                  </div>
                  <HoldCountdown phase={bookingPhase} secondsLeft={holdSecondsLeft} tb={tb} />
                </div>

                {bookingPhase === "hold_expired" && (
                  <div className="mt-5 space-y-3 rounded-3xl bg-destructive/10 p-5 text-center">
                    <p className="text-sm font-semibold text-destructive">
                      {bookingErrorMessage("HOLD_EXPIRED", tb)}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        resetHold();
                        setSlot(null);
                        setStep(3);
                      }}
                      className="press min-h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                    >
                      {tb("hold.pick_new_time")}
                    </button>
                  </div>
                )}

                <div
                  className={`mt-5 rounded-3xl glass p-6 ${bookingPhase === "hold_expired" ? "hidden" : ""}`}
                >
                  <p className="text-sm font-bold text-muted-foreground">Payment method</p>
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-(image:--gradient-lime) p-4 shadow-(--shadow-glow-lime)">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime-foreground/15 text-lime-foreground">
                        <Wallet className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-lime-foreground">Pay at salon</p>
                        <p className="text-xs font-semibold text-lime-foreground/80">
                          Nothing to pay right now
                        </p>
                      </div>
                    </div>
                    <div className="grid size-7 shrink-0 place-items-center rounded-full bg-lime-foreground text-lime">
                      <Check className="size-4" strokeWidth={3} />
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Total due at salon
                    </span>
                    <span className="text-lg font-extrabold">
                      {formatMoney(promo ? promo.final : basePrice, currency, lang)}
                    </span>
                  </div>

                  {business?.require_deposit && Number(business.deposit_percent) > 0 && (
                    <div className="mt-4 flex items-start gap-2.5 rounded-2xl bg-gold/10 p-3.5">
                      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-gold" />
                      <p className="text-xs font-semibold text-foreground/80">
                        This shop requires a {business.deposit_percent}% deposit (about{" "}
                        {formatMoney(
                          ((promo ? promo.final : basePrice) * Number(business.deposit_percent)) /
                            100,
                          currency,
                          lang,
                        )}
                        ), collected in person. The exact amount is confirmed at the salon.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Step 7 — booking confirmation */}
            {step === 6 && (
              <section className="mt-7 animate-fade-up">
                {!bookingResult ? (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                      <h2 className="text-2xl font-extrabold">Confirm your booking</h2>
                      <HoldCountdown phase={bookingPhase} secondsLeft={holdSecondsLeft} tb={tb} />
                    </div>
                    {bookingPhase === "hold_expired" && (
                      <div className="mt-4 space-y-3 rounded-3xl bg-destructive/10 p-5 text-center">
                        <p className="text-sm font-semibold text-destructive">
                          {bookingErrorMessage("HOLD_EXPIRED", tb)}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            resetHold();
                            setSlot(null);
                            setStep(3);
                          }}
                          className="press min-h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                        >
                          {tb("hold.pick_new_time")}
                        </button>
                      </div>
                    )}
                    {bookingPhase === "error" && (
                      <div className="mt-4 space-y-3 rounded-3xl bg-destructive/10 p-5 text-center">
                        <p className="text-sm font-semibold text-destructive">
                          {bookingErrorMessage(bookingErrorCode ?? "", tb)}
                        </p>
                        <button
                          type="button"
                          onClick={() => confirmBooking.mutate()}
                          className="press min-h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                        >
                          {tb("hold.try_again")}
                        </button>
                      </div>
                    )}
                    {bookingPhase === "account_blocked" && (
                      <div className="mt-4 space-y-3 rounded-3xl bg-destructive/10 p-5 text-center">
                        <p className="text-sm font-semibold text-destructive">
                          {bookingErrorMessage("CUSTOMER_ACCOUNT_REQUIRED", tb)}
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            await supabase.auth.signOut();
                            // The existing hold was created under the now-signed-out
                            // (privileged) identity, so it can't be confirmed as-is --
                            // release it and send the customer back to pick a fresh slot,
                            // which will correctly ask them to sign in with a real customer
                            // account this time.
                            resetHold();
                            setBookingErrorCode(null);
                            setStep(3);
                          }}
                          className="press min-h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                        >
                          {tb("hold.sign_out_continue_as_customer")}
                        </button>
                      </div>
                    )}
                    <div className="mt-5 space-y-3 rounded-3xl glass p-6">
                      <Row label="Business" value={business?.name ?? ""} />
                      <Row
                        label="Service"
                        value={service ? `${service.name} · ${service.duration_minutes} min` : ""}
                      />
                      <Row label="Specialist" value={staffMember?.full_name ?? ""} />
                      <Row
                        label="When"
                        value={
                          slot
                            ? formatInTimezone(
                                slot,
                                businessTz,
                                {
                                  weekday: "long",
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                },
                                lang,
                              )
                            : ""
                        }
                        icon={<CalendarDays className="size-4" />}
                      />
                      <div className="mt-4 space-y-2 border-t border-border pt-4">
                        {promo && (
                          <>
                            <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                              <span>Original price</span>
                              <span>{formatMoney(basePrice, currency, lang)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm font-bold text-primary">
                              <span>Discount ({promo.code})</span>
                              <span>-{formatMoney(promo.discount, currency, lang)}</span>
                            </div>
                          </>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-muted-foreground">
                            {promo ? "Final price" : "Total"}
                          </span>
                          <span className="text-2xl font-extrabold">
                            {formatMoney(promo ? promo.final : basePrice, currency, lang)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-3xl glass-soft p-4">
                      <label htmlFor="coupon" className="text-sm font-bold">
                        Coupon code{" "}
                        <span className="font-semibold text-muted-foreground">(optional)</span>
                      </label>
                      <div className="mt-2 flex gap-2">
                        <input
                          id="coupon"
                          value={coupon}
                          onChange={(e) => {
                            setCoupon(e.target.value);
                            setPromo(null);
                            setCouponError(null);
                          }}
                          placeholder="Enter code"
                          autoComplete="off"
                          className="min-h-12 min-w-0 flex-1 rounded-2xl bg-card/70 px-4 text-sm font-semibold uppercase outline-none"
                        />
                        <button
                          type="button"
                          disabled={!coupon.trim() || applyCoupon.isPending}
                          onClick={() => applyCoupon.mutate()}
                          className="press min-h-12 shrink-0 rounded-2xl bg-secondary px-5 text-sm font-bold disabled:opacity-50"
                        >
                          {applyCoupon.isPending ? "Checking…" : promo ? "Applied" : "Apply"}
                        </button>
                      </div>
                      {couponError && (
                        <p className="mt-2 text-xs font-semibold text-destructive">{couponError}</p>
                      )}
                      {promo && (
                        <p className="mt-2 text-xs font-semibold text-primary">
                          {promo.code} applied — you save{" "}
                          {formatMoney(promo.discount, currency, lang)}.
                        </p>
                      )}
                    </div>
                  </>
                ) : null}
              </section>
            )}
          </>
        )}
      </main>

      {/* Sticky action bar — hidden once the full-screen success takeover fires */}
      {tab === "book" && !bookingResult && (branchId || !needsBranchChoice) && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-3xl glass p-3">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="min-h-12 shrink-0 rounded-2xl glass-soft px-5 text-sm font-semibold"
              >
                Back
              </button>
            )}
            {step < 6 ? (
              <button
                type="button"
                disabled={!canContinue}
                onClick={next}
                className="press min-h-12 flex-1 rounded-2xl bg-lime text-base font-bold text-lime-foreground disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  confirmBooking.isPending || bookingPhase !== "held" || !phoneReady || !nameReady
                }
                onClick={() => confirmBooking.mutate()}
                className="press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-lime text-base font-bold text-lime-foreground disabled:opacity-60"
              >
                {confirmBooking.isPending ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Check className="size-5" />
                )}
                Confirm booking
              </button>
            )}
          </div>
        </div>
      )}

      {tab !== "book" && (
        <BottomNav
          tabs={[
            t("nav.home"),
            t("nav.search"),
            t("nav.bookings"),
            t("nav.favorites"),
            t("nav.profile"),
          ]}
        />
      )}
    </div>
  );
}

/**
 * Visible countdown of the server-issued hold's remaining time. Purely informational — the
 * server re-checks hold_expires_at itself at confirm time regardless of what this shows, so a
 * clock skew or a paused tab never lets a customer confirm past the real deadline.
 */
function HoldCountdown({
  phase,
  secondsLeft,
  tb,
}: {
  phase:
    | "idle"
    | "holding"
    | "held"
    | "confirming"
    | "success"
    | "hold_expired"
    | "slot_unavailable"
    | "account_blocked"
    | "error";
  secondsLeft: number;
  tb: (key: NamespaceKeyMap["booking"], vars?: Record<string, string | number>) => string;
}) {
  if (phase !== "held" && phase !== "confirming") return null;
  const urgent = secondsLeft <= 60;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  return (
    <span
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums ${
        urgent ? "bg-destructive/15 text-destructive" : "glass-soft"
      }`}
      role="timer"
      aria-live="polite"
    >
      <Clock className="size-3.5" />
      {tb("hold.countdown", { mm, ss })}
    </span>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        {icon ?? <Clock className="size-4" />}
        {label}
      </span>
      <span className="text-end text-sm font-bold">{value}</span>
    </div>
  );
}
