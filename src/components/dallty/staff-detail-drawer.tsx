import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Briefcase,
  Facebook,
  Globe,
  Images,
  Instagram,
  Languages,
  Loader2,
  Sparkles,
  Twitter,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";

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

const SOCIAL_ICON: Record<string, typeof Instagram> = {
  instagram: Instagram,
  facebook: Facebook,
  twitter: Twitter,
};

export function StaffDetailDrawer({
  staffId,
  onClose,
}: {
  staffId: string | null;
  onClose: () => void;
}) {
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

  const profile = profileQuery.data;
  const social = Object.entries(profile?.social_links ?? {}).filter(([, url]) => url);

  return (
    <Drawer open={Boolean(staffId)} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="mt-6 h-[92dvh] overflow-hidden rounded-t-[2rem] border-border bg-background p-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press absolute end-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-background/70 text-foreground shadow-elevation-medium backdrop-blur-md"
        >
          <X className="size-5" />
        </button>
        <DrawerTitle className="sr-only">Specialist details</DrawerTitle>

        {profileQuery.isLoading ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : profile ? (
          <div className="h-full overflow-y-auto">
            <div className="relative h-72 shrink-0 overflow-hidden bg-muted">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center bg-(image:--gradient-primary) text-6xl font-extrabold text-primary-foreground">
                  {profile.full_name.slice(0, 1)}
                </div>
              )}
              <div aria-hidden className="photo-scrim absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 p-5 pb-6">
                {profile.experience_years != null ? (
                  <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-lime px-3 py-1 text-[0.7rem] font-extrabold text-lime-foreground">
                    <Sparkles className="size-3" />
                    {profile.experience_years}+ {profile.experience_years === 1 ? "year" : "years"}{" "}
                    experience
                  </span>
                ) : null}
                <h2 className="text-[1.75rem] font-extrabold leading-tight text-background">
                  {profile.full_name}
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-background/85">
                  <Briefcase className="size-3.5" />
                  {profile.title}
                </p>
              </div>
            </div>

            <div className="space-y-6 p-5 pb-10">
              {profile.languages?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map((l) => (
                    <span
                      key={l}
                      className="flex items-center gap-1.5 rounded-full bg-muted/70 px-3 py-1.5 text-xs font-bold"
                    >
                      <Languages className="size-3.5 text-primary" />
                      {l}
                    </span>
                  ))}
                </div>
              )}

              {profile.bio && (
                <section>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    About
                  </p>
                  <p className="mt-2 rounded-3xl bg-muted/50 p-4 text-sm leading-relaxed text-foreground/90">
                    {profile.bio}
                  </p>
                </section>
              )}

              {profile.certificates?.length > 0 && (
                <section>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Award className="size-3.5" />
                    Certifications
                  </p>
                  <ul className="mt-2 space-y-2">
                    {profile.certificates.map((c) => (
                      <li
                        key={c}
                        className="flex items-center gap-3 rounded-2xl bg-muted/50 px-4 py-3 text-sm font-semibold"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
                          <Award className="size-4" />
                        </span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {profile.portfolio?.length > 0 && (
                <section>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Images className="size-3.5" />
                    Gallery
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2.5">
                    {profile.portfolio.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full rounded-2xl object-cover shadow-elevation-low"
                      />
                    ))}
                  </div>
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
                        className="flex items-center gap-2 rounded-2xl glass-soft px-4 py-2.5 text-sm font-bold capitalize"
                      >
                        <Icon className="size-4" />
                        {key}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}
