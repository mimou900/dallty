import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Apple, ArrowLeft, Loader2, Scissors, Store } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PasswordStrength, isPasswordStrong } from "@/components/dallty/password-strength";
import { checkPhoneHasAccount, checkSignupPassword } from "@/lib/account.functions";
import { checkEmailDomainAllowed } from "@/lib/email-trust.functions";
import { checkLoginOtpRequired, requestOtp } from "@/lib/otp.functions";
import { PhoneField, type PhoneFieldValue } from "@/components/dallty/phone-field";
import { guessCountryCode, isValidNational, toE164 } from "@/lib/phone";
import { getCountryByCode, getDefaultCountry } from "@/lib/reference-data";
import { saveNextPath } from "@/lib/next-path";
import { setOtpPending, setRememberMe } from "@/lib/session";
import { ensureSessionAfterSignUp } from "@/lib/auth-session";
import { resolveLandingForSession } from "@/lib/post-login";
import { friendlyError } from "@/lib/friendly-error";
import { LogoMark } from "@/components/dallty/logo";
import { LanguageSwitcher } from "@/components/dallty/language-switcher";
import { dirFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";

const searchSchema = z.object({
  next: z.string().optional(),
  // Deep-link support for the post-booking "Log In" / "Create Account" prompts. "signup" now
  // only affects copy (the flow itself is identical either way — see "continue" below).
  mode: z.enum(["signin", "signup"]).optional(),
  email: z.string().trim().max(255).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in to Dallty" },
      {
        name: "description",
        content:
          "Continue with your phone, email, Google or Apple account to book with Dallty in seconds.",
      },
      { property: "og:title", content: "Sign in to Dallty" },
      { property: "og:description", content: "Book salons, barbers, nails and spa in seconds." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

// Client-only sign-up. Business owners register through /business/signup and
// specialists are invited by their business owner (or request to join a team
// via /staff/signup).
const roleOptions = [{ value: "client" }] as const;

const credentials = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Use at least 8 characters").max(72),
  fullName: z.string().trim().max(100).optional(),
});

const emailOnly = z.string().trim().email("Enter a valid email").max(255);
const phoneOnly = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,15}$/, "Use international format, e.g. +2135xxxxxxxx");
const otpCode = z.string().trim().min(4).max(10);

function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

const inputClass =
  "min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2";

/**
 * "choose" is the primary, default entry point (brief: "continue with phone/email/Google/
 * Apple" instead of an up-front Login-vs-Signup choice). "password" is the pre-existing
 * email+password form, kept reachable as a fallback (account recovery, and the business/staff
 * side still expects it) but no longer the default. "phone"/"email" each collect the contact
 * method first, then the code (via the `otpSent` flag) once one has been sent. "complete-profile"
 * only appears when the
 * signed-in account is missing full_name/phone -- i.e. it's either brand new, or an older
 * account that never finished onboarding -- never for an already-complete profile, regardless
 * of which method was used to sign in.
 */
type Step = "choose" | "password" | "email" | "complete-profile";

function AuthPage() {
  const { next, mode: modeParam, email: emailParam } = Route.useSearch();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const checkOtpRequired = useServerFn(checkLoginOtpRequired);
  const sendLoginOtp = useServerFn(requestOtp);
  const { lang: locale } = useLocale();
  const { t } = useTranslation("auth");
  const [step, setStep] = useState<Step>("choose");
  const [mode, setMode] = useState<"signin" | "signup">(modeParam ?? "signin");
  const [role, setRole] = useState<(typeof roleOptions)[number]["value"]>("client");
  const [email, setEmail] = useState(emailParam ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [remember, setRemember] = useState(true);
  const [contactPhone, setContactPhone] = useState<PhoneFieldValue>(() => ({
    countryCode: guessCountryCode(),
    national: "",
  }));
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Which contact method actually authenticated this session -- decides which field is still
  // missing on the complete-profile step (the OTHER one).
  const [verifiedVia, setVerifiedVia] = useState<"phone" | "email" | "oauth" | null>(null);

  const destination = safeNext(next);
  const dir = dirFor(locale);
  const phoneE164 = toE164(
    (getCountryByCode(contactPhone.countryCode) ?? getDefaultCountry()).calling_code,
    contactPhone.national,
  );

  /** Honour ?next=, otherwise send each role to its own home. */
  async function goHome() {
    const to = destination ?? (await resolveLandingForSession());
    navigate({ to, replace: true });
  }

  function fail(err: unknown) {
    toast.error(friendlyError(err, "Something went wrong. Please try again."));
  }

  // Fires whenever this page observes an active session -- an OTP verify or an OAuth redirect
  // both land here the same way (supabase-js's own auth listener picks up the new session
  // regardless of which method produced it). Checks whether the account still needs a name/
  // contact-method/password before letting it through, so a brand-new account never reaches
  // the rest of the app half-set-up, but an already-complete one is never asked twice.
  const routedRef = useRef(false);
  useEffect(() => {
    if (authLoading || !user || routedRef.current) return;
    routedRef.current = true;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle();
      const needsName = !profile?.full_name?.trim();
      const needsPhone = !profile?.phone?.trim();
      if (needsName || needsPhone) {
        setFullName(profile?.full_name ?? (user.user_metadata?.full_name as string) ?? "");
        if (!verifiedVia) {
          // Landed here already signed in (e.g. straight OAuth redirect) rather than through
          // one of this page's own OTP steps -- infer the method from Supabase's own record
          // of it, never from which fields happen to be populated (an OAuth user always has
          // an email on file too, so that alone isn't a safe signal).
          const provider = user.app_metadata?.provider;
          setVerifiedVia(
            provider === "google" || provider === "apple"
              ? "oauth"
              : provider === "phone"
                ? "phone"
                : "email",
          );
        }
        setStep("complete-profile");
        return;
      }
      await goHome();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  async function continuePhone(e: React.FormEvent) {
    e.preventDefault();
    const parsed = phoneOnly.safeParse(phoneE164);
    if (!parsed.success) {
      toast.error(t("phone_invalid"));
      return;
    }
    setBusy(true);
    try {
      setRememberMe(remember);
      // Never reveals whether this phone already has an account -- the same request either
      // signs an existing user in or silently starts creating one; the branch only appears
      // after the code is verified.
      const { error } = await supabase.auth.signInWithOtp({ phone: parsed.data });
      if (error) throw error;
      setOtpSent(true);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone(e: React.FormEvent) {
    e.preventDefault();
    const parsed = otpCode.safeParse(otp);
    if (!parsed.success) {
      toast.error("Enter the code we sent you");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneE164,
        token: parsed.data,
        type: "sms",
      });
      if (error) throw error;
      setVerifiedVia("phone");
      // The routedRef effect above takes it from here once `user` updates.
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function continueEmail(e: React.FormEvent) {
    e.preventDefault();
    const parsed = emailOnly.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      setRememberMe(remember);
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setOtpSent(true);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail(e: React.FormEvent) {
    e.preventDefault();
    const parsed = otpCode.safeParse(otp);
    if (!parsed.success) {
      toast.error("Enter the code we sent you");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: parsed.data,
        type: "email",
      });
      if (error) throw error;
      setVerifiedVia("email");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function completeProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const needsPhoneField = verifiedVia !== "phone";
    const needsPasswordField = verifiedVia !== "oauth";
    setFieldErrors({});
    if (!fullName.trim()) {
      toast.error(t("full_name"));
      return;
    }
    if (needsPhoneField) {
      const dial = (getCountryByCode(contactPhone.countryCode) ?? getDefaultCountry()).calling_code;
      if (!isValidNational(dial, contactPhone.national)) {
        setFieldErrors({ phone: t("phone_invalid") });
        toast.error(t("phone_invalid"));
        return;
      }
    }
    if (needsPasswordField && password) {
      const check = await checkSignupPassword({
        data: { password, accountType: "client" },
      });
      if (!check.valid) {
        toast.error(check.errors[0] ?? "Password does not meet requirements");
        return;
      }
    }
    setBusy(true);
    try {
      if (needsPhoneField) {
        const dupe = await checkPhoneHasAccount({ data: { phone: phoneE164 } });
        if (dupe.exists) {
          setFieldErrors({ phone: "This phone number is already registered." });
          toast.error("This phone number is already registered.");
          setBusy(false);
          return;
        }
      }
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          ...(needsPhoneField ? { phone: phoneE164, country_code: contactPhone.countryCode } : {}),
        })
        .eq("id", user.id);
      if (profileError) throw profileError;
      if (needsPasswordField && password) {
        const { error: pwError } = await supabase.auth.updateUser({ password });
        if (pwError) throw pwError;
      }
      toast.success(t("welcome"));
      await goHome();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    const parsed = credentials.safeParse({ email, password, fullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    const contactDial = (getCountryByCode(contactPhone.countryCode) ?? getDefaultCountry())
      .calling_code;
    const contactE164 = toE164(contactDial, contactPhone.national);
    if (mode === "signup" && !isValidNational(contactDial, contactPhone.national)) {
      toast.error(t("phone_invalid"));
      setFieldErrors({ phone: t("phone_invalid") });
      return;
    }
    setBusy(true);
    try {
      setRememberMe(remember);
      if (mode === "signup") {
        const check = await checkSignupPassword({
          data: { password: parsed.data.password, accountType: "client" },
        });
        if (!check.valid) {
          toast.error(check.errors[0] ?? "Password does not meet requirements");
          setBusy(false);
          return;
        }

        const emailCheck = await checkEmailDomainAllowed({ data: { email: parsed.data.email } });
        if (!emailCheck.allowed) {
          const message = "Please use a valid email address that you can keep access to.";
          setFieldErrors({ email: message });
          toast.error(message);
          setBusy(false);
          return;
        }

        const phoneCheck = await checkPhoneHasAccount({ data: { phone: contactE164 } });
        if (phoneCheck.exists) {
          const message = "This phone number is already registered to another account.";
          setFieldErrors({ phone: message });
          toast.error(message);
          setBusy(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            emailRedirectTo: `${window.location.origin}${destination ?? ""}`,
            data: {
              full_name: parsed.data.fullName ?? "",
              phone: contactE164,
              country_code: contactPhone.countryCode,
              locale,
              role,
            },
          },
        });
        if (error) throw error;

        // Supabase obfuscates existing accounts: a user with no identities
        // means the email is already registered — never a partial account.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          const message = "This email is already registered. Sign in instead.";
          setFieldErrors({ email: message });
          toast.error(message);
          return;
        }

        const session = await ensureSessionAfterSignUp(
          parsed.data.email,
          parsed.data.password,
          data.session,
        );
        if (!session) {
          toast.success(t("check_email"));
          return;
        }
        toast.success(t("welcome"));
        await goHome();
      } else {
        const { data: throttle } = await supabase.rpc("check_login_throttle", {
          _email: parsed.data.email,
        });
        const throttleRow = Array.isArray(throttle) ? throttle[0] : undefined;
        if (throttleRow?.throttled) {
          const minutes = Math.ceil(throttleRow.retry_after_seconds / 60);
          toast.error(
            `Too many attempts — try again in ${minutes} minute${minutes === 1 ? "" : "s"}`,
          );
          setBusy(false);
          return;
        }

        const { data: signInData, error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error) {
          await supabase.rpc("record_login_attempt", { _email: parsed.data.email });
          throw error;
        }

        const { required } = await checkOtpRequired();
        if (required && signInData.user) {
          setOtpPending(signInData.user.id);
          const sent = await sendLoginOtp({ data: { purpose: "login_step_up" } });
          navigate({
            to: "/verify-otp",
            search: {
              next: destination ?? undefined,
              expiryMinutes: sent.expiryMinutes,
              cooldownSeconds: sent.cooldownSeconds,
            },
            replace: true,
          });
          return;
        }

        toast.success(t("signed_in"));
        await goHome();
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    const parsed = emailOnly.safeParse(email);
    if (!parsed.success) {
      toast.error(t("enter_email"));
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(t("reset_sent"));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuth(provider: "google" | "apple") {
    setBusy(true);
    try {
      setRememberMe(remember);
      if (destination) saveNextPath(destination);
      // Supabase's own OAuth flow: on success it redirects the browser away, so there is
      // normally nothing to do after a successful call. Returns to THIS page (not the
      // homepage) so the routedRef effect above can run the same complete-profile check
      // every other method goes through.
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) {
        toast.error(`${provider === "google" ? "Google" : "Apple"} sign-in failed`);
      }
    } finally {
      setBusy(false);
    }
  }

  const showBack = step !== "choose" && step !== "complete-profile";

  return (
    <div
      dir={dir}
      className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 start-[-10%] size-[34rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-10%] end-[-10%] size-[30rem] rounded-full bg-gold/20 blur-3xl" />
      </div>

      <main className="w-full max-w-md rounded-4xl glass p-7 sm:p-9">
        <div className="mb-7 flex items-center justify-between gap-3">
          {showBack ? (
            <button
              type="button"
              onClick={() => {
                setStep("choose");
                setOtp("");
                setOtpSent(false);
              }}
              aria-label="Back"
              className="grid size-10 place-items-center rounded-2xl glass-soft"
            >
              <ArrowLeft className="size-5 rtl:rotate-180" />
            </button>
          ) : (
            <Link to="/" className="flex items-center gap-3">
              <LogoMark className="size-11" />
              <span className="text-lg font-extrabold">Dallty</span>
            </Link>
          )}
          <LanguageSwitcher />
        </div>

        {step === "choose" && (
          <>
            {/* Phone-first hierarchy (brief §36-41): phone is the dominant,
                default-visible method with the strongest visual weight;
                email is a small secondary text action; Google/Apple sit
                below a separator, equal to each other but secondary to
                phone. Never "Login" vs "Signup" — always "Continue", the
                backend resolves existing vs. new. */}
            <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              {t("continue_to_book")}
            </p>
            <h1 className="text-h1 mt-1">{t("enter_phone_sub")}</h1>

            <form onSubmit={otpSent ? verifyPhone : continuePhone} className="mt-5 space-y-3">
              <PhoneField
                id="phone-continue"
                value={contactPhone}
                onChange={setContactPhone}
                label={t("phone")}
                required
                dir={dir}
                disabled={otpSent || busy}
              />
              {otpSent && (
                <div>
                  <label htmlFor="phone-otp-code" className="mb-1.5 block text-sm font-semibold">
                    {t("otp_code")}
                  </label>
                  <input
                    id="phone-otp-code"
                    inputMode="numeric"
                    required
                    maxLength={10}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    autoComplete="one-time-code"
                    className={`${inputClass} tracking-[0.4em]`}
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                className="press flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-lime text-base font-bold text-lime-foreground disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {otpSent ? t("verify_code") : t("continue")}
              </button>
              {otpSent && (
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                  }}
                  className="w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4"
                >
                  {t("use_different_number")}
                </button>
              )}
            </form>

            {!otpSent && (
              <>
                <p className="mt-4 text-center text-sm">
                  <button
                    type="button"
                    onClick={() => setStep("email")}
                    className="font-semibold text-muted-foreground underline underline-offset-4"
                  >
                    {t("continue_with_email")}
                  </button>
                </p>

                <div className="my-5 flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  {t("or")}
                  <span className="h-px flex-1 bg-border" />
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleOAuth("google")}
                    disabled={busy}
                    className="press flex min-h-12 w-full items-center gap-3 rounded-2xl glass-soft px-4 text-base font-semibold disabled:opacity-60"
                  >
                    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
                      <path
                        fill="#FFC107"
                        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                      />
                      <path
                        fill="#FF3D00"
                        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
                      />
                      <path
                        fill="#4CAF50"
                        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                      />
                      <path
                        fill="#1976D2"
                        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                      />
                    </svg>
                    {t("google")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOAuth("apple")}
                    disabled={busy}
                    className="press flex min-h-12 w-full items-center gap-3 rounded-2xl glass-soft px-4 text-base font-semibold disabled:opacity-60"
                  >
                    <Apple className="size-4 shrink-0" />
                    {t("apple")}
                  </button>
                </div>

                <p className="mt-6 text-center text-sm text-muted-foreground">
                  <button
                    type="button"
                    onClick={() => setStep("password")}
                    className="font-semibold text-foreground underline underline-offset-4"
                  >
                    {t("use_password_instead")}
                  </button>
                </p>
              </>
            )}
          </>
        )}

        {step === "email" && (
          <form onSubmit={otpSent ? verifyEmail : continueEmail} className="mt-1 space-y-3">
            <h1 className="text-2xl font-extrabold">{t("continue_with_email")}</h1>
            <div>
              <label htmlFor="email-continue" className="mb-1.5 block text-sm font-semibold">
                {t("email")}
              </label>
              <input
                id="email-continue"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={otpSent}
                className={`${inputClass} disabled:opacity-60`}
              />
            </div>
            {otpSent && (
              <div>
                <label htmlFor="email-otp-code" className="mb-1.5 block text-sm font-semibold">
                  {t("otp_code")}
                </label>
                <input
                  id="email-otp-code"
                  inputMode="numeric"
                  required
                  maxLength={10}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  autoComplete="one-time-code"
                  className={`${inputClass} tracking-[0.4em]`}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {otpSent ? t("verify_code") : t("send_code")}
            </button>
            {otpSent && (
              <button
                type="button"
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                }}
                className="w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4"
              >
                {t("use_different_email")}
              </button>
            )}
          </form>
        )}

        {step === "password" && (
          <>
            <h1 className="text-3xl font-extrabold">
              {mode === "signin" ? t("sign_in_title") : t("sign_up_title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin" ? t("sign_in_sub") : t("sign_up_sub")}
            </p>

            {mode === "signup" && (
              <fieldset className="mt-6">
                <legend className="mb-2 text-sm font-semibold">{t("role_legend")}</legend>
                <div className="grid gap-2">
                  {roleOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRole(option.value)}
                      aria-pressed={role === option.value}
                      className={`flex min-h-12 items-center justify-between rounded-2xl px-4 py-3 text-start text-sm font-semibold transition-colors ${
                        role === option.value
                          ? "bg-primary text-primary-foreground"
                          : "glass-soft text-foreground"
                      }`}
                    >
                      <span>{t("role_client")}</span>
                      <span
                        className={
                          role === option.value
                            ? "text-xs font-medium opacity-80"
                            : "text-xs font-medium text-muted-foreground"
                        }
                      >
                        {t("role_client_hint")}
                      </span>
                    </button>
                  ))}
                  <Link
                    to="/business/signup"
                    className="flex min-h-12 items-center justify-between rounded-2xl glass-soft px-4 py-3 text-sm font-semibold"
                  >
                    <span>{t("role_business")}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("role_business_hint")}
                    </span>
                  </Link>
                </div>
              </fieldset>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-3">
              {mode === "signup" && (
                <div>
                  <label htmlFor="fullName" className="mb-1.5 block text-sm font-semibold">
                    {t("full_name")}
                  </label>
                  <input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    className={inputClass}
                  />
                </div>
              )}
              {mode === "signup" && (
                <PhoneField
                  id="signup-phone"
                  value={contactPhone}
                  onChange={setContactPhone}
                  label={t("phone")}
                  required
                  dir={dir}
                />
              )}
              {mode === "signup" && fieldErrors.phone && (
                <p className="-mt-2 text-xs font-medium text-destructive">{fieldErrors.phone}</p>
              )}

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-semibold">
                  {t("email")}
                </label>
                <input
                  id="email"
                  name="username"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className={inputClass}
                />
                {fieldErrors.email && (
                  <p className="mt-1.5 text-xs font-medium text-destructive">{fieldErrors.email}</p>
                )}
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-semibold">
                  {t("password")}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className={inputClass}
                />
                {mode === "signup" && (
                  <PasswordStrength value={password} policy="client" className="mt-2" />
                )}
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  {t("remember")}
                </label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm font-semibold underline underline-offset-4"
                  >
                    {t("forgot")}
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={busy || (mode === "signup" && !isPasswordStrong(password, "client"))}
                className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "signin" ? t("sign_in") : t("sign_up")}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? t("new_here") : t("have_account")}{" "}
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="font-semibold text-foreground underline underline-offset-4"
              >
                {mode === "signin" ? t("switch_sign_up") : t("switch_sign_in")}
              </button>
            </p>
          </>
        )}

        {step === "complete-profile" && (
          <form onSubmit={completeProfile} className="mt-1 space-y-3">
            <h1 className="text-2xl font-extrabold">{t("complete_profile_title")}</h1>
            <p className="text-sm text-muted-foreground">{t("complete_profile_sub")}</p>
            <div>
              <label htmlFor="complete-name" className="mb-1.5 block text-sm font-semibold">
                {t("full_name")}
              </label>
              <input
                id="complete-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                required
                className={inputClass}
              />
            </div>
            {verifiedVia !== "phone" && (
              <>
                <PhoneField
                  id="complete-phone"
                  value={contactPhone}
                  onChange={setContactPhone}
                  label={t("phone")}
                  required
                  dir={dir}
                />
                {fieldErrors.phone && (
                  <p className="-mt-2 text-xs font-medium text-destructive">{fieldErrors.phone}</p>
                )}
              </>
            )}
            {verifiedVia !== "oauth" && (
              <div>
                <label htmlFor="complete-password" className="mb-1.5 block text-sm font-semibold">
                  {t("password")}{" "}
                  <span className="font-medium text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="complete-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
                {password && <PasswordStrength value={password} policy="client" className="mt-2" />}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {t("finish_setup")}
            </button>
          </form>
        )}

        {step !== "complete-profile" && (
          <>
            <Link
              to="/business/signup"
              className="press mt-4 flex min-h-11 items-center justify-center gap-2 rounded-2xl glass-soft text-sm font-bold"
            >
              <Store className="size-4" />
              {t("business")}
            </Link>

            <Link
              to="/staff/signup"
              className="press mt-2 flex min-h-11 items-center justify-center gap-2 rounded-2xl glass-soft text-sm font-bold"
            >
              <Scissors className="size-4" />
              {t("join_team")}
            </Link>
          </>
        )}
      </main>
    </div>
  );
}
