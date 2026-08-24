import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Briefcase,
  Facebook,
  Globe,
  Instagram,
  Languages,
  Loader2,
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
      <DrawerContent className="mt-6 h-[92dvh] rounded-t-3xl border-border bg-background p-0">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press absolute end-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-secondary text-foreground"
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
            <div className="relative h-52 shrink-0 overflow-hidden bg-muted">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center bg-primary/10 text-5xl font-extrabold text-primary">
                  {profile.full_name.slice(0, 1)}
                </div>
              )}
              <div aria-hidden className="photo-scrim absolute inset-0" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h2 className="text-2xl font-extrabold text-background">{profile.full_name}</h2>
                <p className="text-sm font-semibold text-background/85">{profile.title}</p>
              </div>
            </div>

            <div className="space-y-5 p-5 pb-10">
              <div className="flex flex-wrap gap-2">
                {profile.experience_years != null && (
                  <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                    <Briefcase className="size-3.5" />
                    {profile.experience_years} {profile.experience_years === 1 ? "year" : "years"}{" "}
                    experience
                  </span>
                )}
                {profile.languages?.map((l) => (
                  <span
                    key={l}
                    className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold"
                  >
                    <Languages className="size-3.5" />
                    {l}
                  </span>
                ))}
              </div>

              {profile.bio && (
                <p className="text-sm leading-relaxed text-muted-foreground">{profile.bio}</p>
              )}

              {profile.certificates?.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Award className="size-3.5" />
                    Certifications
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {profile.certificates.map((c) => (
                      <li
                        key={c}
                        className="rounded-2xl bg-muted/60 px-4 py-2.5 text-sm font-semibold"
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {profile.portfolio?.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Gallery
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {profile.portfolio.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full rounded-2xl object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}

              {social.length > 0 && (
                <div className="flex gap-2">
                  {social.map(([key, url]) => {
                    const Icon = SOCIAL_ICON[key.toLowerCase()] ?? Globe;
                    return (
                      <a
                        key={key}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={key}
                        className="grid size-11 place-items-center rounded-2xl glass-soft"
                      >
                        <Icon className="size-4" />
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
