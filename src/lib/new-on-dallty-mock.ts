import type { Business } from "@/lib/dallty-content";

/**
 * Temporary fixture data for the "New on Dallty" homepage section — same
 * rationale as `trending-mock.ts`: no real `created_at`/listing-date signal
 * is exposed by the search RPC yet, so this uses clearly-fictional sample
 * businesses shaped like the real `Business` type rather than mislabeling
 * real listings as "new". Swap this import for a real `useNewBusinesses()`
 * hook once the RPC returns a real signal to sort on — nothing else in the
 * section changes.
 *
 * Images reuse the project's existing local category photos
 * (public/salons/*.jpg). Three map cleanly (hair/nails/spa→massage); there is
 * no dedicated "skin care clinic" photo in the asset set, so SkinGlow Clinic
 * borrows the barber photo as a placeholder — a real image is needed here
 * before this fixture is used as anything but a layout preview.
 */
export const NEW_ON_DALLTY_BUSINESSES: Business[] = [
  {
    id: "new-mock-1",
    slug: "lumiere-hair-studio",
    image: "/salons/hair.jpg",
    en: { name: "Lumière Hair Studio", area: "Žalgirio g., Klaipėda", tags: "Hair salon" },
    ar: { name: "Lumière Hair Studio", area: "Žalgirio g., Klaipėda", tags: "تصفيف الشعر" },
    rating: 4.8,
    reviews: 128,
    distanceKm: 0,
    price: "$$",
    open: true,
    instant: true,
    verified: false,
    category: "Hair salon",
  },
  {
    id: "new-mock-2",
    slug: "the-nail-atelier",
    image: "/salons/nails.jpg",
    en: { name: "The Nail Atelier", area: "Herkaus Manto g., Klaipėda", tags: "Nail salon" },
    ar: { name: "The Nail Atelier", area: "Herkaus Manto g., Klaipėda", tags: "مانيكير" },
    rating: 4.9,
    reviews: 86,
    distanceKm: 0,
    price: "$$",
    open: true,
    instant: false,
    verified: false,
    category: "Nail salon",
  },
  {
    id: "new-mock-3",
    slug: "zen-touch-massage",
    image: "/salons/spa.jpg",
    en: { name: "Zen Touch Massage", area: "Debreceno g., Klaipėda", tags: "Massage" },
    ar: { name: "Zen Touch Massage", area: "Debreceno g., Klaipėda", tags: "مساج" },
    rating: 5.0,
    reviews: 64,
    distanceKm: 0,
    price: "$$$",
    open: true,
    instant: true,
    verified: false,
    category: "Massage",
  },
  {
    id: "new-mock-4",
    slug: "skinglow-clinic",
    image: "/salons/barber.jpg",
    en: { name: "SkinGlow Clinic", area: "Taikos pr., Klaipėda", tags: "Skin care" },
    ar: { name: "SkinGlow Clinic", area: "Taikos pr., Klaipėda", tags: "العناية بالبشرة" },
    rating: 4.9,
    reviews: 37,
    distanceKm: 0,
    price: "$$$",
    open: true,
    instant: false,
    verified: false,
    category: "Skin care",
  },
];
