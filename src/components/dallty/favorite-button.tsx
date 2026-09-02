import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type FavoriteKind = "business" | "staff" | "service";

export function useFavorites(kind?: FavoriteKind) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["favorites", user?.id, kind ?? "all"],
    enabled: Boolean(user),
    queryFn: async () => {
      let query = supabase.from("favorites").select("*").eq("user_id", user!.id);
      if (kind) query = query.eq("kind", kind);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Five particles bursting outward from center on save — same shape as the pasted reference
 *  component (fixed 5-particle ring, slight per-particle randomness in radius/scale/timing),
 *  recolored to Dallty's own primary forest green (#0E5A43 → rgb(14,90,67)) instead of the
 *  reference's blue, matching every other "saved" indicator in the app (the Bookmark icon
 *  itself already fills primary-green when active). */
const PRIMARY_RGB = "14, 90, 67";

function saveParticle(index: number) {
  const angle = (index / 5) * (2 * Math.PI);
  const radius = 18 + Math.random() * 8;
  const scale = 0.8 + Math.random() * 0.4;
  const duration = 0.6 + Math.random() * 0.1;

  return {
    initial: { scale: 0, opacity: 0.3, x: 0, y: 0 },
    animate: {
      scale: [0, scale, 0],
      opacity: [0.3, 0.8, 0],
      x: [0, Math.cos(angle) * radius],
      y: [0, Math.sin(angle) * radius * 0.75],
    },
    transition: { duration, delay: index * 0.04, ease: "easeOut" as const },
  };
}

export function FavoriteButton({
  kind,
  targetId,
  label,
  className = "",
}: {
  kind: FavoriteKind;
  targetId: string;
  label: string;
  className?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const favorites = useFavorites(kind);
  const existing = favorites.data?.find((f) => f.target_id === targetId) ?? null;

  // Bursts once per genuine "just saved" transition, not on every render where active
  // happens to be true (e.g. opening the page with it already saved) — reset shortly after
  // so the same burst can fire again on a later save/unsave/save cycle.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return;
    const id = setTimeout(() => setJustSaved(false), 750);
    return () => clearTimeout(id);
  }, [justSaved]);

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save");
      if (existing) {
        const { error } = await supabase.from("favorites").delete().eq("id", existing.id);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from("favorites")
        .insert({ user_id: user.id, kind, target_id: targetId });
      if (error) throw error;
      return true;
    },
    onSuccess: (added) => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success(added ? `Saved ${label}` : `Removed ${label}`);
      if (added) setJustSaved(true);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not update"),
  });

  const active = Boolean(existing);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate();
      }}
      disabled={toggle.isPending}
      aria-pressed={active}
      aria-busy={toggle.isPending}
      aria-label={active ? `Remove ${label} from saved` : `Save ${label}`}
      className={`press relative grid size-10 shrink-0 place-items-center rounded-2xl glass-warm transition-colors hover:bg-primary/10 disabled:opacity-60 ${className}`}
    >
      {toggle.isPending ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : (
        <motion.div
          animate={{ scale: justSaved ? [1, 1.25, 1] : 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative flex items-center justify-center"
        >
          <Bookmark className={`size-5 ${active ? "fill-primary text-primary" : "text-primary"}`} />

          <AnimatePresence>
            {justSaved && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 -m-2 rounded-full"
                style={{
                  background: `radial-gradient(circle, rgba(${PRIMARY_RGB},0.4) 0%, rgba(${PRIMARY_RGB},0) 80%)`,
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.4, 1], opacity: [0, 0.4, 0] }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}

      <AnimatePresence>
        {justSaved && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            {[0, 1, 2, 3, 4].map((i) => {
              const p = saveParticle(i);
              return (
                <motion.div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: `${4 + Math.random() * 2}px`,
                    height: `${4 + Math.random() * 2}px`,
                    background: `rgb(${PRIMARY_RGB})`,
                    filter: "blur(1px)",
                  }}
                  initial={p.initial}
                  animate={p.animate}
                  transition={p.transition}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
