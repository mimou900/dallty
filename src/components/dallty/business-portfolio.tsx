import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { signedUrl } from "@/lib/storage";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type GalleryItem = {
  id: string;
  url: string;
  category: string;
  caption: string | null;
  before_url: string | null;
};

function GalleryThumb({
  path,
  alt,
  onOpen,
}: {
  path: string;
  alt: string;
  onOpen: (src: string) => void;
}) {
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

  if (!src) return <div className="aspect-square rounded-2xl bg-muted" />;
  return (
    <button type="button" onClick={() => onOpen(src)} className="press aspect-square overflow-hidden rounded-2xl">
      <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />
    </button>
  );
}

function GalleryImageWide({ path, alt }: { path: string; alt: string }) {
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
    <img src={src} alt={alt} loading="lazy" className="h-40 w-56 shrink-0 rounded-2xl object-cover" />
  );
}

/** Business photos as a responsive grid (brief §24) — separated out of the old BusinessAbout
 *  monolith, which mixed gallery + amenities + policies + FAQ into one component. Tapping any
 *  photo opens a simple full-viewport lightbox with prev/next through every resolved image,
 *  not just the ones in that photo's own category. */
export function BusinessPortfolio({ businessId }: { businessId: string }) {
  const galleryQuery = useQuery({
    queryKey: ["business-gallery", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_gallery")
        .select("id, url, category, caption, before_url")
        .eq("business_id", businessId)
        .order("sort_order");
      if (error) throw error;
      return data as GalleryItem[];
    },
  });

  const [resolved, setResolved] = useState<Record<string, string>>({});
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const gallery = galleryQuery.data ?? [];
  const categories = Array.from(new Set(gallery.map((g) => g.category)));
  const beforeAfter = gallery.filter((g) => g.before_url);

  if (galleryQuery.isSuccess && gallery.length === 0) return null;

  return (
    <section id="photos" className="scroll-mt-32">
      <h2 className="text-xl font-extrabold">Photos</h2>
      {categories.map((category) => {
        const items = gallery.filter((g) => g.category === category);
        return (
          <div key={category} className="mt-4">
            <h3 className="text-sm font-bold capitalize text-muted-foreground">
              {category.replace(/_/g, " ")}
            </h3>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((item) => (
                <GalleryThumb
                  key={item.id}
                  path={item.url}
                  alt={item.caption ?? `${category} photo`}
                  onOpen={(src) => {
                    setResolved((prev) => ({ ...prev, [item.id]: src }));
                    setLightboxIndex(gallery.findIndex((g) => g.id === item.id));
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {beforeAfter.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-bold text-muted-foreground">Before &amp; after</h3>
          <div className="mt-2 flex gap-4 overflow-x-auto pb-1">
            {beforeAfter.map((item) => (
              <div key={item.id} className="flex shrink-0 gap-1">
                <GalleryImageWide path={item.before_url!} alt="Before" />
                <GalleryImageWide path={item.url} alt="After" />
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={lightboxIndex !== null} onOpenChange={(open) => !open && setLightboxIndex(null)}>
        <DialogContent className="flex h-[92vh] w-[95vw] max-w-3xl items-center justify-center border-none bg-background/95 p-0">
          <DialogTitle className="sr-only">Photo gallery</DialogTitle>
          {lightboxIndex !== null && (
            <LightboxImage item={gallery[lightboxIndex]} resolved={resolved} />
          )}
          {lightboxIndex !== null && lightboxIndex > 0 && (
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setLightboxIndex((i) => (i ?? 0) - 1)}
              className="press absolute start-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full glass-soft"
            >
              <ChevronLeft className="size-5 rtl:rotate-180" />
            </button>
          )}
          {lightboxIndex !== null && lightboxIndex < gallery.length - 1 && (
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setLightboxIndex((i) => (i ?? 0) + 1)}
              className="press absolute end-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full glass-soft"
            >
              <ChevronRight className="size-5 rtl:rotate-180" />
            </button>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function LightboxImage({
  item,
  resolved,
}: {
  item: GalleryItem;
  resolved: Record<string, string>;
}) {
  const [src, setSrc] = useState<string | null>(resolved[item.id] ?? null);
  useEffect(() => {
    if (resolved[item.id]) {
      setSrc(resolved[item.id]);
      return;
    }
    let cancelled = false;
    signedUrl("review-photos", item.url).then((url) => {
      if (!cancelled) setSrc(url ?? item.url);
    });
    return () => {
      cancelled = true;
    };
  }, [item, resolved]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt={item.caption ?? "Business photo"}
      className="max-h-full max-w-full object-contain"
    />
  );
}
