import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import {
  ArrowLeft,
  BadgeCheck,
  BellRing,
  CalendarDays,
  Check,
  Clock,
  Loader2,
  Star,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";

import { formatMoney, formatInTimezone } from "@/lib/countries";
import { savePendingBooking, readPendingBooking, clearPendingBooking } from "@/lib/pending-booking";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { BottomNav } from "@/components/dallty/bottom-nav";
import { copy } from "@/lib/dallty-content";
import { NavMenu } from "@/components/dallty/site-nav";
import { FavoriteButton } from "@/components/dallty/favorite-button";
import { SalonReviews } from "@/components/dallty/salon-reviews";
import { SalonOverview } from "@/components/dallty/salon-overview";
import {
  AvailabilityCalendar,
  type DayAvailability,
} from "@/components/dallty/availability-calendar";
import { PhoneField, type PhoneFieldValue } from "@/components/dallty/phone-field";
import { guessCountryCode, isValidE164, splitE164, toE164 } from "@/lib/phone";
import { getCountryByCode, getDefaultCountry } from "@/lib/reference-data";
import {
  checkEmailHasAccount,
  createGuestBooking,
  sendGuestAccountInvite,
} from "@/lib/account.functions";

export const Route = createFileRoute("/salon/$salonId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { book?: boolean; tab?: "overview" | "book" | "reviews" } => ({
    book: search.book === true || search.book === "true" ? true : undefined,
    tab:
      search.tab === "overview" || search.tab === "book" || search.tab === "reviews"
        ? search.tab
        : undefined,
  }),
  errorComponent: () => <SalonProblem title="We couldn't load this shop" />,
  notFoundComponent: () => <SalonProblem title="This shop is no longer available" />,
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

const STEPS = ["Service", "Specialist", "Date", "Time", "Your Info", "Confirm"] as const;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "book", label: "Book" },
  { id: "reviews", label: "Reviews" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Shown instead of a blank page when a shop can't be loaded. */
function SalonProblem({ title }: { title: string }) {
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
  const { salonId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();

  const { book: bookIntent, tab: tabParam } = Route.useSearch();
  // Tab lives in the URL so deep links, refreshes and the back button all work.
  const tab: TabId = tabParam ?? (bookIntent ? "book" : "overview");
  const setTab = (id: TabId) =>
    navigate({
      to: "/salon/$salonId",
      params: { salonId },
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

  // Coming back from sign-in: pick the booking up exactly where it was left.
  // Waits for the session to resolve so a refresh mid-flow still auto-confirms.
  useEffect(() => {
    if (authLoading || restored.current) return;
    restored.current = true;
    const pending = readPendingBooking(salonId);
    if (!pending) return;
    if (pending.serviceId) setServiceId(pending.serviceId);
    if (pending.staffId) setStaffId(pending.staffId);
    if (pending.day) setDay(pending.day);
    if (pending.slot) setSlot(pending.slot);
    setTab("book");
    setStep(pending.slot ? 4 : 3);
    const canAutoConfirm = Boolean(pending.autoConfirm && pending.slot && user);
    if (canAutoConfirm) {
      // Keep the intent stored until the booking actually lands, so a refresh
      // during confirmation resumes instead of losing the slot.
      setAutoConfirm(true);
      toast.info("Signed in — confirming your booking…");
    } else {
      clearPendingBooking();
      toast.info("Picked up where you left off — review and confirm.");
    }
  }, [salonId, authLoading, user]);

  function stashBooking() {
    savePendingBooking({
      salonId,
      serviceId,
      staffId,
      day,
      slot,
      step,
      autoConfirm: Boolean(slot && serviceId && staffId && step >= 4),
    });
  }

  // Keep the choice mirrored to storage while signed out, so signing in from
  // anywhere (header, menu, a deep link) still comes back to this exact slot.
  useEffect(() => {
    if (user || authLoading || !restored.current) return;
    if (!serviceId && !staffId && !slot) return;
    stashBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading, salonId, serviceId, staffId, day, slot, step]);

  const salonQuery = useQuery({
    queryKey: ["salon", salonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salons")
        .select(
          "id, owner_id, name, name_ar, description, description_ar, area, area_ar, city, image_url, rating, review_count, price_range, distance_km, opens_at, closes_at, instant_booking, is_active, created_at, amenities, languages, awards, certifications, brands, cancellation_policy, cancellation_policy_ar, house_rules, house_rules_ar, owner_story, owner_story_ar, faq, video_tour_url, instagram_url, tiktok_url, address, status, business_type, website_url, facebook_url, country, district, postal_code, maps_url, employee_count, branch_count, logo_url, cover_url, is_listed, is_verified, country_code, currency, timezone",
        )
        .eq("id", salonId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    // A missing shop should show its own screen straight away, not spin.
    retry: 1,
    staleTime: 60_000,
  });

  const servicesQuery = useQuery({
    queryKey: ["services", salonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("*")
        .eq("salon_id", salonId)
        .eq("is_active", true)
        .order("price");
      if (error) throw error;
      return data;
    },
  });

  const staffQuery = useQuery({
    queryKey: ["staff", salonId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_salon_public_staff", {
        _salon_id: salonId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  /**
   * Open-slot counts for every specialist ↔ service pair over the next two
   * weeks, so we can show what's really bookable instead of an empty time step.
   */
  const availabilityQuery = useQuery({
    queryKey: ["availability-summary", salonId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_salon_availability_summary", {
        _salon_id: salonId,
        _days: 14,
      });
      if (error) throw error;
      return data ?? [];
    },
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

  /** Only specialists who actually perform the chosen service. */
  const eligibleStaff = (staffQuery.data ?? []).filter(
    (m) => !serviceId || (m.service_ids ?? []).includes(serviceId),
  );

  /** Average rating per specialist, for the specialist cards. */
  const staffRatingQuery = useQuery({
    queryKey: ["staff-ratings", salonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("staff_id, rating")
        .eq("salon_id", salonId)
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

  /** First open day per eligible specialist for the chosen service. */
  const nextAvailableQueries = useQueries({
    queries: eligibleStaff.map((m) => ({
      queryKey: ["day-availability", m.id, serviceId],
      enabled: Boolean(serviceId),
      queryFn: async () => {
        const { data, error } = await supabase.rpc("get_staff_day_availability", {
          _staff_id: m.id,
          _service_id: serviceId!,
          _days: 14,
        });
        if (error) throw error;
        return (data ?? []) as DayAvailability[];
      },
    })),
  });

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

  /** Selecting a service resets the specialist, day and time, then advances. */
  function selectService(id: string) {
    setServiceId(id);
    setStaffId(null);
    setSlot(null);
    setStep(1);
  }

  /** Selecting a specialist resets the time, then advances to the date step. */
  function selectStaff(id: string) {
    setStaffId(id);
    setSlot(null);
    setStep(2);
  }

  const slotsQuery = useQuery({
    queryKey: ["slots", staffId, serviceId, day],
    enabled: Boolean(staffId && serviceId && step >= 3),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_available_slots", {
        _staff_id: staffId!,
        _service_id: serviceId!,
        _day: day,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  /**
   * Day-by-day status for the chosen specialist ↔ service, so the calendar can
   * show open / limited / fully booked / closed before a date is tapped.
   * Refetches instantly whenever the specialist or service changes.
   */
  const dayAvailabilityQuery = useQuery({
    queryKey: ["day-availability", staffId, serviceId],
    enabled: Boolean(staffId && serviceId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_staff_day_availability", {
        _staff_id: staffId!,
        _service_id: serviceId!,
        _days: 14,
      });
      if (error) throw error;
      return (data ?? []) as DayAvailability[];
    },
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

  // Real-time availability: any booking change for this salon refreshes open slots.
  useEffect(() => {
    const channel = supabase
      .channel(`bookings-${salonId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `salon_id=eq.${salonId}` },
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
  }, [salonId, queryClient]);

  // Keep a lightweight "recently viewed" trail for signed-in customers.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("recently_viewed")
      .upsert(
        { user_id: user.id, salon_id: salonId, viewed_at: new Date().toISOString() },
        { onConflict: "user_id,salon_id" },
      )
      .then(() => undefined);
  }, [user, salonId]);

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
        .select("id, phone, country_code")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const savedPhone = profileQuery.data?.phone ?? null;
  const needsPhone = Boolean(user) && profileQuery.isSuccess && !isValidE164(savedPhone ?? "");
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
  const phoneReady = !needsPhone || isValidE164(phoneE164);

  // Guest checkout — asked for on step 4 only when signed out. Kept separate
  // from `phone` above (that one feeds the authenticated missing-phone case
  // and updates `profiles`; this one feeds a brand-new booking's own columns).
  const [guestInfo, setGuestInfo] = useState<{
    name: string;
    phone: PhoneFieldValue;
    email: string;
  }>({
    name: "",
    phone: { countryCode: guessCountryCode(), national: "" },
    email: "",
  });
  const guestPhoneE164 = toE164(
    (getCountryByCode(guestInfo.phone.countryCode) ?? getDefaultCountry()).calling_code,
    guestInfo.phone.national,
  );
  const guestInfoReady = guestInfo.name.trim().length > 0 && isValidE164(guestPhoneE164);

  // Post-submit success view (guest path only — signed-in customers keep
  // navigating straight to /bookings like today).
  const [bookingResult, setBookingResult] = useState<{ id: string } | null>(null);
  const [emailAccountCheck, setEmailAccountCheck] = useState<
    "idle" | "checking" | "existing" | "new" | "none"
  >("idle");

  // Step 4 ("Customer Information") is skipped entirely once we already know
  // who's booking — an authenticated user with a phone on file. Every place
  // that sets `step` to 4 (time-slot pick, the sign-in-detour restore, the
  // autoConfirm effect, a manual progress-pill click) keeps working
  // unmodified; this just bounces past it the instant nothing is missing.
  const identityLoading = authLoading || (Boolean(user) && profileQuery.isLoading);
  const identityComplete = Boolean(user) && profileQuery.isSuccess && !needsPhone;
  useEffect(() => {
    if (step !== 4 || identityLoading) return;
    if (identityComplete) setStep(5);
  }, [step, identityLoading, identityComplete]);

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
      const { data, error } = await supabase.rpc("check_promo_code", {
        _salon_id: salonId,
        _code: code,
        _amount: basePrice,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
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

  const createBooking = useMutation({
    mutationFn: async () => {
      if (!service || !staffId || !slot) throw new Error("Booking is incomplete");
      if (user) {
        if (needsPhone) {
          if (!isValidE164(phoneE164)) throw new Error("Add a valid phone number to confirm");
          const { error: profileError } = await supabase
            .from("profiles")
            .update({ phone: phoneE164, country_code: phone.countryCode })
            .eq("id", user.id);
          if (profileError) throw profileError;
        }
        const starts = new Date(slot);
        const ends = new Date(starts.getTime() + service.duration_minutes * 60_000);
        const { data, error } = await supabase
          .from("bookings")
          .insert({
            customer_id: user.id,
            salon_id: salonId,
            service_id: service.id,
            staff_id: staffId,
            starts_at: starts.toISOString(),
            ends_at: ends.toISOString(),
            total_price: promo ? promo.final : basePrice,
            original_price: promo ? basePrice : null,
            discount_amount: promo ? promo.discount : 0,
            promotion_id: promo ? promo.id : null,
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
      // Guest checkout — no session at all, created server-side.
      if (!guestInfoReady) throw new Error("Add your name and phone number to confirm");
      return await createGuestBooking({
        data: {
          salonId,
          serviceId: service.id,
          staffId,
          slot,
          name: guestInfo.name.trim(),
          phone: guestPhoneE164,
          email: guestInfo.email.trim() || undefined,
          couponCode: promo ? coupon.trim() : undefined,
        },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      queryClient.invalidateQueries({ queryKey: ["availability-summary"] });
      queryClient.invalidateQueries({ queryKey: ["day-availability"] });
      clearPendingBooking();
      setAutoConfirm(false);
      if (user) {
        // Unchanged existing behavior for signed-in customers.
        queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
        queryClient.invalidateQueries({ queryKey: ["booking-profile"] });
        toast.success("Booking confirmed — see you soon!");
        navigate({ to: "/bookings" });
        return;
      }
      // Guest: stay on step 5 and show the success card instead of navigating
      // (there's no /bookings to send a guest to — it's auth-guarded).
      setBookingResult({ id: data.id });
      const email = guestInfo.email.trim();
      if (!email) {
        setEmailAccountCheck("none");
        return;
      }
      setEmailAccountCheck("checking");
      checkEmailHasAccount({ data: { email } })
        .then(({ exists }) => {
          setEmailAccountCheck(exists ? "existing" : "new");
          if (!exists) {
            sendGuestAccountInvite({ data: { email, fullName: guestInfo.name.trim() } }).catch(
              () => {},
            );
          }
        })
        .catch(() => setEmailAccountCheck("none"));
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Booking failed";
      toast.error(
        message.includes("duplicate") ? "That slot was just taken. Pick another time." : message,
      );
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      // Don't retry the same failed intent on the next visit.
      clearPendingBooking();
      setAutoConfirm(false);
      setStep(3);
    },
  });

  // Finish the booking the customer started before the sign-in detour.
  useEffect(() => {
    if (!autoConfirm || !user || !service || !staffId || !slot) return;
    if (createBooking.isPending || createBooking.isSuccess) return;
    if (!profileQuery.isSuccess) return;
    if (needsPhone) {
      // Stop and ask for the missing number instead of failing the booking.
      setAutoConfirm(false);
      clearPendingBooking();
      setStep(4);
      toast.info("Add your phone number to finish the booking.");
      return;
    }
    setAutoConfirm(false);
    createBooking.mutate();
  }, [
    autoConfirm,
    user,
    service,
    staffId,
    slot,
    createBooking,
    needsPhone,
    profileQuery.isSuccess,
  ]);

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
      const { error } = await supabase.from("waitlist_entries").insert({
        customer_id: user.id,
        salon_id: salonId,
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
    Boolean(slot),
    user ? phoneReady : guestInfoReady,
    true,
  ][step];

  function next() {
    if (step < 5) setStep(step + 1);
  }

  const salon = salonQuery.data;
  // Prices and times always follow the business's own country settings.
  const currency = salon?.currency ?? "AED";
  const salonTz = salon?.timezone ?? undefined;

  // Never leave a blank page: a missing or failed shop gets its own screen.
  if (salonQuery.isError) {
    return <SalonProblem title="We couldn't load this shop" />;
  }
  if (salonQuery.isSuccess && !salon) {
    return <SalonProblem title="This shop is no longer available" />;
  }

  return (
    <div className="relative min-h-dvh pb-32">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 start-[-10%] size-[34rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-0 end-[-10%] size-[30rem] rounded-full bg-gold/15 blur-3xl" />
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
              <span className="truncate">{salon?.name ?? "Loading…"}</span>
              {salon?.is_verified ? (
                <BadgeCheck className="size-4 shrink-0 text-gold" aria-label="Verified by Dallty" />
              ) : null}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {salon ? `${salon.area} · ${salon.city}` : ""}
            </p>
          </div>

          {salon && (
            <span className="ms-auto flex shrink-0 items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold">
              <Star className="size-4 fill-gold text-gold" />
              {Number(salon.rating).toFixed(1)}
            </span>
          )}
          {salon && user && <FavoriteButton kind="salon" targetId={salon.id} label={salon.name} />}
          <NavMenu />
        </div>

        <div
          role="tablist"
          aria-label="Salon sections"
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
        {salonQuery.isLoading && (
          <div className="mt-6 space-y-3" aria-busy="true">
            <div className="h-44 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            <div className="h-24 animate-pulse rounded-3xl bg-muted" />
          </div>
        )}
        {tab === "overview" && salon && (
          <SalonOverview
            salon={salon as never}
            services={(servicesQuery.data ?? []) as never}
            staffCount={(staffQuery.data ?? []).length}
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
        {tab === "reviews" && salon && (
          <SalonReviews salonId={salon.id} isOwner={salon.owner_id === user?.id} />
        )}

        {tab === "book" && (
          <>
            {/* Progress */}
            <ol className="mt-6 grid grid-cols-6 gap-1.5">
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
                          {formatMoney(s.discount_price ?? s.price, currency)}
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
                        search={{ next: `/salon/${salonId}` }}
                        className="press inline-flex min-h-12 items-center rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                      >
                        Sign in to join the waitlist
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {slotsQuery.data?.map((s) => {
                      const active = slot === s.slot;
                      return (
                        <button
                          key={s.slot}
                          type="button"
                          disabled={!s.available}
                          onClick={() => {
                            setSlot(s.slot);
                            setStep(4);
                          }}
                          aria-pressed={active}
                          className={`min-h-12 rounded-2xl text-sm font-bold transition-colors ${
                            active
                              ? "bg-primary text-primary-foreground"
                              : s.available
                                ? "glass"
                                : "bg-muted text-muted-foreground line-through"
                          }`}
                        >
                          {formatInTimezone(s.slot, salonTz, {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
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
                <h2 className="text-2xl font-extrabold">Your information</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {user
                    ? "Just need a bit more to confirm your appointment."
                    : "So the shop knows who's booking."}
                </p>

                {identityLoading ? (
                  <div className="mt-5 h-32 animate-pulse rounded-3xl bg-muted" />
                ) : user ? (
                  needsPhone && (
                    <div className="mt-5 rounded-3xl glass p-6">
                      <p className="mb-3 text-sm font-semibold">
                        Add a phone number so the shop can reach you about this appointment.
                      </p>
                      <PhoneField
                        id="booking-phone"
                        value={phone}
                        onChange={setPhone}
                        label="Phone number"
                        required
                      />
                    </div>
                  )
                ) : (
                  <div className="mt-5 space-y-4 rounded-3xl glass p-6">
                    <div>
                      <label htmlFor="guest-name" className="mb-1.5 block text-sm font-semibold">
                        Full name<span className="text-destructive"> *</span>
                      </label>
                      <input
                        id="guest-name"
                        value={guestInfo.name}
                        onChange={(e) => setGuestInfo((g) => ({ ...g, name: e.target.value }))}
                        autoComplete="name"
                        className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
                      />
                    </div>
                    <PhoneField
                      id="guest-phone"
                      value={guestInfo.phone}
                      onChange={(next) => setGuestInfo((g) => ({ ...g, phone: next }))}
                      label="Phone number"
                      required
                    />
                    <div>
                      <label htmlFor="guest-email" className="mb-1.5 block text-sm font-semibold">
                        Email{" "}
                        <span className="font-semibold text-muted-foreground">(optional)</span>
                      </label>
                      <input
                        id="guest-email"
                        type="email"
                        value={guestInfo.email}
                        onChange={(e) => setGuestInfo((g) => ({ ...g, email: e.target.value }))}
                        autoComplete="email"
                        className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Already have an account?{" "}
                      <Link
                        to="/auth"
                        onClick={stashBooking}
                        search={{ next: `/salon/${salonId}` }}
                        className="font-semibold text-foreground underline underline-offset-4"
                      >
                        Sign in instead
                      </Link>
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Step 6 — booking confirmation */}
            {step === 5 && (
              <section className="mt-7 animate-fade-up">
                {!bookingResult ? (
                  <>
                    <h2 className="text-2xl font-extrabold">Confirm your booking</h2>
                    <div className="mt-5 space-y-3 rounded-3xl glass p-6">
                      <Row label="Salon" value={salon?.name ?? ""} />
                      <Row
                        label="Service"
                        value={service ? `${service.name} · ${service.duration_minutes} min` : ""}
                      />
                      <Row label="Specialist" value={staffMember?.full_name ?? ""} />
                      <Row
                        label="When"
                        value={
                          slot
                            ? formatInTimezone(slot, salonTz, {
                                weekday: "long",
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })
                            : ""
                        }
                        icon={<CalendarDays className="size-4" />}
                      />
                      <div className="mt-4 space-y-2 border-t border-border pt-4">
                        {promo && (
                          <>
                            <div className="flex items-center justify-between text-sm font-semibold text-muted-foreground">
                              <span>Original price</span>
                              <span>{formatMoney(basePrice, currency)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm font-bold text-primary">
                              <span>Discount ({promo.code})</span>
                              <span>-{formatMoney(promo.discount, currency)}</span>
                            </div>
                          </>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-muted-foreground">
                            {promo ? "Final price" : "Total"}
                          </span>
                          <span className="text-2xl font-extrabold">
                            {formatMoney(promo ? promo.final : basePrice, currency)}
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
                          {promo.code} applied — you save {formatMoney(promo.discount, currency)}.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-3xl glass p-6 text-center">
                    <p className="text-2xl font-extrabold">🎉 Your booking has been confirmed.</p>

                    {emailAccountCheck === "checking" && (
                      <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Checking your details…
                      </p>
                    )}

                    {emailAccountCheck === "existing" && (
                      <div className="mt-5">
                        <p className="text-sm font-bold">
                          We found an existing Dallty account with this email.
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Log in to track your bookings, manage appointments, and earn loyalty
                          points.
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                          <Link
                            to="/auth"
                            search={{
                              mode: "signin",
                              email: guestInfo.email.trim(),
                              next: "/bookings",
                            }}
                            className="press inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground sm:flex-none"
                          >
                            Log In
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                to: "/salon/$salonId",
                                params: { salonId },
                                search: { tab: "overview" },
                              })
                            }
                            className="press min-h-12 flex-1 rounded-2xl glass-soft px-6 text-sm font-bold sm:flex-none"
                          >
                            Maybe Later
                          </button>
                        </div>
                      </div>
                    )}

                    {emailAccountCheck === "new" && (
                      <div className="mt-5">
                        <p className="text-sm font-bold">
                          We've sent you an email to create your Dallty account.
                        </p>
                        <ul className="mx-auto mt-3 max-w-xs space-y-1.5 text-start text-sm text-muted-foreground">
                          <li>• Track your bookings</li>
                          <li>• Earn loyalty points</li>
                          <li>• Book faster next time</li>
                          <li>• Receive appointment reminders</li>
                          <li>• Access exclusive offers</li>
                        </ul>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                          <Link
                            to="/auth"
                            search={{
                              mode: "signup",
                              email: guestInfo.email.trim(),
                              next: "/bookings",
                            }}
                            className="press inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground sm:flex-none"
                          >
                            Create Account
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                to: "/salon/$salonId",
                                params: { salonId },
                                search: { tab: "overview" },
                              })
                            }
                            className="press min-h-12 flex-1 rounded-2xl glass-soft px-6 text-sm font-bold sm:flex-none"
                          >
                            Maybe Later
                          </button>
                        </div>
                      </div>
                    )}

                    {emailAccountCheck === "none" && (
                      <div className="mt-5">
                        <p className="text-sm text-muted-foreground">
                          Create a free Dallty account to track your bookings, receive reminders,
                          and earn loyalty points.
                        </p>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                          <Link
                            to="/auth"
                            search={{ mode: "signup", next: "/bookings" }}
                            className="press inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground sm:flex-none"
                          >
                            Create Account
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              navigate({
                                to: "/salon/$salonId",
                                params: { salonId },
                                search: { tab: "overview" },
                              })
                            }
                            className="press min-h-12 flex-1 rounded-2xl glass-soft px-6 text-sm font-bold sm:flex-none"
                          >
                            Maybe Later
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Sticky action bar — hidden once the success card takes over on step 6 */}
      {tab === "book" && !bookingResult && (
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
            {step < 5 ? (
              <button
                type="button"
                disabled={!canContinue}
                onClick={next}
                className="press min-h-12 flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                disabled={createBooking.isPending || (user ? !phoneReady : !guestInfoReady)}
                onClick={() => createBooking.mutate()}
                className="press flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
              >
                {createBooking.isPending ? (
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

      {tab !== "book" && <BottomNav tabs={copy.en.tabs} />}
    </div>
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
