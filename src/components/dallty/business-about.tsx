import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Accessibility,
  Award,
  Car,
  Coffee,
  Dog,
  GraduationCap,
  Info,
  Instagram,
  Languages,
  PlayCircle,
  ScrollText,
  Wifi,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";

const AMENITY_ICONS: Record<string, typeof Wifi> = {
  wifi: Wifi,
  parking: Car,
  coffee: Coffee,
  wheelchair: Accessibility,
  pet_friendly: Dog,
};

const AMENITY_LABELS: Record<string, string> = {
  wifi: "Free WiFi",
  parking: "Parking",
  coffee: "Complimentary coffee",
  wheelchair: "Wheelchair accessible",
  pet_friendly: "Pet friendly",
  home_service: "Home service",
  hotel_service: "Hotel service",
  women_only: "Women only",
  men_only: "Men only",
  kids: "Kids welcome",
};

type Business = {
  id: string;
  description: string | null;
  amenities: string[];
  languages: string[];
  awards: string[];
  certifications: string[];
  brands: string[];
  cancellation_policy: string | null;
  house_rules: string | null;
  owner_story: string | null;
  faq: unknown;
  video_tour_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
};

type GalleryItem = {
  id: string;
  url: string;
  category: string;
  caption: string | null;
  before_url: string | null;
};

function GalleryImage({ path, alt }: { path: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    signedUrl("review-photos", path).then((url) => {
      if (!cancelled) setSrc(url ?? path);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!src) return <div className="h-40 w-56 shrink-0 rounded-2xl bg-muted" />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="h-40 w-56 shrink-0 rounded-2xl object-cover"
    />
  );
}

function Chips({ items, icon: Icon }: { items: string[]; icon: typeof Award }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="flex items-center gap-1.5 rounded-full glass-soft px-3 py-1.5 text-xs font-semibold"
        >
          <Icon className="size-3.5 text-primary" />
          {item}
        </span>
      ))}
    </div>
  );
}

export function BusinessAbout({ business }: { business: Business }) {
  const galleryQuery = useQuery({
    queryKey: ["business-gallery", business.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_gallery")
        .select("*")
        .eq("business_id", business.id)
        .order("sort_order");
      if (error) throw error;
      return data as GalleryItem[];
    },
  });

  const gallery = galleryQuery.data ?? [];
  const categories = Array.from(new Set(gallery.map((g) => g.category)));
  const beforeAfter = gallery.filter((g) => g.before_url);
  const faq = Array.isArray(business.faq)
    ? (business.faq as { q?: string; a?: string }[]).filter((f) => f.q && f.a)
    : [];

  return (
    <section className="mt-7 animate-fade-up space-y-6">
      {business.description && (
        <div className="rounded-3xl glass p-5">
          <h2 className="text-lg font-extrabold">About</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {business.description}
          </p>
        </div>
      )}

      {business.owner_story && (
        <div className="rounded-3xl glass p-5">
          <h2 className="text-lg font-extrabold">Owner's story</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {business.owner_story}
          </p>
        </div>
      )}

      {(business.video_tour_url || business.instagram_url || business.tiktok_url) && (
        <div className="rounded-3xl glass p-5">
          <h2 className="text-lg font-extrabold">Take a look inside</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {business.video_tour_url && (
              <a
                href={business.video_tour_url}
                target="_blank"
                rel="noreferrer noopener"
                className="press flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                <PlayCircle className="size-4" />
                Video tour
              </a>
            )}
            {business.instagram_url && (
              <a
                href={business.instagram_url}
                target="_blank"
                rel="noreferrer noopener"
                className="press flex min-h-11 items-center gap-2 rounded-2xl glass-soft px-4 text-sm font-bold"
              >
                <Instagram className="size-4" />
                Instagram
              </a>
            )}
            {business.tiktok_url && (
              <a
                href={business.tiktok_url}
                target="_blank"
                rel="noreferrer noopener"
                className="press flex min-h-11 items-center gap-2 rounded-2xl glass-soft px-4 text-sm font-bold"
              >
                TikTok
              </a>
            )}
          </div>
        </div>
      )}

      {gallery.length > 0 && (
        <div className="rounded-3xl glass p-5">
          <h2 className="text-lg font-extrabold">Gallery</h2>
          {categories.map((category) => (
            <div key={category} className="mt-4">
              <h3 className="text-sm font-bold capitalize text-muted-foreground">
                {category.replace(/_/g, " ")}
              </h3>
              <div className="mt-2 flex gap-3 overflow-x-auto pb-1">
                {gallery
                  .filter((g) => g.category === category)
                  .map((item) => (
                    <GalleryImage
                      key={item.id}
                      path={item.url}
                      alt={item.caption ?? `${category} photo`}
                    />
                  ))}
              </div>
            </div>
          ))}

          {beforeAfter.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-bold text-muted-foreground">Before & after</h3>
              <div className="mt-2 flex gap-4 overflow-x-auto pb-1">
                {beforeAfter.map((item) => (
                  <div key={item.id} className="flex shrink-0 gap-1">
                    <GalleryImage path={item.before_url!} alt="Before" />
                    <GalleryImage path={item.url} alt="After" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {business.amenities.length > 0 && (
        <div className="rounded-3xl glass p-5">
          <h2 className="text-lg font-extrabold">Amenities</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {business.amenities.map((key) => {
              const Icon = AMENITY_ICONS[key] ?? Info;
              return (
                <div key={key} className="flex items-center gap-2.5 rounded-2xl glass-soft px-4 py-3">
                  <Icon className="size-4 shrink-0 text-primary" />
                  <span className="text-sm font-semibold">
                    {AMENITY_LABELS[key] ?? key.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(business.languages.length > 0 ||
        business.awards.length > 0 ||
        business.certifications.length > 0 ||
        business.brands.length > 0) && (
        <div className="space-y-4 rounded-3xl glass p-5">
          {business.languages.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Languages spoken
              </h2>
              <Chips items={business.languages} icon={Languages} />
            </div>
          )}
          {business.awards.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Awards
              </h2>
              <Chips items={business.awards} icon={Award} />
            </div>
          )}
          {business.certifications.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Certifications
              </h2>
              <Chips items={business.certifications} icon={GraduationCap} />
            </div>
          )}
          {business.brands.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Products used
              </h2>
              <Chips items={business.brands} icon={ScrollText} />
            </div>
          )}
        </div>
      )}

      {(business.cancellation_policy || business.house_rules) && (
        <div className="space-y-4 rounded-3xl glass p-5">
          {business.cancellation_policy && (
            <div>
              <h2 className="text-lg font-extrabold">Cancellation policy</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {business.cancellation_policy}
              </p>
            </div>
          )}
          {business.house_rules && (
            <div>
              <h2 className="text-lg font-extrabold">House rules</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {business.house_rules}
              </p>
            </div>
          )}
        </div>
      )}

      {faq.length > 0 && (
        <div className="rounded-3xl glass p-5">
          <h2 className="text-lg font-extrabold">FAQ</h2>
          <div className="mt-3 space-y-2">
            {faq.map((item, i) => (
              <details key={i} className="rounded-2xl glass-soft p-4">
                <summary className="cursor-pointer text-sm font-bold">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
