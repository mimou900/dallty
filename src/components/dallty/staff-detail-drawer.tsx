import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Clock,
  Facebook,
  Globe,
  Instagram,
  Languages,
  Loader2,
  Share2,
  Sparkles,
  Star,
  Twitter,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { formatMoney } from "@/lib/countries";

type StaffProfile = {
  id: string;
  full_name: string;
  title: string;
  avatar_url: string | null;
  bio: string | null;
  experience_years: number | null;
  certificates: string[];
  languages: string[];
  portfolio: string[];
  social_links: Record<string, string> | null;
};

type ServiceRow = {
  id: string;
  name: string;
  duration_minutes: number;
  price: number | string;
  discount_price: number | string | null;
};

type Review = {
  id: string;
  rating: number;
  body: string;
  created_at: string;
};

const SOCIAL_ICON: Record<string, typeof Instagram> = {
  instagram: Instagram,
  facebook: Facebook,
  twitter: Twitter,
};

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "services", label: "Services" },
  { id: "portfolio", label: "Portfolio" },
  { id: "reviews", label: "Reviews" },
] as const;

/**
 * Specialist profile drawer. Second pass after direct feedback on the first tabbed version:
 * - One continuous scrollable page, not tab-gated content — the pill row is scroll-spy
 *   navigation (jump to a section) exactly like business-profile-nav.tsx on the main
 *   Business Profile page, not a switch that hides the other three sections.
 * - One unified compact header (small avatar left, name+title right, share+close far right)
 *   used at all times — no separate big centered hero photo.
 * - Solid white throughout, including the header — no tinted/muted background anywhere.
 * - Opens at 92% height (a visible peek of the page behind, the drawer's own normal
 *   "sheet" feel) and expands to true full-screen the moment the content is scrolled, rather
 *   than starting full-screen or never expanding.
 *
 * Data, unchanged from the previous pass:
 * - Services this specialist actually performs come from the already-fetched staff row's
 *   `service_ids` (from `get_business_public_staff`) cross-referenced against the business's
 *   services list, both passed down as props — no second network round-trip.
 * - Reviews are fetched directly filtered by `staff_id` (the `reviews` table is publicly
 *   readable, same pattern business-reviews.tsx uses for business_id).
 * - No "appointments completed / clients served" stat and no "interests" chips: `bookings`
 *   RLS only lets a row's own customer, the business, or an admin read it — there is no
 *   public aggregate a customer browsing this page could see, and "interests" has no backing
 *   column on `staff` at all. Faking either would be inventing data. `experience_years` (real)
 *   stays as the one trust signal next to the name.
 */
export function StaffDetailDrawer({
  staffId,
  serviceIds,
  services,
  currency,
  location,
  onClose,
  onBook,
}: {
  staffId: string | null;
  serviceIds: string[];
  services: ServiceRow[];
  currency: string;
  location: string;
  onClose: () => void;
  onBook: (serviceId: string | null) => void;
}) {
  const [activeSection, setActiveSection] = useState<string>("profile");
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (staffId) {
      setActiveSection("profile");
      setExpanded(false);
    }
  }, [staffId]);

  const profileQuery = useQuery({
    queryKey: ["staff-profile", staffId],
    enabled: Boolean(staffId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select(
          "id, full_name, title, avatar_url, bio, experience_years, certificates, languages, portfolio, social_links",
        )
        .eq("id", staffId!)
        .single();
      if (error) throw error;
      return data as unknown as StaffProfile;
    },
  });

  const reviewsQuery = useQuery({
    queryKey: ["staff-reviews", staffId],
    enabled: Boolean(staffId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id, rating, body, created_at")
        .eq("staff_id", staffId!)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Review[];
    },
  });

  const profile = profileQuery.data;
  const social = Object.entries(profile?.social_links ?? {}).filter(([, url]) => url);
  const myServices = services.filter((s) => serviceIds.includes(s.id));
  const reviews = reviewsQuery.data ?? [];
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (!expanded && el.scrollTop > 4) setExpanded(true);

    const ACTIVATION_LINE = 120;
    let current = SECTIONS[0].id as string;
    for (const s of SECTIONS) {
      const sectionEl = document.getElementById(`staff-${s.id}`);
      if (sectionEl && sectionEl.getBoundingClientRect().top - el.getBoundingClientRect().top <= ACTIVATION_LINE) {
        current = s.id;
      }
    }
    setActiveSection(current);
  }

  function scrollToSection(id: string) {
    const target = document.getElementById(`staff-${id}`);
    const container = scrollRef.current;
    if (!target || !container) return;
    const offset = target.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollBy({ top: offset - 12, behavior: "smooth" });
  }

  async function share() {
    if (!profile) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: profile.full_name, url });
      } catch {
        /* cancelled — not an error */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard unavailable — silently ignore, share is a nice-to-have here */
    }
  }

  return (
    <Drawer open={Boolean(staffId)} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent
        className={`flex flex-col overflow-hidden border-border bg-card p-0 transition-[height,margin-top,border-radius] duration-200 ${
          expanded ? "mt-0 h-dvh rounded-t-none" : "mt-6 h-[92dvh] rounded-t-[2rem]"
        }`}
      >
        <DrawerTitle className="sr-only">{profile?.full_name ?? "Specialist"} profile</DrawerTitle>

        {profileQuery.isLoading || !profile ? (
          <div className="grid h-full place-items-center">
            {profileQuery.isLoading && <Loader2 className="size-6 animate-spin text-primary" />}
          </div>
        ) : (
          <>
            {/* Collapsing header: the big centered photo is what opens first ("the first
                one"); the moment the customer scrolls, it morphs into the compact avatar-left
                bar — the same scroll threshold that also expands the drawer to full-screen
                below, so both happen together as one "you're now browsing" transition. */}
            {expanded ? (
              <div className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="size-12 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-extrabold text-primary">
                    {profile.full_name.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold">{profile.full_name}</p>
                  <p className="truncate text-xs font-semibold text-muted-foreground">
                    {profile.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={share}
                  aria-label="Share this specialist"
                  className="press grid size-9 shrink-0 place-items-center rounded-full bg-muted"
                >
                  <Share2 className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="press grid size-9 shrink-0 place-items-center rounded-full bg-muted"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="shrink-0 bg-muted px-5 pb-5 pt-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={share}
                    aria-label="Share this specialist"
                    className="press grid size-10 place-items-center rounded-full bg-card"
                  >
                    <Share2 className="size-4.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="press grid size-10 place-items-center rounded-full bg-card"
                  >
                    <X className="size-4.5" />
                  </button>
                </div>
                <div className="mt-2 flex flex-col items-center text-center">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name}
                      className="size-32 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid size-32 place-items-center rounded-full bg-(image:--gradient-primary) text-4xl font-extrabold text-primary-foreground">
                      {profile.full_name.slice(0, 1)}
                    </div>
                  )}
                  <h2 className="mt-3 text-2xl font-extrabold">{profile.full_name}</h2>
                  <p className="mt-0.5 text-sm font-semibold text-muted-foreground">
                    {profile.title}
                  </p>
                  {location && <p className="mt-0.5 text-sm text-muted-foreground">{location}</p>}
                  {profile.experience_years != null && (
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lime px-3 py-1 text-xs font-extrabold text-lime-foreground">
                      <Sparkles className="size-3.5" />
                      {profile.experience_years}+{" "}
                      {profile.experience_years === 1 ? "year" : "years"} experience
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Scroll-spy nav — jumps to a section already on the page below, never hides
                the other three (brief: "scrollable... shouldn't have to click on tabs"). */}
            <div
              role="tablist"
              aria-label="Specialist sections"
              className="flex shrink-0 gap-2 overflow-x-auto border-b border-border bg-card px-5 py-3"
            >
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === s.id}
                  onClick={() => scrollToSection(s.id)}
                  className={`press shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    activeSection === s.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-card">
              <div id="staff-profile" className="space-y-6 px-5 py-5">

                {profile.languages?.length > 0 && (
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Languages
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.languages.map((l) => (
                        <span
                          key={l}
                          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-bold"
                        >
                          <Languages className="size-3.5 text-primary" />
                          {l}
                        </span>
                      ))}
                    </div>
                  </section>
                )}

                {profile.bio && (
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      About
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/90">{profile.bio}</p>
                  </section>
                )}

                {profile.certificates?.length > 0 && (
                  <section>
                    <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      <Award className="size-3.5" />
                      Certifications
                    </h3>
                    <ul className="mt-2 space-y-2">
                      {profile.certificates.map((c) => (
                        <li
                          key={c}
                          className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm font-semibold"
                        >
                          <Award className="size-4 shrink-0 text-primary" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {social.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {social.map(([key, url]) => {
                      const Icon = SOCIAL_ICON[key.toLowerCase()] ?? Globe;
                      return (
                        <a
                          key={key}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-bold capitalize"
                        >
                          <Icon className="size-4" />
                          {key}
                        </a>
                      );
                    })}
                  </div>
                )}

                {profile.experience_years == null &&
                  !profile.languages?.length &&
                  !profile.bio &&
                  !profile.certificates?.length &&
                  !social.length && (
                    <p className="text-sm text-muted-foreground">
                      {profile.full_name} hasn't added more details yet.
                    </p>
                  )}
              </div>

              <div id="staff-services" className="scroll-mt-28 border-t border-border px-5 py-5">
                <h3 className="text-lg font-extrabold">Services</h3>
                {myServices.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {profile.full_name} doesn't have any services assigned yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {myServices.map((s) => {
                      const price = Number(s.discount_price ?? s.price);
                      return (
                        <li key={s.id} className="rounded-2xl border border-border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 truncate font-bold">{s.name}</p>
                            <button
                              type="button"
                              onClick={() => onBook(s.id)}
                              className="press shrink-0 rounded-full border border-primary px-4 py-1.5 text-xs font-bold text-primary"
                            >
                              Book
                            </button>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock className="size-3.5" />
                            {s.duration_minutes} min
                          </p>
                          <p className="mt-2 font-extrabold">from {formatMoney(price, currency)}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div id="staff-portfolio" className="scroll-mt-28 border-t border-border px-5 py-5">
                <h3 className="text-lg font-extrabold">Portfolio</h3>
                {profile.portfolio?.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {profile.portfolio.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full rounded-xl object-cover"
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {profile.full_name} doesn't have a portfolio yet.
                  </p>
                )}
              </div>

              <div id="staff-reviews" className="scroll-mt-28 border-t border-border px-5 py-5 pb-28">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-extrabold">Reviews</h3>
                  {reviews.length > 0 && (
                    <span className="flex items-center gap-1 text-sm font-bold">
                      <Star className="size-4 fill-gold text-gold" />
                      {avgRating.toFixed(1)} ({reviews.length})
                    </span>
                  )}
                </div>
                {reviews.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {profile.full_name} doesn't have any reviews yet.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {reviews.map((r) => (
                      <li key={r.id} className="rounded-2xl border border-border p-4">
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`size-3.5 ${
                                n <= r.rating ? "fill-gold text-gold" : "text-border"
                              }`}
                            />
                          ))}
                        </div>
                        {r.body && <p className="mt-2 text-sm leading-relaxed">{r.body}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-card p-4">
              <button
                type="button"
                onClick={() => onBook(null)}
                className="press flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
              >
                Book with {profile.full_name.split(" ")[0]}
              </button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
