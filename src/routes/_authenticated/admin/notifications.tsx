import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Bell, CheckCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Dallty Business" },
      {
        name: "description",
        content:
          "Every booking, cancellation and review alert for your salon in one place, with read tracking.",
      },
      { property: "og:title", content: "Notifications — Dallty Business" },
      {
        property: "og:description",
        content: "Booking, cancellation and review alerts for your salon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ["admin-notifications", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const rows = notificationsQuery.data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-3xl glass p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold">
            {unread} unread notification{unread === 1 ? "" : "s"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            Bookings, cancellations, waitlist openings and reviews.
          </p>
        </div>
        <button
          type="button"
          onClick={() => markAll.mutate()}
          disabled={!unread || markAll.isPending}
          className="press flex min-h-10 shrink-0 items-center gap-2 rounded-2xl bg-secondary px-4 text-sm font-bold disabled:opacity-50"
        >
          <CheckCheck className="size-4" /> Mark all read
        </button>
      </section>

      <section className="rounded-3xl glass p-3 sm:p-5">
        {notificationsQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading notifications…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((n) => (
              <li
                key={n.id}
                className={`flex gap-3 rounded-2xl p-3 ${n.read_at ? "bg-secondary/40" : "bg-primary/10"}`}
              >
                <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-sm font-bold">{n.title}</p>
                  <p className="text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
