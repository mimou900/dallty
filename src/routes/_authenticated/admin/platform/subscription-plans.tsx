import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  listSubscriptionPlansAdmin,
  recordSubscriptionPayment,
  updateSubscriptionSettings,
  upsertSubscriptionPlan,
} from "@/lib/subscription.functions";

export const Route = createFileRoute("/_authenticated/admin/platform/subscription-plans")({
  head: () => ({
    meta: [
      { title: "Subscription Plans — Dallty Platform" },
      {
        name: "description",
        content: "Configure plan pricing, limits, trial and grace periods, and feature entitlements.",
      },
    ],
  }),
  component: SubscriptionPlansPage,
});

type PlanRow = {
  plan_key: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  trial_duration_days: number;
  grace_period_days: number;
  staff_limit: number | null;
  branch_limit: number | null;
  monthly_booking_limit: number | null;
  customer_limit: number | null;
  advertising_eligible: boolean;
  is_active: boolean;
  is_provisional: boolean;
};

function numOrNull(v: string): number | null {
  const trimmed = v.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function PlanEditor({ plan, onSaved }: { plan: PlanRow; onSaved: () => void }) {
  const [form, setForm] = useState(plan);
  const upsert = useServerFn(upsertSubscriptionPlan);
  const mutation = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          planKey: form.plan_key,
          name: form.name,
          monthlyPrice: Number(form.monthly_price),
          yearlyPrice: Number(form.yearly_price),
          currency: form.currency,
          trialDurationDays: Number(form.trial_duration_days),
          gracePeriodDays: Number(form.grace_period_days),
          staffLimit: form.staff_limit,
          branchLimit: form.branch_limit,
          monthlyBookingLimit: form.monthly_booking_limit,
          customerLimit: form.customer_limit,
          advertisingEligible: form.advertising_eligible,
          isActive: form.is_active,
          isProvisional: form.is_provisional,
        },
      }),
    onSuccess: () => {
      toast.success(`${form.name} saved`);
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const field = "min-h-9 w-full rounded-xl bg-card/70 px-2 text-sm";

  return (
    <div className="rounded-3xl glass p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-extrabold">{form.plan_key}</h3>
          {form.is_provisional && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-600">
              Provisional
            </span>
          )}
          {!form.is_active && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
              Inactive
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="press flex min-h-9 items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {mutation.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          Save
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="text-xs font-bold">
          Name
          <input
            className={field}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="text-xs font-bold">
          Currency
          <input
            className={field}
            value={form.currency}
            maxLength={3}
            onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="text-xs font-bold">
          Monthly price
          <input
            className={field}
            type="number"
            min={0}
            value={form.monthly_price}
            onChange={(e) => setForm({ ...form, monthly_price: Number(e.target.value) })}
          />
        </label>
        <label className="text-xs font-bold">
          Yearly price
          <input
            className={field}
            type="number"
            min={0}
            value={form.yearly_price}
            onChange={(e) => setForm({ ...form, yearly_price: Number(e.target.value) })}
          />
        </label>
        <label className="text-xs font-bold">
          Trial (days)
          <input
            className={field}
            type="number"
            min={0}
            value={form.trial_duration_days}
            onChange={(e) => setForm({ ...form, trial_duration_days: Number(e.target.value) })}
          />
        </label>
        <label className="text-xs font-bold">
          Grace period (days)
          <input
            className={field}
            type="number"
            min={0}
            value={form.grace_period_days}
            onChange={(e) => setForm({ ...form, grace_period_days: Number(e.target.value) })}
          />
        </label>
        <label className="text-xs font-bold">
          Staff limit (blank = unlimited)
          <input
            className={field}
            type="number"
            min={0}
            value={form.staff_limit ?? ""}
            onChange={(e) => setForm({ ...form, staff_limit: numOrNull(e.target.value) })}
          />
        </label>
        <label className="text-xs font-bold">
          Branch limit (blank = unlimited)
          <input
            className={field}
            type="number"
            min={0}
            value={form.branch_limit ?? ""}
            onChange={(e) => setForm({ ...form, branch_limit: numOrNull(e.target.value) })}
          />
        </label>
        <label className="text-xs font-bold">
          Monthly booking limit
          <input
            className={field}
            type="number"
            min={0}
            value={form.monthly_booking_limit ?? ""}
            onChange={(e) => setForm({ ...form, monthly_booking_limit: numOrNull(e.target.value) })}
          />
        </label>
        <label className="text-xs font-bold">
          Customer limit
          <input
            className={field}
            type="number"
            min={0}
            value={form.customer_limit ?? ""}
            onChange={(e) => setForm({ ...form, customer_limit: numOrNull(e.target.value) })}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={form.advertising_eligible}
            onChange={(e) => setForm({ ...form, advertising_eligible: e.target.checked })}
          />
          Advertising eligible
        </label>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          Active (selectable)
        </label>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={form.is_provisional}
            onChange={(e) => setForm({ ...form, is_provisional: e.target.checked })}
          />
          Provisional pricing
        </label>
      </div>
    </div>
  );
}

/**
 * Manual payment recording — TEMPORARY mechanism (no real payment gateway is configured for
 * Dallty subscriptions). Business ID is pasted in from /admin/platform/businesses rather than
 * a searchable picker, matching the pace of the other admin utilities built this project —
 * functional, not polished, and the search shouldn't be over-built ahead of real usage volume.
 */
function RecordPaymentPanel() {
  const record = useServerFn(recordSubscriptionPayment);
  const [businessId, setBusinessId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("DZD");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      record({
        data: { businessId, amount: Number(amount), currency, notes: notes || undefined },
      }),
    onSuccess: (r) => {
      toast.success(
        r.isFirstPayment
          ? `Payment recorded — first payment (affiliate: ${r.triggers.affiliateFired ? "fired" : "n/a"}, referral: ${r.triggers.businessReferralFired ? "fired" : "n/a"})`
          : "Payment recorded",
      );
      setAmount("");
      setNotes("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not record payment"),
  });

  return (
    <div className="rounded-3xl glass space-y-3 p-4">
      <div>
        <h2 className="text-base font-extrabold">Record a subscription payment</h2>
        <p className="text-xs text-muted-foreground">
          TEMPORARY manual mechanism — confirms money that changed hands off-platform. Never
          presented to businesses as an automated payment gateway.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <input
          className="min-h-9 rounded-xl bg-card/70 px-2 text-sm sm:col-span-2"
          placeholder="Business ID (uuid)"
          value={businessId}
          onChange={(e) => setBusinessId(e.target.value)}
        />
        <input
          className="min-h-9 rounded-xl bg-card/70 px-2 text-sm"
          type="number"
          min={0}
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="min-h-9 rounded-xl bg-card/70 px-2 text-sm"
          maxLength={3}
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
        <input
          className="min-h-9 rounded-xl bg-card/70 px-2 text-sm sm:col-span-3"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !businessId || !amount}
          className="press flex min-h-9 items-center justify-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
          Record payment
        </button>
      </div>
    </div>
  );
}

function SubscriptionPlansPage() {
  const { hasRole } = useAuth();
  const isSuper = hasRole("super_admin");
  const queryClient = useQueryClient();
  const listPlans = useServerFn(listSubscriptionPlansAdmin);
  const updateSettings = useServerFn(updateSubscriptionSettings);

  const plansQuery = useQuery({
    queryKey: ["admin-subscription-plans"],
    enabled: isSuper,
    queryFn: () => listPlans(),
  });

  const settingsQuery = useQuery({
    queryKey: ["admin-subscription-settings"],
    enabled: isSuper,
    queryFn: async () => {
      const { data, error } = await supabase.from("subscription_settings").select("*").single();
      if (error) throw error;
      return data;
    },
  });

  const [rewardPercent, setRewardPercent] = useState<string>("");
  const currentPercent = settingsQuery.data?.business_referral_reward_percent;

  const settingsMutation = useMutation({
    mutationFn: () =>
      updateSettings({ data: { businessReferralRewardPercent: Number(rewardPercent) } }),
    onSuccess: () => {
      toast.success("Referral reward setting saved");
      queryClient.invalidateQueries({ queryKey: ["admin-subscription-settings"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const plans = useMemo(() => plansQuery.data ?? [], [plansQuery.data]);

  if (!isSuper) {
    return <p className="p-6 text-sm text-muted-foreground">Super Admin only.</p>;
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-extrabold">Subscription Plans</h1>
        <p className="text-sm text-muted-foreground">
          Every commercial value here is data, not code — editable at any time, no deploy needed.
          Prices marked "Provisional" are placeholder values pending final commercial decisions.
        </p>
      </div>

      {plansQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <PlanEditor
              key={p.plan_key}
              plan={p as PlanRow}
              onSaved={() => queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] })}
            />
          ))}
        </div>
      )}

      <RecordPaymentPanel />

      <div className="rounded-3xl glass p-4">
        <h2 className="text-base font-extrabold">Business referral reward</h2>
        <p className="text-xs text-muted-foreground">
          Percentage of a referred business's first subscription payment credited to the
          referring business's Dallty balance, when a business-to-business referral converts
          automatically.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            className="min-h-9 w-32 rounded-xl bg-card/70 px-2 text-sm"
            placeholder={currentPercent !== undefined ? String(currentPercent) : "10"}
            value={rewardPercent}
            onChange={(e) => setRewardPercent(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">%</span>
          <button
            type="button"
            onClick={() => settingsMutation.mutate()}
            disabled={settingsMutation.isPending || rewardPercent === ""}
            className="press flex min-h-9 items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {settingsMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
