import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type FavoriteKind = "salon" | "staff" | "service";

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

  const toggle = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save favorites");
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
      aria-label={active ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      className={`press grid size-10 shrink-0 place-items-center rounded-2xl glass-soft transition-colors disabled:opacity-60 ${className}`}
    >
      <Heart className={`size-5 ${active ? "fill-rose text-rose" : "text-muted-foreground"}`} />
    </button>
  );
}
