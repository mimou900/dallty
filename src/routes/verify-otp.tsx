import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { requestOtp, verifyOtp } from "@/lib/otp.functions";
import { clearOtpPending } from "@/lib/session";
import { resolveLandingForSession } from "@/lib/post-login";
import wordmarkUrl from "@/assets/dallty-wordmark.png";
import { OtpCodeInput } from "@/components/dallty/otp-code-input";

const searchSchema = z.object({
  next: z.string().optional(),
  expiryMinutes: z.number().optional(),
  cooldownSeconds: z.number().optional(),
});

export const Route = createFileRoute("/verify-otp")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Verify it's you — Dallty" }],
  }),
  beforeLoad: async ({ location }) => {
    let { data } = await supabase.auth.getSession();
    if (!data.session) {
      const refreshed = await supabase.auth.refreshSession();
      data = { session: refreshed.data.session };
    }
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    // Deliberately does NOT bounce away when `isOtpPending` is false. That flag is only ever
    // set by the password sign-in path (auth.tsx) — the phone/email "Continue" flows never set
    // it, and it isn't session-scoped the way the real server-side check
    // (auth_step_up_sessions, keyed by session_id) is, so it can say "not pending" even when a
    // step-up-gated action just failed and sent the user here. Bouncing on a stale flag turned
    // this into a genuine dead end: the one page that can satisfy the server's requirement was
    // refusing to show itself. Worst case with no bounce is a harmless redundant verification.
  },
  component: VerifyOtpPage,
});

function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function VerifyOtpPage() {
  const { next, expiryMinutes, cooldownSeconds } = Route.useSearch();
  const navigate = useNavigate();
  const requestCode = useServerFn(requestOtp);
  const verifyCode = useServerFn(verifyOtp);

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [expiresAt, setExpiresAt] = useState(() => Date.now() + (expiryMinutes ?? 10) * 60_000);
  const [resendReadyAt, setResendReadyAt] = useState(
    () => Date.now() + (cooldownSeconds ?? 60) * 1000,
  );
  const [now, setNow] = useState(Date.now());
  const submittedRef = useRef(false);
  const autoSentRef = useRef(false);

  // Arriving here without a pre-sent code (expiryMinutes absent from the URL) means the
  // redirect that sent us here — the global step-up-error handler in router.tsx — couldn't
  // send one itself. Send the first code automatically instead of showing a blank "enter your
  // code" screen for a code that was never sent.
  useEffect(() => {
    if (expiryMinutes !== undefined || autoSentRef.current) return;
    autoSentRef.current = true;
    requestCode({ data: { purpose: "login_step_up" } })
      .then((sent) => {
        setExpiresAt(Date.now() + sent.expiryMinutes * 60_000);
        setResendReadyAt(Date.now() + sent.cooldownSeconds * 1000);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Couldn't send a verification code");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = Math.max(0, Math.round((expiresAt - now) / 1000));
  const expired = secondsLeft <= 0;
  const resendReady = now >= resendReadyAt;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  async function handleVerify() {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    try {
      await verifyCode({ data: { purpose: "login_step_up", code } });
      clearOtpPending();
      toast.success("Verified");
      const destination = safeNext(next) ?? (await resolveLandingForSession());
      navigate({ to: destination, replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify code");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  // Auto-submit once all 6 digits are entered, matching the input-otp pattern
  // used for one-time codes elsewhere in the product.
  useEffect(() => {
    if (code.length === 6 && !submittedRef.current) {
      submittedRef.current = true;
      handleVerify().finally(() => {
        submittedRef.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function handleResend() {
    if (!resendReady || resendBusy) return;
    setResendBusy(true);
    try {
      const sent = await requestCode({ data: { purpose: "login_step_up" } });
      setExpiresAt(Date.now() + sent.expiryMinutes * 60_000);
      setResendReadyAt(Date.now() + sent.cooldownSeconds * 1000);
      setCode("");
      toast.success("New code sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not resend code");
    } finally {
      setResendBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="glow-blob -top-40 start-[-10%] size-[34rem]" />
      </div>
      <main className="w-full max-w-md rounded-4xl glass p-7 sm:p-9">
        <Link to="/" className="mb-7 flex items-center">
          <img src={wordmarkUrl} alt="Dallty" className="h-8 w-auto object-contain" />
        </Link>

        <h1 className="flex items-center gap-2 text-3xl font-extrabold">
          <KeyRound className="size-7" /> Confirm it's you
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the 6-digit code we emailed you to finish signing in.
        </p>

        <div className="mt-8">
          <OtpCodeInput value={code} onChange={setCode} disabled={busy || expired} />
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          {expired ? "Code expired — request a new one." : `Expires in ${mm}:${ss}`}
        </p>

        <button
          type="button"
          onClick={handleVerify}
          disabled={busy || code.length !== 6 || expired}
          className="press mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="size-4 animate-spin" />}
          Verify
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={!resendReady || resendBusy}
          className="mt-4 w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4 disabled:no-underline disabled:opacity-60"
        >
          {resendBusy
            ? "Sending…"
            : resendReady
              ? "Resend code"
              : `Resend available in ${Math.max(0, Math.round((resendReadyAt - now) / 1000))}s`}
        </button>
      </main>
    </div>
  );
}
