import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Flag, ImagePlus, Loader2, Pencil, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { signedUrl, uploadTo } from "@/lib/storage";

type Review = {
  id: string;
  booking_id: string | null;
  customer_id: string;
  salon_id: string;
  rating: number;
  body: string;
  photos: string[];
  owner_reply: string | null;
  owner_replied_at: string | null;
  is_hidden: boolean;
  created_at: string;
};

function Stars({
  value,
  onChange,
  size = "size-5",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: string;
}) {
  return (
    <div className="flex items-center gap-0.5" role={onChange ? "radiogroup" : undefined}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        const star = (
          <Star className={`${size} ${filled ? "fill-gold text-gold" : "text-muted-foreground"}`} />
        );
        if (!onChange) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => onChange(n)}
            className="press p-0.5"
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}

function ReviewPhotos({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(paths.map((p) => signedUrl("review-photos", p))).then((list) => {
      if (!cancelled) setUrls(list.filter((u): u is string => Boolean(u)));
    });
    return () => {
      cancelled = true;
    };
  }, [paths]);

  if (!urls.length) return null;
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {urls.map((url) => (
        <img
          key={url}
          src={url}
          alt="Customer photo from this review"
          loading="lazy"
          className="size-24 shrink-0 rounded-2xl object-cover"
        />
      ))}
    </div>
  );
}

export function SalonReviews({ salonId, isOwner }: { salonId: string; isOwner: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [composing, setComposing] = useState(false);

  const reviewsQuery = useQuery({
    queryKey: ["reviews", salonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("salon_id", salonId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Review[];
    },
  });

  // A customer may review a booking they actually had at this salon.
  const eligibleQuery = useQuery({
    queryKey: ["reviewable-bookings", salonId, user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, service_id, staff_id, starts_at, status")
        .eq("salon_id", salonId)
        .eq("customer_id", user!.id)
        .in("status", ["completed", "confirmed"])
        .order("starts_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const reviews = reviewsQuery.data ?? [];
  const myReview = reviews.find((r) => r.customer_id === user?.id) ?? null;
  const eligibleBooking = eligibleQuery.data?.[0] ?? null;
  const canWrite = Boolean(user && eligibleBooking && !myReview);

  const average = reviews.length
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const breakdown = [5, 4, 3, 2, 1].map((n) => ({
    stars: n,
    count: reviews.filter((r) => r.rating === n).length,
  }));

  function resetForm() {
    setEditingId(null);
    setComposing(false);
    setRating(5);
    setBody("");
    setFiles([]);
  }

  const saveReview = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to review");
      const uploaded = await Promise.all(files.map((f) => uploadTo("review-photos", user.id, f)));

      if (editingId) {
        const current = reviews.find((r) => r.id === editingId);
        const { error } = await supabase
          .from("reviews")
          .update({ rating, body: body.trim(), photos: [...(current?.photos ?? []), ...uploaded] })
          .eq("id", editingId);
        if (error) throw error;
        return;
      }

      if (!eligibleBooking) throw new Error("Only customers with a booking here can review");
      const { error } = await supabase.from("reviews").insert({
        booking_id: eligibleBooking.id,
        customer_id: user.id,
        salon_id: salonId,
        staff_id: eligibleBooking.staff_id,
        service_id: eligibleBooking.service_id,
        rating,
        body: body.trim(),
        photos: uploaded,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", salonId] });
      queryClient.invalidateQueries({ queryKey: ["salon", salonId] });
      resetForm();
      toast.success("Thanks for your review");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  const deleteReview = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", salonId] });
      queryClient.invalidateQueries({ queryKey: ["salon", salonId] });
      toast.success("Review deleted");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not delete"),
  });

  const saveReply = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("reviews")
        .update({ owner_reply: replyText.trim(), owner_replied_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviews", salonId] });
      setReplyFor(null);
      setReplyText("");
      toast.success("Reply posted");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not reply"),
  });

  const reportReview = useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Sign in to report a review");
      const { error } = await supabase
        .from("review_reports")
        .insert({ review_id: id, reporter_id: user.id, reason: "Reported from salon page" });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Thanks — our team will take a look."),
    onError: (error) =>
      toast.error(
        error instanceof Error && error.message.includes("duplicate")
          ? "You already reported this review"
          : "Could not report this review",
      ),
  });

  return (
    <section className="mt-7 animate-fade-up space-y-5">
      <div className="rounded-3xl glass p-5">
        <div className="flex items-center gap-5">
          <div>
            <p className="text-4xl font-extrabold">{average ? average.toFixed(1) : "—"}</p>
            <Stars value={Math.round(average)} size="size-4" />
            <p className="mt-1 text-xs text-muted-foreground">
              {reviews.length} review{reviews.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            {breakdown.map((row) => (
              <div key={row.stars} className="flex items-center gap-2">
                <span className="w-3 text-xs font-semibold text-muted-foreground">{row.stars}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
                  <span
                    className="block h-full rounded-full bg-gold"
                    style={{
                      width: reviews.length ? `${(row.count / reviews.length) * 100}%` : "0%",
                    }}
                  />
                </span>
                <span className="w-5 text-end text-xs text-muted-foreground">{row.count}</span>
              </div>
            ))}
          </div>
        </div>

        {canWrite && !composing && (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="press mt-4 min-h-11 w-full rounded-2xl bg-primary text-sm font-bold text-primary-foreground"
          >
            Write a review
          </button>
        )}
        {!user && (
          <p className="mt-4 text-sm text-muted-foreground">
            Sign in after your visit to leave a review.
          </p>
        )}
        {user && !eligibleBooking && !myReview && (
          <p className="mt-4 text-sm text-muted-foreground">
            Reviews open up once you've booked here.
          </p>
        )}
      </div>

      {(composing || editingId) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveReview.mutate();
          }}
          className="rounded-3xl glass p-5"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-extrabold">
              {editingId ? "Edit your review" : "How was your visit?"}
            </h3>
            <button type="button" onClick={resetForm} aria-label="Cancel" className="press p-1">
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3">
            <Stars value={rating} onChange={setRating} size="size-7" />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Tell others about the service, the team and the space…"
            aria-label="Your review"
            className="mt-3 w-full rounded-2xl bg-card/70 p-4 text-base outline-none ring-ring focus:ring-2"
          />
          <label className="press mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl glass-soft text-sm font-bold">
            <ImagePlus className="size-4" />
            {files.length ? `${files.length} photo${files.length > 1 ? "s" : ""} selected` : "Add photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
            />
          </label>
          <button
            type="submit"
            disabled={saveReview.isPending}
            className="press mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saveReview.isPending && <Loader2 className="size-4 animate-spin" />}
            {editingId ? "Save changes" : "Publish review"}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {reviews.map((review) => {
          const mine = review.customer_id === user?.id;
          return (
            <article key={review.id} className="rounded-3xl glass p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Stars value={review.rating} size="size-4" />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mine ? "Your review" : "Verified visit"} ·{" "}
                    {format(new Date(review.created_at), "d MMM yyyy")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {mine && (
                    <>
                      <button
                        type="button"
                        aria-label="Edit review"
                        onClick={() => {
                          setEditingId(review.id);
                          setComposing(false);
                          setRating(review.rating);
                          setBody(review.body);
                          setFiles([]);
                        }}
                        className="press grid size-9 place-items-center rounded-xl glass-soft"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Delete review"
                        onClick={() => deleteReview.mutate(review.id)}
                        className="press grid size-9 place-items-center rounded-xl glass-soft"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </button>
                    </>
                  )}
                  {!mine && user && (
                    <button
                      type="button"
                      aria-label="Report review"
                      onClick={() => reportReview.mutate(review.id)}
                      className="press grid size-9 place-items-center rounded-xl glass-soft"
                    >
                      <Flag className="size-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>

              {review.body && <p className="mt-3 text-sm leading-relaxed">{review.body}</p>}
              <ReviewPhotos paths={review.photos ?? []} />

              {review.owner_reply && (
                <div className="mt-4 rounded-2xl glass-soft p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-primary">
                    Reply from the salon
                  </p>
                  <p className="mt-1 text-sm leading-relaxed">{review.owner_reply}</p>
                </div>
              )}

              {isOwner && !review.owner_reply && (
                <div className="mt-4">
                  {replyFor === review.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={3}
                        maxLength={600}
                        aria-label="Your reply"
                        placeholder="Thank your guest or address their feedback…"
                        className="w-full rounded-2xl bg-card/70 p-4 text-sm outline-none ring-ring focus:ring-2"
                      />
                      <button
                        type="button"
                        onClick={() => saveReply.mutate(review.id)}
                        disabled={saveReply.isPending}
                        className="press min-h-10 w-full rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
                      >
                        Post reply
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReplyFor(review.id)}
                      className="press min-h-10 w-full rounded-2xl glass-soft text-sm font-bold"
                    >
                      Reply as the salon
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {!reviews.length && !reviewsQuery.isLoading && (
          <p className="rounded-3xl glass p-6 text-center text-sm text-muted-foreground">
            No reviews yet — be the first to share your experience.
          </p>
        )}
      </div>
    </section>
  );
}
