import type { Business } from "@/lib/dallty-content";
import type { BusinessBadge } from "@/components/dallty/business-card";

/** Tone only — not the resolved label — so the section can translate it via
 *  `t(\`badge_${tone.replace("-", "_")}\`)` at render time instead of baking
 *  English text into this fixture module. */
export type TrendingBusiness = Business & { badgeTone: BusinessBadge["tone"] };

/**
 * Temporary fixture data for the "Trending now" homepage section.
 *
 * There is currently no real trending signal anywhere in the schema — no
 * view/booking-velocity counter, nothing the RPC could sort by. Rather than
 * fabricate a "Trending" claim about a REAL business (which would be
 * dishonest — see the Recommended section's "Top rated" badge, which only
 * ever applies to genuinely highest-rated real data), this section uses
 * clearly-fictional sample businesses instead, shaped exactly like the real
 * `Business` type so the section is a drop-in replacement once a real
 * trending signal exists — swap this import for a `useTrendingBusinesses()`
 * hook call, nothing else in the section changes.
 *
 * Images reuse the project's existing local category photos
 * (public/salons/*.jpg) rather than external/generated placeholders.
 */
export const TRENDING_BUSINESSES: TrendingBusiness[] = [
  {
    id: "trending-mock-1",
    slug: "gentlemens-studio",
    image: "/salons/barber.jpg",
    en: { name: "Gentlemen's Studio", area: "Śródmieście, Warszawa", tags: "Barber" },
    ar: { name: "Gentlemen's Studio", area: "Śródmieście, Warszawa", tags: "حلاقة" },
    rating: 4.9,
    reviews: 2154,
    distanceKm: 0,
    price: "$$$",
    open: true,
    instant: false,
    verified: true,
    category: "Barber",
    badgeTone: "trending",
  },
  {
    id: "trending-mock-2",
    slug: "studio-nova",
    image: "/salons/hair.jpg",
    en: { name: "Studio Nova", area: "Wola, Warszawa", tags: "Hair salon" },
    ar: { name: "Studio Nova", area: "Wola, Warszawa", tags: "تصفيف الشعر" },
    rating: 4.8,
    reviews: 1876,
    distanceKm: 0,
    price: "$$",
    open: true,
    instant: true,
    verified: true,
    category: "Hair salon",
    badgeTone: "popular",
  },
  {
    id: "trending-mock-3",
    slug: "pure-harmony-spa",
    image: "/salons/spa.jpg",
    en: { name: "Pure Harmony Spa", area: "Mokotów, Warszawa", tags: "Spa" },
    ar: { name: "Pure Harmony Spa", area: "Mokotów, Warszawa", tags: "سبا" },
    rating: 5.0,
    reviews: 1329,
    distanceKm: 0,
    price: "$$$",
    open: true,
    instant: false,
    verified: true,
    category: "Spa",
    badgeTone: "top-rated",
  },
  {
    id: "trending-mock-4",
    slug: "nailove-studio",
    image: "/salons/nails.jpg",
    en: { name: "Nailove Studio", area: "Praga, Warszawa", tags: "Nail salon" },
    ar: { name: "Nailove Studio", area: "Praga, Warszawa", tags: "مانيكير" },
    rating: 4.9,
    reviews: 986,
    distanceKm: 0,
    price: "$$",
    open: true,
    instant: true,
    verified: false,
    category: "Nail salon",
    badgeTone: "trending",
  },
];
