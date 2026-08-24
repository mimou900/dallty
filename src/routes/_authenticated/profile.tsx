import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { signedUrl, uploadTo } from "@/lib/storage";
import { SERVICE_CATEGORIES } from "@/lib/admin";
import { ClientShell } from "@/components/dallty/client-shell";
import { AccountSecurity } from "@/components/dallty/account-security";

const HAIR_TYPES = ["Straight", "Wavy", "Curly", "Coily"];
const SKIN_TYPES = ["Normal", "Dry", "Oily", "Combination", "Sensitive"];
const GENDERS = ["Female", "Male", "Prefer not to say"];

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

function Field({ children, title }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold">{title}</p>
      {children}
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
    setUploading(true);
    try {
      const path = await uploadTo("avatars", user.id, file);
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

  return (
    <ClientShell
      title="Your profile"
      subtitle="Keep your details and preferences up to date."
      width="max-w-2xl"
    >
      <section className="mt-6 flex items-center gap-4 rounded-3xl glass p-5">
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Your profile photo"
              className="size-20 rounded-3xl object-cover"
            />
          ) : (
            <div className="grid size-20 place-items-center rounded-3xl bg-primary/15 text-xl font-extrabold text-primary">
              {initials}
            </div>
          )}
          <label className="press absolute -bottom-1 -end-1 grid size-9 cursor-pointer place-items-center rounded-2xl bg-primary text-primary-foreground">
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Camera className="size-4" />
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
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">{form.full_name || "Add your name"}</p>
          <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="mt-5 space-y-5 rounded-3xl glass p-5"
      >
        <Field title="Full name">
          <input
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            maxLength={100}
            className="min-h-11 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field title="Birthday">
            <input
              type="date"
              value={form.birthday}
              onChange={(e) => setForm({ ...form, birthday: e.target.value })}
              max={new Date().toISOString().slice(0, 10)}
              className="min-h-11 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
            />
          </Field>
          <Field title="Gender">
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
              className="min-h-11 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
            >
              <option value="">Not set</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field title="Hair type">
            <select
              value={form.hair_type}
              onChange={(e) => setForm({ ...form, hair_type: e.target.value })}
              className="min-h-11 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
            >
              <option value="">Not set</option>
              {HAIR_TYPES.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </Field>
          <Field title="Skin type">
            <select
              value={form.skin_type}
              onChange={(e) => setForm({ ...form, skin_type: e.target.value })}
              className="min-h-11 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
            >
              <option value="">Not set</option>
              {SKIN_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field title="Allergies">
          <textarea
            value={form.allergies}
            onChange={(e) => setForm({ ...form, allergies: e.target.value })}
            maxLength={300}
            rows={2}
            placeholder="e.g. fragrance, latex, certain dyes — shared with the salon at booking"
            className="w-full resize-none rounded-2xl bg-card/70 px-4 py-3 text-base outline-none ring-ring focus:ring-2"
          />
        </Field>

        <Field title="Beauty notes">
          <textarea
            value={form.beauty_notes}
            onChange={(e) => setForm({ ...form, beauty_notes: e.target.value })}
            maxLength={300}
            rows={2}
            placeholder="Anything a specialist should know before your visit"
            className="w-full resize-none rounded-2xl bg-card/70 px-4 py-3 text-base outline-none ring-ring focus:ring-2"
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
                      : "bg-card/70 text-foreground ring-1 ring-border"
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
          className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save profile
        </button>
      </form>

      <div className="mt-5">
        <AccountSecurity />
      </div>
    </ClientShell>
  );
}
