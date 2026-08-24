export type Lang = "en" | "fr" | "ar";

export type Business = {
  id: string;
  slug: string;
  image: string;
  en: { name: string; area: string; tags: string };
  ar: { name: string; area: string; tags: string };
  rating: number;
  reviews: number;
  distanceKm: number;
  price: string;
  open: boolean;
  instant: boolean;
  verified?: boolean;
};
