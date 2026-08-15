import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, BellOff, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { dateFnsLocaleFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

/** Bell + panel: bottom sheet on mobile, popover on desktop. */
export function NotificationCenter({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const { lang } = useLocale();
  const { t } = useTranslation("notifications");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as NotificationRow[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notification-center")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
          queryClient.invalidateQueries({ queryKey: ["my-waitlist"] });
          toast(row.title, { description: row.body });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const items = notificationsQuery.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  async function markAllRead() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  if (!user) return null;

  const trigger = (
    <button
      type="button"
      aria-label={unread > 0 ? `${t("title")}: ${unread} ${t("unread")}` : t("title")}
      className={`press relative grid size-10 shrink-0 place-items-center rounded-2xl border border-border bg-card text-foreground ${className}`}
    >
      <Bell className="size-[1.05rem]" />
      {unread > 0 && (
        <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-extrabold leading-5 text-primary-foreground">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );

  const header = (
    <div className="flex items-center justify-between gap-3 px-1 pb-2">
      <p className="text-base font-extrabold">{t("title")}</p>
      {unread > 0 && (
        <button
          type="button"
          onClick={markAllRead}
          className="press flex min-h-9 items-center gap-1 rounded-full bg-secondary px-3 text-xs font-bold text-foreground"
        >
          <Check className="size-3.5" />
          {t("mark_all_read")}
        </button>
      )}
    </div>
  );

  const list = (
    <div className="space-y-1.5 overflow-y-auto overscroll-contain">
      {notificationsQuery.isLoading ? (
        <p className="flex items-center gap-2 px-3 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("loading")}
        </p>
      ) : items.length === 0 ? (
        <div className="grid place-items-center gap-2 px-3 py-10 text-center">
          <BellOff className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        items.map((n) => (
          <article
            key={n.id}
            className={`rounded-2xl border px-3 py-3 ${
              n.read_at ? "border-border/60 bg-card/40" : "border-primary/30 bg-primary/5"
            }`}
          >
            <div className="flex items-start gap-2">
              {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
              <div className="min-w-0">
                <p className="text-sm font-bold leading-snug">{n.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), {
                    addSuffix: true,
                    locale: dateFnsLocaleFor(lang),
                  })}
                </p>
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );

  return (
    <>
      {/* Mobile: bottom sheet, thumb friendly */}
      <div className="md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[80dvh] rounded-t-3xl border-border bg-background px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
            <SheetTitle className="sr-only">{t("title")}</SheetTitle>
            {header}
            <div className="max-h-[60dvh] overflow-y-auto pb-2">{list}</div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: popover anchored to the bell */}
      <div className="hidden md:block">
        <Popover>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent align="end" className="w-96 rounded-3xl border-border bg-popover p-3">
            {header}
            <div className="max-h-96 overflow-y-auto">{list}</div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
