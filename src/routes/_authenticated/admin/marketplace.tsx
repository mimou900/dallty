import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CheckCircle2, CircleAlert, Loader2, Send, Store } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { READINESS_CHECKS, type Readiness } from "@/lib/marketplace.functions";
import { useManagedSalons } from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace approval — Dallty Business" },
      {
        name: "description",
        content:
          "Track your marketplace approval status, complete the listing requirements and submit your salon for review by the Dallty team.",
      },
      { property: "og:title", content: "Marketplace approval — Dallty Business" },
      {
        property: "og:description",
        content: "Listing requirements, approval status and verification badge for your salon.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplacePage,
});

const STATUS_COPY: Record<string, { label: string; hint: string; tone: string }> = {
  draft: {
    label: "Draft",
    hint: "Complete every requirement below, then submit for approval.",
    tone: "bg-secondary text-muted-foreground",
  },
  pending_review: {
    label: "Pending review",
    hint: "Our team is reviewing your salon. You keep full access to every feature meanwhile.",
    tone: "bg-gold/20 text-foreground",
  },
  approved: {
    label: "Approved",
    hint: "Your salon is live on the Dallty marketplace.",
    tone: "bg-primary/15 text-primary",
  },
  rejected: {
    label: "Rejected",
    hint: "Read the review note, fix what is flagged and submit again.",
    tone: "bg-destructive/15 text-destructive",
  },
  hidden: {
    label: "Hidden",
    hint: "Your salon is temporarily hidden from marketplace search.",
    tone: "bg-secondary text-muted-foreground",
  },
};

const FIX_LINKS: Partial<Record<string, { to: string; label: string }>> = {
  profile_complete: { to: "/admin/settings", label: "Salon settings" },
  logo_uploaded: { to: "/admin/settings", label: "Salon settings" },
  location_set: { to: "/admin/settings", label: "Salon settings" },
  hours_set: { to: "/admin/settings", label: "Salon settings" },
  has_service: { to: "/admin/services", label: "Services" },
  has_specialist: { to: "/admin/staff", label: "Specialists" },
  service_assigned: { to: "/admin/staff", label: "Specialists" },
  working_hours_set: { to: "/admin/availability", label: "Availability" },
  future_availability: { to: "/admin/availability", label: "Availability" },
};

function MarketplacePage() {
  const queryClient = useQueryClient();
  const salonsQuery = useManagedSalons();
  const primary = salonsQuery.data?.[0] ?? null;
  const [submitting, setSubmitting] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["salon-marketplace-status", primary?.id],
    enabled: Boolean(primary?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("salons")
        .select(
          "id, name, marketplace_status, marketplace_note, submitted_at, is_verified, verified_at, is_listed, status",
        )
        .eq("id", primary!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const readinessQuery = useQuery({
    queryKey: ["salon-readiness", primary?.id],
    enabled: Boolean(primary?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_marketplace_readiness", {
        _salon_id: primary!.id,
      });
      if (error) throw error;
      return (data?.[0] ?? null) as Readiness | null;
    },
  });

  const readiness = readinessQuery.data;
  const allReady = useMemo(
    () => Boolean(readiness) && READINESS_CHECKS.every((c) => readiness?.[c.key]),
    [readiness],
  );

  const submit = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("submit_salon_for_review", {
        _salon_id: primary!.id,
      });
      if (error) throw error;
      const row = data?.[0];
      if (!row?.ok) throw new Error(reasonCopy(row?.reason));
      return row;
    },
    onMutate: () => setSubmitting(true),
    onSettled: () => setSubmitting(false),
    onSuccess: () => {
      toast.success("Submitted for marketplace approval");
      queryClient.invalidateQueries({ queryKey: ["salon-marketplace-status"] });
      queryClient.invalidateQueries({ queryKey: ["salon-readiness"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit"),
  });

  if (!primary) {
    return (
      <p className="rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
        No salon linked to your account yet.
      </p>
    );
  }

  const salon = statusQuery.data;
  const status = salon?.marketplace_status ?? "draft";
  const copy = STATUS_COPY[status] ?? STATUS_COPY.draft;
  const canSubmit = allReady && status !== "pending_review" && status !== "approved";
  const doneCount = READINESS_CHECKS.filter((c) => readiness?.[c.key]).length;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-2">
            <Store className="size-4 text-primary" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Marketplace status
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-2xl font-extrabold">{copy.label}</p>
            <span className={`rounded-2xl px-3 py-1 text-xs font-bold ${copy.tone}`}>
              {salon?.is_listed && status === "approved" ? "Listed" : "Not listed"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{copy.hint}</p>
          {salon?.marketplace_note ? (
            <p className="mt-3 rounded-2xl bg-secondary/60 p-3 text-sm">{salon.marketplace_note}</p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            Every dashboard feature stays available regardless of approval — only marketplace
            visibility depends on it.
          </p>
        </div>

        <div className="rounded-3xl glass p-5">
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-4 text-gold" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Verification
            </p>
          </div>
          <p className="mt-2 text-2xl font-extrabold">
            {salon?.is_verified ? "Verified by Dallty" : "Not verified"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {salon?.is_verified
              ? `Badge active${salon.verified_at ? ` since ${new Date(salon.verified_at).toLocaleDateString()}` : ""}.`
              : "Verification is granted by the Dallty team and is separate from marketplace approval."}
          </p>
        </div>
      </section>

      <section className="rounded-3xl glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold">Approval requirements</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {doneCount} of {READINESS_CHECKS.length} complete · a cover image is not required.
            </p>
          </div>
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => submit.mutate()}
            className="press inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {status === "pending_review"
              ? "Awaiting review"
              : status === "approved"
                ? "Already approved"
                : "Submit for marketplace approval"}
          </button>
        </div>

        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {READINESS_CHECKS.map((c) => {
            const ok = Boolean(readiness?.[c.key]);
            const fix = FIX_LINKS[c.key];
            return (
              <li
                key={c.key}
                className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/40 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : (
                    <CircleAlert className="size-4 shrink-0 text-gold" />
                  )}
                  <span className="truncate">{c.label}</span>
                </span>
                {!ok && fix ? (
                  <Link to={fix.to} className="shrink-0 text-xs font-bold text-primary underline">
                    {fix.label}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function reasonCopy(reason?: string | null) {
  switch (reason) {
    case "incomplete":
      return "Complete every requirement before submitting.";
    case "already_submitted":
      return "This salon is already submitted or approved.";
    case "forbidden":
      return "You cannot submit this salon.";
    default:
      return "Could not submit for approval.";
  }
}
