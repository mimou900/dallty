import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { money, useManagedBusinesses } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelSubscription,
  changeSubscriptionPlan,
  getMySubscription,
  reactivateSubscription,
} from "@/lib/subscription.functions";

export const Route = createFileRoute("/_authenticated/admin/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Subscription — Dallty Business" },
      {
        name: "description",
        content: "Your current plan, usage against plan limits, and billing history.",
      },
    ],
  }),
  component: BillingPage,
});

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  active: "Active",
  past_due: "Payment overdue — grace period",
  canceled: "Canceled",
  expired: "Expired",
};

function LimitRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold">
        <span>{label}</span>
        <span className="text-muted-foreground">{limit === null ? `${used} · Unlimited` : `${used} / ${limit}`}</span>
      </div>
      {limit !== null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full ${pct >= 100 ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function BillingPage() {
  const businessesQuery = useManagedBusinesses();
  const businessId = businessesQuery.data?.[0]?.id;
  const queryClient = useQueryClient();

  const getSub = useServerFn(getMySubscription);
  const changePlan = useServerFn(changeSubscriptionPlan);
  const cancel = useServerFn(cancelSubscription);
  const reactivate = useServerFn(reactivateSubscription);

  const subQuery = useQuery({
    queryKey: ["admin-billing", businessId],
    enabled: !!businessId,
    queryFn: () => getSub({ data: { businessId: businessId! } }),
  });

  const plansQuery = useQuery({
    queryKey: ["subscription-plans-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-billing", businessId] });

  const changeMutation = useMutation({
    mutationFn: (planKey: string) => changePlan({ data: { businessId: businessId!, planKey } }),
    onSuccess: (r) => {
      toast.success(r.eventType === "upgraded" ? "Plan upgraded" : "Plan changed");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not change plan"),
    onSettled: () => setPendingPlan(null),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancel({ data: { businessId: businessId!, immediately: false } }),
    onSuccess: () => {
      toast.success("Subscription will cancel at the end of the current period");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not cancel"),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivate({ data: { businessId: businessId! } }),
    onSuccess: () => {
      toast.success("Cancellation undone");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reactivate"),
  });

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);

  if (subQuery.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }
  if (subQuery.isError) {
    return (
      <p className="rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        You don't have access to this business's billing.
      </p>
    );
  }

  const sub = subQuery.data?.subscription;
  const entitlements = subQuery.data?.entitlements;
  const usage = subQuery.data?.usage;

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-extrabold">Billing & Subscription</h1>
        <p className="text-sm text-muted-foreground">
          Manual billing for now — no automated payment gateway is connected yet. Contact Dallty
          to record a payment or change your plan if you need it faster than self-serve.
        </p>
      </div>

      {sub && (
        <div className="rounded-3xl glass p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold capitalize">{sub.plan_key} plan</h2>
              <p className="text-xs text-muted-foreground">{STATUS_LABEL[sub.status] ?? sub.status}</p>
            </div>
            {sub.status === "trialing" && sub.trial_ends_at && (
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                Trial ends {new Date(sub.trial_ends_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {sub.current_period_end && (
            <p className="mt-2 text-xs text-muted-foreground">
              Current period ends {new Date(sub.current_period_end).toLocaleDateString()}
              {sub.cancel_at_period_end && " — will not renew"}
            </p>
          )}

          {sub.cancel_at_period_end ? (
            <button
              type="button"
              onClick={() => reactivateMutation.mutate()}
              disabled={reactivateMutation.isPending}
              className="press mt-3 min-h-9 rounded-2xl bg-secondary px-4 text-xs font-bold disabled:opacity-60"
            >
              Undo cancellation
            </button>
          ) : (
            sub.status !== "canceled" &&
            sub.status !== "expired" && (
              <button
                type="button"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="press mt-3 min-h-9 rounded-2xl bg-destructive/10 px-4 text-xs font-bold text-destructive disabled:opacity-60"
              >
                Cancel at period end
              </button>
            )
          )}
        </div>
      )}

      {entitlements && usage && (
        <div className="rounded-3xl glass space-y-3 p-4">
          <h2 className="text-base font-extrabold">Plan usage</h2>
          <LimitRow label="Staff" used={usage.staffCount} limit={entitlements.staffLimit} />
          <LimitRow label="Branches" used={usage.branchCount} limit={entitlements.branchLimit} />
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-base font-extrabold">Available plans</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {plans.map((p) => {
            const isCurrent = p.plan_key === sub?.plan_key;
            return (
              <div key={p.plan_key} className="rounded-3xl glass p-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold">{p.name}</h3>
                  {p.is_provisional && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
                      Provisional
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-extrabold">
                  {money(p.monthly_price, p.currency)}
                  <span className="text-xs font-semibold text-muted-foreground"> /mo</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.staff_limit ? `${p.staff_limit} staff` : "Unlimited staff"} ·{" "}
                  {p.branch_limit ? `${p.branch_limit} branches` : "Unlimited branches"}
                </p>
                <button
                  type="button"
                  disabled={isCurrent || changeMutation.isPending}
                  onClick={() => {
                    setPendingPlan(p.plan_key);
                    changeMutation.mutate(p.plan_key);
                  }}
                  className="press mt-3 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  {changeMutation.isPending && pendingPlan === p.plan_key && (
                    <Loader2 className="size-3.5 animate-spin" />
                  )}
                  {isCurrent ? "Current plan" : "Switch to this plan"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
