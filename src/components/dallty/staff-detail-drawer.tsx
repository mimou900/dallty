import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Clock,
  Facebook,
  Globe,
  Instagram,
  Languages,
  Loader2,
  MapPin,
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

const TABS = [
  { id: "profile", label: "Profile" },
  { id: "services", label: "Services" },
  { id: "portfolio", label: "Portfolio" },
  { id: "reviews", label: "Reviews" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/**
 * Specialist profile drawer — rebuilt to match a reference screenshot directly (tabbed
 * Profile/Services/Portfolio/Reviews, big photo hero only on the Profile tab, a compact
 * avatar+name header on the other three, a persistent bottom Book button). Only real Dallty
 * data is shown:
 *
 * - Services this specialist actually performs come from the already-fetched staff row's
 *   `service_ids` (from `get_business_public_staff`), cross-referenced against the business's
 *   own services list — both already fetched by the route, passed down as props here instead
 *   of a second network round-trip.
 * - Reviews are fetched directly filtered by `staff_id` — the `reviews` table is publicly
 *   readable (same pattern business-reviews.tsx already uses for business_id).
 * - The reference's "Rendez-vous terminés / Clients servis" stat row is intentionally NOT
 *   reproduced: `bookings` RLS only allows a row's own customer, the business owner/staff, or
 *   an admin to read it (`Read own or managed bookings`) — there is no public aggregate a
 *   customer browsing this page could actually see, and a real Dallty stat here would need a
 *   new SECURITY DEFINER RPC (a backend change, out of scope for this UI pass). Faking a count
 *   would violate "never invent data" more directly than just not showing the row. Kept
 *   `experience_years` instead, right under the name, as the one real trust signal already in
 *   the schema.
 * - "Centres d'intérêt" (interests) has no backing column on `staff` at all — omitted rather
 *   than invented.
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
  const [tab, setTab] = useState<TabId>("profile");
  useEffect(() => {
    if (staffId) setTab("profile");
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
      <DrawerContent className="mt-6 flex h-[92dvh] flex-col overflow-hidden rounded-t-[2rem] border-border bg-background p-0">
        <DrawerTitle className="sr-only">{profile?.full_name ?? "Specialist"} profile</DrawerTitle>

        {profileQuery.isLoading || !profile ? (
          <div className="grid h-full place-items-center">
            {profileQuery.isLoading && <Loader2 className="size-6 animate-spin text-primary" />}
          </div>
        ) : (
          <>
            {tab === "profile" ? (
              <div className="relative shrink-0 bg-muted px-5 pb-5 pt-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={share}
                    aria-label="Share this specialist"
                    className="press grid size-10 place-items-center rounded-full bg-background"
                  >
                    <Share2 className="size-4.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="press grid size-10 place-items-center rounded-full bg-background"
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
                  <p className="mt-0.5 text-sm font-semibold text-muted-foreground">{profile.title}</p>
                  {location && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {location}
                    </p>
                  )}
                  {profile.experience_years != null && (
                    <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-lime px-3 py-1 text-xs font-extrabold text-lime-foreground">
                      <Sparkles className="size-3.5" />
                      {profile.experience_years}+{" "}
                      {profile.experience_years === 1 ? "year" : "years"} experience
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-5 py-3">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name}
                    className="size-10 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-extrabold text-primary">
                    {profile.full_name.slice(0, 1)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{profile.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{profile.title}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="press grid size-9 shrink-0 place-items-center rounded-full bg-muted"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div
              role="tablist"
              aria-label="Specialist sections"
              className="flex shrink-0 gap-2 overflow-x-auto border-b border-border px-5 py-3"
            >
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`press shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                    tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5 pb-24">
              {tab === "profile" && (
                <div className="space-y-6">
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

                  {!profile.languages?.length &&
                    !profile.bio &&
                    !profile.certificates?.length &&
                    !social.length && (
                      <p className="text-sm text-muted-foreground">
                        {profile.full_name} hasn't added more details yet.
                      </p>
                    )}
                </div>
              )}

              {tab === "services" && (
                <div>
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
              )}

              {tab === "portfolio" && (
                <div>
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
              )}

              {tab === "reviews" && (
                <div>
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
              )}
            </div>

            <div className="shrink-0 border-t border-border bg-background p-4">
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
