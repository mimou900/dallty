import hair from "@/assets/salon-hair.jpg";
import barber from "@/assets/salon-barber.jpg";
import nails from "@/assets/salon-nails.jpg";
import spa from "@/assets/salon-spa.jpg";

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
};

export const businesses: Business[] = [
  {
    id: "1",
    slug: "maison-vert",
    image: hair,
    en: { name: "Maison Vert", area: "Al Olaya", tags: "Hair · Color · Keratin" },
    ar: { name: "ميزون فير", area: "العليا", tags: "شعر · صبغة · كيراتين" },
    rating: 4.9,
    reviews: 812,
    distanceKm: 1.2,
    price: "$$",
    open: true,
    instant: true,
  },
  {
    id: "2",
    slug: "the-gentleman-room",
    image: barber,
    en: { name: "The Gentleman Room", area: "Jumeirah", tags: "Barber · Fade · Beard" },
    ar: { name: "غرفة الأناقة", area: "جميرا", tags: "حلاقة · تدرج · لحية" },
    rating: 4.8,
    reviews: 1240,
    distanceKm: 2.4,
    price: "$",
    open: true,
    instant: true,
  },
  {
    id: "3",
    slug: "rose-nail-studio",
    image: nails,
    en: { name: "Rosé Nail Studio", area: "City Walk", tags: "Nails · Gel · Nail Art" },
    ar: { name: "استوديو روزيه", area: "سيتي ووك", tags: "أظافر · جل · رسم" },
    rating: 4.7,
    reviews: 430,
    distanceKm: 3.1,
    price: "$$",
    open: false,
    instant: false,
  },
  {
    id: "4",
    slug: "amber-spa-wellness",
    image: spa,
    en: { name: "Amber Spa & Wellness", area: "Corniche", tags: "Massage · Facial" },
    ar: { name: "أمبر سبا", area: "الكورنيش", tags: "مساج · عناية بالبشرة" },
    rating: 5.0,
    reviews: 296,
    distanceKm: 4.6,
    price: "$$$",
    open: true,
    instant: true,
  },
];
