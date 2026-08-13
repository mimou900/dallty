import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { signedUrl, uploadTo } from "@/lib/storage";
import { PhoneField, type PhoneFieldValue } from "@/components/dallty/phone-field";
import { guessCountryCode, splitE164, toE164 } from "@/lib/phone";
import { countryByCode } from "@/lib/countries";
import { ClientShell } from "@/components/dallty/client-shell";
import { AccountSecurity } from "@/components/dallty/account-security";

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
  const [phone, setPhone] = useState<PhoneFieldValue>({
    countryCode: guessCountryCode(),
    national: "",
  });
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
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
      phone: profile.phone ?? "",
    });

    setPhone(
      profile.phone
        ? splitE164(profile.phone)
        : { countryCode: guessCountryCode(profile.country_code), national: "" },
    );
    signedUrl("avatars", profile.avatar_url).then(setAvatarUrl);
  }, [profile]);

  const phoneE164 = toE164(countryByCode(phone.countryCode).dial, phone.national);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name.trim(),
          phone: phoneE164 || null,
          country_code: phone.countryCode,
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
      const { error } = await supabase.from("profiles").update({ avatar_url: path }).eq("id", user.id);
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
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
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

        <PhoneField id="profile-phone" value={phone} onChange={setPhone} label="Phone" />


        <button
          type="submit"
          disabled={save.isPending}
          className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save profile
        </button>
      </form>

      <div className="mt-5">
        <AccountSecurity />
      </div>
    </ClientShell>
  );
}
