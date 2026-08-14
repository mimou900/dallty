import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Eye, EyeOff, Flag, Send, Share2, Star } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useManagedBusinesses } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({
    meta: [
      { title: "Reviews — Dallty Business" },
      {
        name: "description",
        content:
          "Read, reply to, hide and share customer reviews, and track your rating trend over time.",
      },
      { property: "og:title", content: "Reviews — Dallty Business" },
      { property: "og:description", content: "Protect and grow your business's reputation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  const queryClient = useQueryClient();
  const businessesQuery = useManagedBusinesses();
  const businessIds = (businessesQuery.data ?? []).map((s) => s.id);
  const [filter, setFilter] = useState<"all" | "unanswered" | "hidden">("all");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const reviewsQuery = useQuery({
    queryKey: ["admin-reviews", businessIds],
    enabled: businessIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select(
          "id, business_id, rating, body, photos, owner_reply, owner_replied_at, is_hidden, report_count, created_at",
        )
        .in("business_id", businessIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const rows = (reviewsQuery.data ?? []).filter((r) =>
    filter === "unanswered" ? !r.owner_reply : filter === "hidden" ? r.is_hidden : true,
  );

  const stats = useMemo(() => {
    const all = reviewsQuery.data ?? [];
    const visible = all.filter((r) => !r.is_hidden);
    const avg = visible.length ? visible.reduce((s, r) => s + r.rating, 0) / visible.length : 0;
    const buckets = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: visible.filter((r) => r.rating === star).length,
    }));
    return {
      avg,
      total: visible.length,
      unanswered: all.filter((r) => !r.owner_reply && !r.is_hidden).length,
      reported: all.filter((r) => r.report_count > 0).length,
      buckets,
    };
  }, [reviewsQuery.data]);

  async function saveReply(id: string) {
    if (!replyText.trim()) return;
    const { error } = await supabase
      .from("reviews")
      .update({ owner_reply: replyText.trim(), owner_replied_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setReplyFor(null);
    setReplyText("");
    toast.success("Reply published");
    queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
  }

  async function toggleHidden(id: string, hidden: boolean) {
    const { error } = await supabase.from("reviews").update({ is_hidden: hidden }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(hidden ? "Review hidden" : "Review restored");
    queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl glass p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Average rating</p>
          <p className="mt-2 flex items-center gap-2 text-3xl font-extrabold">
            {stats.avg.toFixed(1)} <Star className="size-5 fill-gold text-gold" />
          </p>
        </div>
        <div className="rounded-3xl glass p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Total reviews</p>
          <p className="mt-2 text-3xl font-extrabold">{stats.total}</p>
        </div>
        <div className="rounded-3xl glass p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Awaiting reply</p>
          <p className="mt-2 text-3xl font-extrabold">{stats.unanswered}</p>
        </div>
        <div className="rounded-3xl glass p-5">
          <p className="text-xs font-bold uppercase text-muted-foreground">Reported</p>
          <p className="mt-2 text-3xl font-extrabold">{stats.reported}</p>
        </div>
      </div>

      <section className="rounded-3xl glass p-5">
        <h2 className="text-base font-extrabold">Rating breakdown</h2>
        <div className="mt-3 space-y-1.5">
          {stats.buckets.map((b) => (
            <div key={b.star} className="flex items-center gap-3">
              <span className="w-8 text-xs font-bold">{b.star}★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span
                  className="block h-full rounded-full bg-gold"
                  style={{ width: `${stats.total ? (b.count / stats.total) * 100 : 0}%` }}
                />
              </span>
              <span className="w-8 text-end text-xs font-bold">{b.count}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {(["all", "unanswered", "hidden"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`min-h-9 rounded-2xl px-3 text-xs font-bold capitalize ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-3xl glass">
        {reviewsQuery.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading reviews…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No reviews here yet.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {rows.map((r) => (
              <li key={r.id} className="p-4">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-gold">{"★".repeat(r.rating)}</p>
                    <p className="mt-1 text-sm">{r.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {format(new Date(r.created_at), "d MMM yyyy")}
                      {r.report_count > 0 ? ` · ${r.report_count} reports` : ""}
                    </p>
                    {r.owner_reply && (
                      <p className="mt-2 rounded-2xl bg-secondary/60 p-3 text-sm">
                        <span className="block text-xs font-bold uppercase text-muted-foreground">
                          Your reply
                        </span>
                        {r.owner_reply}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setReplyFor(replyFor === r.id ? null : r.id);
                        setReplyText(r.owner_reply ?? "");
                      }}
                      className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold"
                    >
                      <Send className="size-3.5" /> Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleHidden(r.id, !r.is_hidden)}
                      className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold"
                    >
                      {r.is_hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                      {r.is_hidden ? "Show" : "Hide"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(r.body);
                        toast.success("Review copied to clipboard");
                      }}
                      className="press inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-bold"
                    >
                      <Share2 className="size-3.5" /> Share
                    </button>
                    {r.report_count > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl bg-destructive/15 px-3 py-2 text-xs font-bold text-destructive">
                        <Flag className="size-3.5" /> Reported
                      </span>
                    )}
                  </div>
                </div>

                {replyFor === r.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      placeholder="Thank the customer and address their feedback…"
                      className="w-full rounded-2xl bg-card/70 p-3 text-sm outline-none ring-ring focus:ring-2"
                    />
                    <button
                      type="button"
                      onClick={() => saveReply(r.id)}
                      className="press min-h-10 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
                    >
                      Publish reply
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
