import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  BellRing,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  Check,
  CheckCircle2,
  CircleX,
  Clock3,
  Loader2,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
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
  deep_link: string | null;
};

type Tone = "primary" | "gold" | "destructive" | "lime" | "muted";

const TONE_CLASSES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  gold: "bg-gold/15 text-gold",
  destructive: "bg-destructive/10 text-destructive",
  lime: "bg-lime/20 text-lime-foreground",
  muted: "bg-muted text-muted-foreground",
};

/** Icon + tone per notification `kind` (see notify_booking_audience() and friends in the
 * Postgres triggers) — falls back to a plain bell for anything not mapped, so a future kind
 * never renders broken. */
const KIND_VISUALS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  booking_created: { icon: CalendarCheck, tone: "primary" },
  booking_confirmed: { icon: CalendarCheck, tone: "primary" },
  booking_completed: { icon: CheckCircle2, tone: "primary" },
  booking_cancelled: { icon: CalendarX, tone: "destructive" },
  booking_no_show: { icon: CircleX, tone: "destructive" },
  booking_rescheduled: { icon: CalendarClock, tone: "gold" },
  booking_reminder: { icon: BellRing, tone: "gold" },
  booking_pending_confirmation: { icon: Clock3, tone: "gold" },
  waitlist_pending_confirmation: { icon: Clock3, tone: "gold" },
  waitlist_auto_booked: { icon: CalendarCheck, tone: "primary" },
  waitlist_slot_open: { icon: Sparkles, tone: "lime" },
  staff_request_approved: { icon: CheckCircle2, tone: "primary" },
  staff_request_rejected: { icon: CircleX, tone: "destructive" },
};

function visualFor(kind: string) {
  return KIND_VISUALS[kind] ?? { icon: Bell, tone: "muted" as Tone };
}

/** Bell + panel: bottom sheet on mobile, popover on desktop. */
export function NotificationCenter({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "glass";
}) {
  const { user } = useAuth();
  const { lang } = useLocale();
  const { t } = useTranslation("notifications");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, read_at, created_at, deep_link")
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

  /** Deep links are a convenience, never authorization (brief §57) — navigating here is
   * exactly the same as the user typing the URL themselves; the destination route's own
   * server-side/RLS check is what actually gates access to the booking. */
  async function openNotification(n: NotificationRow) {
    if (!n.read_at) {
      await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", n.id);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.deep_link) {
      setOpen(false);
      void navigate({ to: n.deep_link });
    }
  }

  if (!user) return null;

  const trigger = (
    <button
      type="button"
      onClick={markAllRead}
      aria-label={unread > 0 ? `${t("title")}: ${unread} ${t("unread")}` : t("title")}
      className={`press relative grid shrink-0 place-items-center rounded-2xl text-foreground ${
        variant === "glass" ? "size-11 glass-soft" : "size-10 border border-border bg-card"
      } ${className}`}
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
        <div className="grid place-items-center gap-3 px-3 py-12 text-center">
          <div className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <BellRing className="size-6" />
          </div>
          <p className="text-sm font-semibold text-foreground">{t("empty")}</p>
        </div>
      ) : (
        items.map((n) => {
          const { icon: Icon, tone } = visualFor(n.kind);
          return (
            <article
              key={n.id}
              role={n.deep_link ? "button" : undefined}
              tabIndex={n.deep_link ? 0 : undefined}
              onClick={() => openNotification(n)}
              onKeyDown={(e) => {
                if (n.deep_link && (e.key === "Enter" || e.key === " ")) openNotification(n);
              }}
              className={`relative rounded-2xl border px-3 py-3 ${n.deep_link ? "cursor-pointer" : ""} ${
                n.read_at ? "border-border/60 bg-card/40" : "border-primary/20 bg-primary/[0.04]"
              }`}
            >
              {!n.read_at && (
                <span className="absolute start-1.5 top-1.5 size-1.5 rounded-full bg-primary" />
              )}
              <div className="flex items-start gap-3">
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-full ${TONE_CLASSES[tone]}`}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
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
          );
        })
      )}
    </div>
  );

  return (
    <>
      {/* Mobile: near-fullscreen drawer, drag-to-dismiss (vaul) or the close button */}
      <div className="md:hidden">
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild>{trigger}</DrawerTrigger>
          <DrawerContent className="mt-6 h-[92dvh] rounded-t-3xl border-border bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="press absolute end-3 top-3 grid size-10 place-items-center rounded-full bg-secondary text-foreground"
            >
              <X className="size-5" />
            </button>
            <DrawerTitle className="sr-only">{t("title")}</DrawerTitle>
            <div className="mt-2 pe-12">{header}</div>
            <div className="flex-1 overflow-y-auto pb-2">{list}</div>
          </DrawerContent>
        </Drawer>
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
