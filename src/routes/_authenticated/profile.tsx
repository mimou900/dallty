import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Camera, Loader2, Plus, Save, Star, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { signedUrl, uploadTo } from "@/lib/storage";
import { prepareImageForUpload } from "@/lib/image-upload";
import { SERVICE_CATEGORIES } from "@/lib/admin";
import { ClientShell } from "@/components/dallty/client-shell";
import { AccountSecurity } from "@/components/dallty/account-security";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/dallty/select";

const HAIR_TYPES = ["Straight", "Wavy", "Curly", "Coily"];
const SKIN_TYPES = ["Normal", "Dry", "Oily", "Combination", "Sensitive"];
const GENDERS = ["Female", "Male", "Prefer not to say"];
// Common salon-relevant allergens shown as one-tap chips; a person can still add anything
// else by typing it — allergies stays the same free-text `profiles.allergies` column
// (comma-joined here), no schema change needed for the nicer chip UI.
const COMMON_ALLERGENS = ["Fragrance", "Latex", "Nickel", "Sulfates", "Parabens", "Essential oils"];
/** Radix Select can't take an empty-string item value, so "no selection" needs a sentinel. */
const UNSET = "__unset__";

const fieldInputClass =
  "min-h-12 w-full rounded-2xl border border-border bg-card px-4 text-base text-foreground outline-none ring-ring transition-shadow placeholder:text-muted-foreground focus:border-primary/30 focus:ring-2";
const selectTriggerClass = "border border-border bg-card";

function numberFormat(n: number) {
  return new Intl.NumberFormat("en").format(n);
}

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Your beauty profile — Dallty" },
      {
        name: "description",
        content:
          "Keep your details, hair and skin type, allergies and language preferences up to date so every salon visit is tailored to you.",
      },
      { property: "og:title", content: "Your beauty profile — Dallty" },
      {
        property: "og:description",
        content: "Personalise your Dallty profile for tailored salon recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

/** Single tapered ray, pointing up from the origin — echoes the pin mark's flick accent. */
const RAY_PATH = "M0,0 C-16,-22 -19,-62 -5,-88 Q0,-96 5,-88 C19,-62 16,-22 0,0 Z";

/** Large ambient glow behind the wallet card content — blurred into a soft backdrop
 *  rather than shown as crisp shapes. */
function BrandBurst({ className }: { className?: string }) {
  return (
    <svg viewBox="-100 -100 200 200" className={className} aria-hidden>
      <defs>
        <linearGradient
          id="wallet-burst"
          x1="0"
          y1="0"
          x2="0"
          y2="-100"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="var(--lime)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--lime)" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {[-52, -22, 3, 28, 58].map((angle, i) => (
        <path
          key={angle}
          transform={`rotate(${angle}) scale(${[0.78, 1, 0.88, 0.7, 0.92][i]})`}
          d={RAY_PATH}
          fill="url(#wallet-burst)"
        />
      ))}
    </svg>
  );
}

/** Balance + loyalty — the page's flagship card. Sized off its own container width
 *  (not the viewport) via @container, since it renders full-width on mobile but in a
 *  narrow sidebar column on desktop: at @xs+ (~320px available) the two stats sit
 *  side by side with a divider; below that they stack full-width, never squeezed. */
function WalletCard() {
  return (
    <section className="@container relative overflow-hidden rounded-4xl bg-(image:--gradient-primary) p-5 text-primary-foreground shadow-elevation-high @sm:p-7">
      <BrandBurst className="pointer-events-none absolute -start-14 -bottom-16 size-64 opacity-70 blur-2xl @sm:size-72" />
      <BrandBurst className="pointer-events-none absolute -end-20 top-0 size-48 rotate-[42deg] opacity-50 blur-2xl" />

      <div className="relative grid grid-cols-1 gap-4 @xs:grid-cols-2 @xs:gap-0">
        <div className="flex items-start gap-2.5 border-b border-primary-foreground/15 pb-4 @xs:border-b-0 @xs:border-e @xs:pb-0 @xs:pe-4 @sm:gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-foreground/10 @sm:size-11">
            <Wallet className="size-4.5 text-lime @sm:size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-primary-foreground/80">
              Balance
            </p>
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-background @sm:text-2xl">
                {numberFormat(0)}
              </span>
              <span className="text-[0.65rem] font-extrabold text-lime">DZD</span>
            </p>
            <p className="mt-1 text-[0.65rem] leading-snug text-primary-foreground/70">
              Available balance
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5 @xs:ps-4 @sm:gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-foreground/10 @sm:size-11">
            <Star className="size-4.5 text-pink @sm:size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider text-primary-foreground/80">
              Loyalty points
            </p>
            <p className="mt-0.5 flex items-baseline gap-1">
              <span className="text-xl font-extrabold text-background @sm:text-2xl">
                {numberFormat(0)}
              </span>
              <span className="text-[0.65rem] font-extrabold text-pink">PTS</span>
            </p>
            <p className="mt-1 text-[0.65rem] leading-snug text-primary-foreground/70">
              Keep booking, get rewarded!
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex justify-center">
        <button
          type="button"
          onClick={() => toast.info("Rewards are coming soon.")}
          className="press flex items-center gap-1.5 rounded-full border border-lime/40 px-4 py-2 text-xs font-bold text-lime"
        >
          View rewards
          <ArrowRight className="size-3.5 rtl:rotate-180" />
        </button>
      </div>
    </section>
  );
}

function Field({ children, title }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold">{title}</p>
      {children}
    </div>
  );
}

/** Section eyebrow shared by Personal information and every AccountSecurity block, so the
 *  settings half of the page reads as one consistent list rather than mismatched cards. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{children}</h2>
  );
}

/** Multi-select chips over the existing free-text `allergies` column (comma-joined) — keeps
 *  the current data model (no migration) while presenting the "pick or type, then remove
 *  with ×" interaction the redesign calls for. */
function AllergiesField({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const selected = useMemo(
    () =>
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [value],
  );
  const [draft, setDraft] = useState("");

  function commit(next: string[]) {
    onChange(next.join(", "));
  }

  function addCustom() {
    const v = draft.trim();
    if (!v) return;
    if (!selected.includes(v)) commit([...selected, v]);
    setDraft("");
  }

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-2">
          {selected.map((item) => (
            <span
              key={item}
              className="flex items-center gap-1.5 rounded-full border border-rose/25 bg-rose/15 py-1.5 pe-2 ps-3 text-xs font-bold text-rose-foreground"
            >
              {item}
              <button
                type="button"
                onClick={() => commit(selected.filter((s) => s !== item))}
                aria-label={`Remove ${item}`}
                className="grid size-4 place-items-center rounded-full hover:bg-rose/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {COMMON_ALLERGENS.filter((a) => !selected.includes(a)).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => commit([...selected, a])}
            className="press flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          >
            <Plus className="size-3" />
            {a}
          </button>
        ))}
      </div>

      <div className="mt-2.5 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add another — e.g. a specific dye"
          aria-label="Add another allergy"
          maxLength={60}
          className={fieldInputClass}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!draft.trim()}
          className="press shrink-0 rounded-2xl border border-border bg-card px-4 text-sm font-bold disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    hair_type: "",
    skin_type: "",
    allergies: "",
    beauty_notes: "",
    birthday: "",
    gender: "",
    favorite_categories: [] as string[],
  });

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const profile = profileQuery.data;

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profile.full_name ?? "",
      hair_type: profile.hair_type ?? "",
      skin_type: profile.skin_type ?? "",
      allergies: profile.allergies ?? "",
      beauty_notes: profile.beauty_notes ?? "",
      birthday: profile.birthday ?? "",
      gender: profile.gender ?? "",
      favorite_categories: profile.favorite_categories ?? [],
    });
    signedUrl("avatars", profile.avatar_url).then(setAvatarUrl);
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim(),
          hair_type: form.hair_type || null,
          skin_type: form.skin_type || null,
          allergies: form.allergies.trim() || null,
          beauty_notes: form.beauty_notes.trim() || null,
          birthday: form.birthday || null,
          gender: form.gender || null,
          favorite_categories: form.favorite_categories,
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save"),
  });

  async function handleAvatar(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose a photo");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toast.error("That photo is too large — try one under 30MB");
      return;
    }
    setUploading(true);
    try {
      const optimized = await prepareImageForUpload(file, { maxDimension: 1024 });
      const path = await uploadTo("avatars", user.id, optimized);
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: path })
        .eq("id", user.id);
      if (error) throw error;
      setAvatarUrl(await signedUrl("avatars", path));
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Photo updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const initials = useMemo(
    () =>
      (form.full_name || user?.email || "?")
        .split(" ")
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase(),
    [form.full_name, user?.email],
  );

  // "2 of 5 details completed" — the five core fields the redesign's profile-completion
  // card tracks. Beauty notes/allergies/favorite categories are real, saved fields too,
  // just not part of this headline fraction.
  const completionFields = [
    form.full_name,
    form.birthday,
    form.gender,
    form.hair_type,
    form.skin_type,
  ];
  const completedCount = completionFields.filter(Boolean).length;
  const totalFields = completionFields.length;
  const completionPct = Math.round((completedCount / totalFields) * 100);

  return (
    <ClientShell
      title="Your profile"
      subtitle="Keep your details and preferences up to date."
      width="max-w-5xl"
      surface="cream"
    >
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start lg:gap-8">
        {/* Left column (desktop): identity, rewards. Stacks above everything on mobile. */}
        <div className="space-y-6 lg:sticky lg:top-24">
          <WalletCard />

          <section className="rounded-4xl border border-border/60 bg-card p-5 shadow-elevation-low sm:p-6">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Your profile photo"
                    className="size-16 rounded-3xl object-cover sm:size-[4.5rem]"
                  />
                ) : (
                  <div className="grid size-16 place-items-center rounded-3xl bg-primary/15 text-lg font-extrabold text-primary sm:size-[4.5rem]">
                    {initials}
                  </div>
                )}
                <label className="press absolute -bottom-1 -end-1 grid size-8 cursor-pointer place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elevation-low">
                  {uploading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Camera className="size-3.5" />
                  )}
                  <span className="sr-only">Upload a profile photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleAvatar(file);
                    }}
                  />
                </label>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-h3 truncate">
                  {completedCount === totalFields ? "Your profile" : "Complete your profile"}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {completedCount} of {totalFields} details completed
                </p>
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-lime transition-[width] duration-500"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>
            </div>

            {completedCount < totalFields && (
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("personal-info")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className="press mt-4 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary/8 text-sm font-bold text-primary"
              >
                Complete profile
                <ArrowRight className="size-4 rtl:rotate-180" />
              </button>
            )}
          </section>
        </div>

        {/* Right column (desktop): personal information and account settings. */}
        <div className="space-y-6">
          <form
            id="personal-info"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="scroll-mt-24 space-y-5 rounded-4xl border border-border/60 bg-card p-5 shadow-elevation-low sm:p-6"
          >
            <SectionLabel>Personal information</SectionLabel>

            <Field title="Full name">
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                maxLength={100}
                placeholder="Your name"
                className={fieldInputClass}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field title="Birthday">
                <div className="relative">
                  <input
                    type="date"
                    value={form.birthday}
                    onChange={(e) => setForm({ ...form, birthday: e.target.value })}
                    max={new Date().toISOString().slice(0, 10)}
                    className={fieldInputClass}
                  />
                </div>
              </Field>
              <Field title="Gender">
                <Select
                  value={form.gender || UNSET}
                  onValueChange={(v) => setForm({ ...form, gender: v === UNSET ? "" : v })}
                >
                  <SelectTrigger className={selectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>Not set</SelectItem>
                    {GENDERS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field title="Hair type">
                <Select
                  value={form.hair_type || UNSET}
                  onValueChange={(v) => setForm({ ...form, hair_type: v === UNSET ? "" : v })}
                >
                  <SelectTrigger className={selectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>Not set</SelectItem>
                    {HAIR_TYPES.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field title="Skin type">
                <Select
                  value={form.skin_type || UNSET}
                  onValueChange={(v) => setForm({ ...form, skin_type: v === UNSET ? "" : v })}
                >
                  <SelectTrigger className={selectTriggerClass}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNSET}>Not set</SelectItem>
                    {SKIN_TYPES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field title="Allergies">
              <AllergiesField
                value={form.allergies}
                onChange={(v) => setForm({ ...form, allergies: v })}
              />
            </Field>

            <Field title="Beauty notes">
              <textarea
                value={form.beauty_notes}
                onChange={(e) => setForm({ ...form, beauty_notes: e.target.value })}
                maxLength={300}
                rows={2}
                placeholder="Anything a specialist should know before your visit"
                className={`${fieldInputClass} resize-none py-3`}
              />
            </Field>

            <Field title="I'm usually looking for">
              <div className="flex flex-wrap gap-2">
                {SERVICE_CATEGORIES.map((cat) => {
                  const active = form.favorite_categories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setForm({
                          ...form,
                          favorite_categories: active
                            ? form.favorite_categories.filter((c) => c !== cat)
                            : [...form.favorite_categories, cat],
                        })
                      }
                      className={`press rounded-full px-3.5 py-2 text-sm font-semibold capitalize ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "border border-border bg-card text-foreground"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </Field>

            <button
              type="submit"
              disabled={save.isPending}
              className="press flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save profile
            </button>
          </form>

          <AccountSecurity />
        </div>
      </div>
    </ClientShell>
  );
}
