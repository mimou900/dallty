import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Scissors, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ensureSessionAfterSignUp } from "@/lib/auth-session";
import { PasswordStrength, isPasswordStrong } from "@/components/dallty/password-strength";
import { checkSignupPassword } from "@/lib/account.functions";
import { checkEmailDomainAllowed } from "@/lib/email-trust.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/dallty/select";

/** Radix Select can't take an empty-string item value, so "no selection" needs a sentinel. */
const UNSET = "__unset__";

export const Route = createFileRoute("/staff/signup")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Join a business team — Dallty for specialists" },
      {
        name: "description",
        content:
          "Create your Dallty specialist account, pick the business you work at and request access to your own appointment dashboard.",
      },
      { property: "og:title", content: "Join a business team — Dallty for specialists" },
      {
        property: "og:description",
        content: "Specialist sign-up: manage your appointments and working hours on Dallty.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffSignupPage,
});

function StaffSignupPage() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Shell>
    );
  return <Shell>{user ? <JoinPanel /> : <AccountPanel />}</Shell>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <Link to="/" className="text-sm font-bold text-muted-foreground">
        ← Back to Dallty
      </Link>
      <div className="mt-4 rounded-3xl glass p-6">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary">
          <Sparkles className="size-4" /> For specialists
        </p>
        <h1 className="mt-2 text-2xl font-extrabold">Join your business on Dallty</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create an account, choose where you work and the owner approves you. Already invited by
          your business? Use the link in your email instead.
        </p>
        <div className="mt-5">{children}</div>
      </div>
    </main>
  );
}

function AccountPanel() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Enter your full name");
    setBusy(true);
    const check = await checkSignupPassword({ data: { password, accountType: "privileged" } });
    if (!check.valid) {
      setBusy(false);
      return toast.error(check.errors[0] ?? "Password does not meet requirements");
    }
    const emailCheck = await checkEmailDomainAllowed({ data: { email: email.trim() } });
    if (!emailCheck.allowed) {
      setBusy(false);
      return toast.error("Please use a valid email address that you can keep access to.");
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/staff/signup`,
        data: { full_name: fullName.trim(), role: "client" },
      },
    });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    const session = await ensureSessionAfterSignUp(email.trim(), password, data.session);
    setBusy(false);
    if (!session) {
      setSent(true);
      return;
    }
    toast.success("Account created — now pick your business");
  }

  if (sent)
    return (
      <p className="rounded-2xl glass-soft p-4 text-sm font-medium">
        Check your inbox and confirm your email, then come back to this page to pick your business.
      </p>
    );

  return (
    <form onSubmit={submit} className="grid gap-3" method="post" action="#">
      <label className="text-sm font-bold" htmlFor="staff-full-name">
        Full name
        <input
          id="staff-full-name"
          name="name"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
          placeholder="Layla Hassan"
        />
      </label>
      <label className="text-sm font-bold" htmlFor="staff-email">
        Work email
        <input
          id="staff-email"
          name="username"
          autoComplete="username"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
          placeholder="you@salon.com"
        />
      </label>
      <label className="text-sm font-bold" htmlFor="staff-password">
        Password
        <input
          id="staff-password"
          name="new-password"
          autoComplete="new-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
          placeholder="At least 8 characters"
        />
      </label>
      <PasswordStrength value={password} policy="privileged" />
      <button
        type="submit"
        disabled={busy || !isPasswordStrong(password, "privileged")}
        className="press flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
      >
        {busy && <Loader2 className="size-4 animate-spin" />} Create specialist account
      </button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/auth" className="font-bold text-primary">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function JoinPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [businessId, setBusinessId] = useState("");
  const [title, setTitle] = useState("Stylist");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const businesses = useQuery({
    queryKey: ["joinable-businesses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("businesses")
        .select("id, name, city, area")
        .eq("status", "approved")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const myRequests = useQuery({
    queryKey: ["my-staff-requests", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_join_requests")
        .select("id, status, created_at, business_id, businesses(name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const myStaffRow = useQuery({
    queryKey: ["my-staff-row", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, business_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const pending = useMemo(
    () => (myRequests.data ?? []).filter((r) => r.status === "pending"),
    [myRequests.data],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!businessId) throw new Error("Pick the business you work at");
      const { error } = await supabase.from("staff_join_requests").insert({
        user_id: user!.id,
        business_id: businessId,
        full_name: user!.user_metadata?.full_name || user!.email || "Specialist",
        title: title.trim() || "Specialist",
        phone: phone.trim() || null,
        message: message.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request sent — the business owner will review it");
      void myRequests.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send request"),
  });

  if (myStaffRow.data)
    return (
      <div className="grid gap-3">
        <p className="rounded-2xl glass-soft p-4 text-sm font-medium">
          You are already part of a team on Dallty.
        </p>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin/my-appointments" })}
          className="press min-h-11 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground"
        >
          Open my dashboard
        </button>
      </div>
    );

  return (
    <div className="grid gap-4">
      {(myRequests.data ?? []).length > 0 && (
        <div className="grid gap-2">
          {(myRequests.data ?? []).map((r) => (
            <div key={r.id} className="rounded-2xl glass-soft px-4 py-3 text-sm font-medium">
              <span className="font-bold">
                {(r.businesses as { name?: string } | null)?.name ?? "Business"}
              </span>{" "}
              — {r.status}
            </div>
          ))}
        </div>
      )}

      {pending.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Your request is waiting for the owner. You will get a notification once it is reviewed.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
          className="grid gap-3"
        >
          <label className="text-sm font-bold">
            Business you work at
            <Select
              value={businessId || UNSET}
              onValueChange={(v) => setBusinessId(v === UNSET ? "" : v)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a business…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET} disabled>
                  Select a business…
                </SelectItem>
                {(businesses.data ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {s.area}, {s.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="text-sm font-bold">
            Your role
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
              placeholder="Senior colourist"
            />
          </label>
          <label className="text-sm font-bold">
            Phone (optional)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
              placeholder="+212…"
            />
          </label>
          <label className="text-sm font-bold">
            Message to the owner (optional)
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium"
              placeholder="I work Tuesdays to Saturdays on colour and styling."
            />
          </label>
          <button
            type="submit"
            disabled={submit.isPending}
            className="press flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {submit.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Scissors className="size-4" />
            )}
            Request to join
          </button>
        </form>
      )}
    </div>
  );
}
