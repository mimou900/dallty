import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Heart, Scissors, Sparkles, Store } from "lucide-react";

import { formatMoney } from "@/lib/countries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FavoriteButton, useFavorites } from "@/components/dallty/favorite-button";
import { ClientShell } from "@/components/dallty/client-shell";
import { LoggedOutCard } from "@/components/dallty/logged-out-card";
import { Skeleton } from "@/components/dallty/skeleton";

// Intentionally NOT nested under `_authenticated` — a signed-out visitor
// sees this page's own logged-out state instead of being redirected
// straight to `/auth` (see LoggedOutCard's doc comment).
export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Saved salons & specialists — Dallty" },
      {
        name: "description",
        content:
          "All the salons, specialists and services you've saved on Dallty, plus the places you viewed recently.",
      },
      { property: "og:title", content: "Saved salons & specialists — Dallty" },
      {
        property: "og:description",
        content: "Your saved salons, specialists and services on Dallty.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const { user, loading: authLoading } = useAuth();
  const favorites = useFavorites();
  const rows = favorites.data ?? [];

  const businessIds = rows.filter((r) => r.kind === "business").map((r) => r.target_id);
  const staffIds = rows.filter((r) => r.kind === "staff").map((r) => r.target_id);
  const serviceIds = rows.filter((r) => r.kind === "service").map((r) => r.target_id);

  const businessesQuery = useQuery({
    queryKey: ["fav-businesses", businessIds],
    enabled: businessIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, slug, area, city, image_url, rating, review_count, price_range")
        .in("id", businessIds);
      if (error) throw error;
      return data;
    },
  });

  const staffQuery = useQuery({
    queryKey: ["fav-staff", staffIds],
    enabled: staffIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, full_name, title, business_id, businesses(slug)")
        .in("id", staffIds);
      if (error) throw error;
      return data;
    },
  });

  const servicesQuery = useQuery({
    queryKey: ["fav-services", serviceIds],
    enabled: serviceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select(
          "id, name, price, discount_price, duration_minutes, business_id, businesses(currency, slug)",
        )
        .in("id", serviceIds);
      if (error) throw error;
      return data;
    },
  });

  const recentQuery = useQuery({
    queryKey: ["recently-viewed", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recently_viewed")
        .select("business_id, viewed_at, businesses(id, name, slug, area, image_url, rating)")
        .eq("user_id", user!.id)
        .order("viewed_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const empty =
    !favorites.isLoading && !businessIds.length && !staffIds.length && !serviceIds.length;

  // Covers both the initial favorites-rows fetch and the per-kind fetches that follow it —
  // each only "counts" while its own ids are non-empty, since a kind with zero saved ids
  // never queries at all (see each query's `enabled`) and should never block on it.
  const loading =
    favorites.isLoading ||
    (businessIds.length > 0 && businessesQuery.isLoading) ||
    (staffIds.length > 0 && staffQuery.isLoading) ||
    (serviceIds.length > 0 && servicesQuery.isLoading);

  // This route is deliberately NOT nested under `_authenticated` (see the
  // route comment above) so a signed-out visitor sees this page's own
  // logged-out state instead of being bounced straight to `/auth`.
  // `favorites`/`recentQuery` both stay `enabled: Boolean(user)` internally,
  // so without this branch a signed-out visitor would see `loading` stuck
  // true forever (a disabled query never leaves "pending") instead of the
  // logged-out card.
  if (authLoading) {
    return (
      <ClientShell title="Favorites" subtitle="Salons, specialists and services you saved.">
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-3xl glass p-3">
              <Skeleton variant="image" className="size-16 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton variant="text" className="h-3.5 w-3/5" />
                <Skeleton variant="text" className="w-2/5" />
              </div>
              <Skeleton variant="circle" className="size-10 shrink-0 rounded-2xl" />
            </div>
          ))}
        </div>
      </ClientShell>
    );
  }
  if (!user) {
    return (
      <ClientShell title="Favorites" subtitle="Salons, specialists and services you saved.">
        <LoggedOutCard
          icon={Heart}
          title="Log in to view your favorites"
          subtitle="Search and save your favorite salons and specialists on Dallty once you've logged in."
          nextPath="/favorites"
        />
      </ClientShell>
    );
  }

  return (
    <ClientShell title="Favorites" subtitle="Salons, specialists and services you saved.">
      {loading && !empty && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-3xl glass p-3">
              <Skeleton variant="image" className="size-16 shrink-0 rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton variant="text" className="h-3.5 w-3/5" />
                <Skeleton variant="text" className="w-2/5" />
              </div>
              <Skeleton variant="circle" className="size-10 shrink-0 rounded-2xl" />
            </div>
          ))}
        </div>
      )}

      {empty && (
        <div className="mt-8 rounded-3xl glass p-8 text-center">
          <Heart className="mx-auto size-8 text-rose" />
          <p className="mt-3 text-base font-bold">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap the heart on a salon, specialist or service to keep it here.
          </p>
          <Link
            to="/"
            className="press mt-5 inline-flex min-h-11 items-center rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground"
          >
            Explore salons
          </Link>
        </div>
      )}

      {businessesQuery.data?.length ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Store className="size-4 text-primary" /> Salons
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {businessesQuery.data.map((business) => (
              <div key={business.id} className="flex items-center gap-3 rounded-3xl glass p-3">
                <Link
                  to="/business/$businessSlug"
                  params={{ businessSlug: business.slug }}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <img
                    src={business.image_url ?? "/salons/hair.jpg"}
                    alt={business.name}
                    loading="lazy"
                    className="size-16 rounded-2xl object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold">{business.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {business.area}
                      {business.city ? `, ${business.city}` : ""} · ★{" "}
                      {Number(business.rating).toFixed(1)}
                    </span>
                  </span>
                </Link>
                <FavoriteButton kind="business" targetId={business.id} label={business.name} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {staffQuery.data?.length ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Scissors className="size-4 text-primary" /> Specialists
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {staffQuery.data.map((member) => (
              <div key={member.id} className="flex items-center gap-3 rounded-3xl glass p-4">
                <Link
                  to="/business/$businessSlug"
                  params={{ businessSlug: member.businesses?.slug ?? "" }}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate text-sm font-extrabold">{member.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {member.title}
                  </span>
                </Link>
                <FavoriteButton kind="staff" targetId={member.id} label={member.full_name} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {servicesQuery.data?.length ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Sparkles className="size-4 text-primary" /> Services
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {servicesQuery.data.map((service) => (
              <div key={service.id} className="flex items-center gap-3 rounded-3xl glass p-4">
                <Link
                  to="/business/$businessSlug"
                  params={{
                    businessSlug:
                      (service as { businesses?: { slug?: string } }).businesses?.slug ?? "",
                  }}
                  className="min-w-0 flex-1"
                >
                  <span className="block truncate text-sm font-extrabold">{service.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {service.duration_minutes} min ·{" "}
                    {formatMoney(
                      service.discount_price ?? service.price,
                      (service as { businesses?: { currency?: string } }).businesses?.currency,
                    )}
                  </span>
                </Link>
                <FavoriteButton kind="service" targetId={service.id} label={service.name} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {recentQuery.data?.length ? (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Clock3 className="size-4 text-primary" /> Recently viewed
          </h2>
          <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
            {recentQuery.data.map((row) => {
              const business = row.businesses as {
                id: string;
                name: string;
                slug: string;
                area: string;
                image_url: string | null;
              } | null;
              if (!business) return null;
              return (
                <Link
                  key={business.id}
                  to="/business/$businessSlug"
                  params={{ businessSlug: business.slug }}
                  className="w-40 shrink-0 rounded-3xl glass p-3"
                >
                  <img
                    src={business.image_url ?? "/salons/hair.jpg"}
                    alt={business.name}
                    loading="lazy"
                    className="h-24 w-full rounded-2xl object-cover"
                  />
                  <p className="mt-2 truncate text-sm font-bold">{business.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{business.area}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </ClientShell>
  );
}
