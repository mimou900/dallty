import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Lock, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PasswordStrength, isPasswordStrong } from "@/components/dallty/password-strength";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { changeMyPassword } from "@/lib/account.functions";
import { policyForRoles } from "@/lib/password-policy";
import { resolveLandingForSession } from "@/lib/post-login";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — Dallty" },
      {
        name: "description",
        content: "Choose a new password for your Dallty account and get back to your bookings.",
      },
      { property: "og:title", content: "Set a new password — Dallty" },
      { property: "og:description", content: "Securely reset your Dallty password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const policy = policyForRoles(roles);
  const updatePassword = useServerFn(changeMyPassword);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery hash and emits PASSWORD_RECOVERY / SIGNED_IN.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isPasswordStrong(password, policy)) {
      toast.error("Password does not meet the requirements");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      // Server enforces the same role-based policy; fall back to the client
      // call only if the recovery session can't reach the server function.
      try {
        await updatePassword({ data: { password } });
      } catch {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      }
      toast.success("Password updated");
      const to = await resolveLandingForSession();
      navigate({ to, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="glow-blob -top-40 start-[-10%] size-[34rem]" />
      </div>
      <div className="w-full max-w-md rounded-4xl glass p-7 sm:p-9">
        <Link to="/" className="mb-7 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <span className="text-lg font-extrabold">Dallty</span>
        </Link>

        <h1 className="text-3xl font-extrabold">Set a new password</h1>

        {!ready ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Open this page from the reset link in your email. If the link expired, request a new one
            from the{" "}
            <Link
              to="/auth"
              search={{ next: undefined }}
              className="font-semibold underline underline-offset-4"
            >
              sign-in page
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            {/* Hidden username helps password managers associate the new password */}
            <input
              type="email"
              name="username"
              autoComplete="username"
              defaultValue=""
              readOnly
              hidden
              aria-hidden
              tabIndex={-1}
            />
            <div>
              <label htmlFor="new-password" className="mb-1.5 block text-sm font-semibold">
                New password
              </label>
              <input
                id="new-password"
                name="new-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
              />
            </div>
            <PasswordStrength value={password} policy={policy} />
            <div>
              <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-semibold">
                Confirm password
              </label>
              <input
                id="confirm-password"
                name="confirm-new-password"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2"
              />
            </div>
            <button
              type="submit"
              disabled={busy || !isPasswordStrong(password, policy)}
              className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
