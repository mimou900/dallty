import hair from "@/assets/salon-hair.jpg";
import barber from "@/assets/salon-barber.jpg";
import nails from "@/assets/salon-nails.jpg";
import spa from "@/assets/salon-spa.jpg";

export type Lang = "en" | "ar";

export const categories = [
  { icon: "scissors", en: "Hair", ar: "شعر" },
  { icon: "razor", en: "Barber", ar: "حلاقة" },
  { icon: "hand", en: "Nails", ar: "أظافر" },
  { icon: "flower", en: "Spa", ar: "سبا" },
  { icon: "sparkles", en: "Makeup", ar: "مكياج" },
  { icon: "eye", en: "Lashes", ar: "رموش" },
] as const;

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

export const copy = {
  en: {
    dir: "ltr" as const,
    brand: "Dallty",
    tagline: "Find. Book. Relax.",
    nav: ["Explore", "Offers", "Gift cards", "For business"],
    signIn: "Sign in",
    heroTitle: "Beauty booking, made effortless.",
    heroSub:
      "Discover trusted salons, barbers and spas near you. Real availability, instant confirmation, under a minute.",
    searchPlaceholder: "Try “haircut tonight near me”",
    searchBtn: "Search",
    suggestions: ["Haircut tonight", "Massage near me", "Best barber", "Nails"],
    stats: [
      ["10,000+", "Salons"],
      ["4.9★", "Average rating"],
      ["60 sec", "To book"],
    ],
    categoriesTitle: "What are you looking for?",
    nearbyTitle: "Nearby salons",
    nearbySub: "Handpicked places open around you right now",
    seeAll: "See all",
    open: "Open now",
    closed: "Closed",
    instant: "Instant booking",
    km: "km away",
    book: "Book",
    stepsTitle: "Booking takes four taps",
    steps: [
      ["Choose service", "Pick the treatment you want."],
      ["Choose date", "See real availability."],
      ["Choose time", "Morning, evening, last minute."],
      ["Confirm", "Pay now or at the salon."],
    ],
    ctaTitle: "Your next appointment is one tap away.",
    ctaSub: "Download Dallty and book in seconds.",
    ctaBtn: "Get the app",
    footer: "© 2026 Dallty. Find. Book. Relax.",
    tabs: ["Home", "Search", "Bookings", "Favorites", "Profile"],
    menu: {
      open: "Menu",
      close: "Close menu",
      customers: "For customers",
      business: "For business",
      explore: "Explore",
      search: "Search",
      bookings: "My bookings",
      favorites: "Favorites",
      account: "Account",
      notifications: "Notifications",
      dashboard: "Dashboard",
      listBusiness: "List your business",
      businessSignIn: "Business sign in",
      staffSignIn: "Staff sign in",
      businessDashboard: "Business dashboard",
      createAccount: "Create account",
      signOut: "Sign out",
      language: "العربية",
    },

  },
  ar: {
    dir: "rtl" as const,
    brand: "دلّتي",
    tagline: "اكتشف. احجز. واستمتع.",
    nav: ["استكشف", "العروض", "بطاقات الهدايا", "للأعمال"],
    signIn: "تسجيل الدخول",
    heroTitle: "احجز جمالك بكل سهولة.",
    heroSub: "اكتشف أفضل الصالونات والحلاقين والسبا بالقرب منك. مواعيد حقيقية وتأكيد فوري.",
    searchPlaceholder: "جرّب «قص شعر الليلة قريب مني»",
    searchBtn: "بحث",
    suggestions: ["قص شعر الليلة", "مساج قريب مني", "أفضل حلاق", "أظافر"],
    stats: [
      ["+10,000", "صالون"],
      ["4.9★", "متوسط التقييم"],
      ["60 ثانية", "للحجز"],
    ],
    categoriesTitle: "عن ماذا تبحث؟",
    nearbyTitle: "صالونات قريبة",
    nearbySub: "أماكن مختارة ومفتوحة الآن بالقرب منك",
    seeAll: "عرض الكل",
    open: "مفتوح الآن",
    closed: "مغلق",
    instant: "حجز فوري",
    km: "كم",
    book: "احجز",
    stepsTitle: "الحجز في أربع خطوات",
    steps: [
      ["اختر الخدمة", "حدد الخدمة التي تريدها."],
      ["اختر اليوم", "مواعيد متاحة فعلياً."],
      ["اختر الوقت", "صباحاً أو مساءً أو فوراً."],
      ["أكّد الحجز", "ادفع الآن أو في الصالون."],
    ],
    ctaTitle: "موعدك القادم على بعد نقرة واحدة.",
    ctaSub: "حمّل دلّتي واحجز في ثوانٍ.",
    ctaBtn: "حمّل التطبيق",
    footer: "© 2026 دلّتي. اكتشف. احجز. واستمتع.",
    tabs: ["الرئيسية", "بحث", "حجوزاتي", "المفضلة", "حسابي"],
    menu: {
      open: "القائمة",
      close: "إغلاق القائمة",
      customers: "للعملاء",
      business: "للأعمال",
      explore: "استكشف",
      search: "بحث",
      bookings: "حجوزاتي",
      favorites: "المفضلة",
      account: "حسابي",
      notifications: "الإشعارات",
      dashboard: "لوحة التحكم",
      listBusiness: "أضف نشاطك التجاري",
      businessSignIn: "دخول أصحاب الأعمال",
      staffSignIn: "دخول الموظفين",
      businessDashboard: "لوحة تحكم النشاط",
      createAccount: "إنشاء حساب",
      signOut: "تسجيل الخروج",
      language: "English",
    },

  },
};
