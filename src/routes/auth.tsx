import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Apple, Loader2, Scissors, Store } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PasswordStrength, isPasswordStrong } from "@/components/dallty/password-strength";
import { checkPhoneHasAccount, checkSignupPassword } from "@/lib/account.functions";
import { checkLoginOtpRequired, requestOtp } from "@/lib/otp.functions";
import { PhoneField, type PhoneFieldValue } from "@/components/dallty/phone-field";
import { guessCountryCode, isValidNational, toE164 } from "@/lib/phone";
import { getCountryByCode, getDefaultCountry } from "@/lib/reference-data";
import { saveNextPath } from "@/lib/next-path";
import { lovable } from "@/integrations/lovable/index";
import { setOtpPending, setRememberMe } from "@/lib/session";
import { ensureSessionAfterSignUp } from "@/lib/auth-session";
import { resolveLandingForSession } from "@/lib/post-login";
import { friendlyError } from "@/lib/friendly-error";
import { LogoMark } from "@/components/dallty/logo";
import { LanguageSwitcher } from "@/components/dallty/language-switcher";
import { dirFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";

// Launch scope is Email+Password only, per the account spec. Magic-link and
// phone-OTP sign-in are architected below (working handlers, untouched
// behaviour) but hidden until the product is ready to offer them. Same for
// Google — the OAuth call already works; it's flagged off so launch matches
// "email+password now, other providers later" exactly.
const SHOW_ALT_METHODS = false;
const SHOW_OAUTH_BUTTONS = false;

const searchSchema = z.object({
  next: z.string().optional(),
  // Deep-link support for the post-booking "Log In" / "Create Account" prompts.
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
          "Sign in with your email and password. Create your Dallty account as a customer, business owner or specialist.",
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

function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

const inputClass =
  "min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2";

type Method = "password" | "magic" | "phone";

function AuthPage() {
  const { next, mode: modeParam, email: emailParam } = Route.useSearch();
  const navigate = useNavigate();
  const checkOtpRequired = useServerFn(checkLoginOtpRequired);
  const sendLoginOtp = useServerFn(requestOtp);
  const { lang: locale } = useLocale();
  const { t } = useTranslation("auth");
  const [method, setMethod] = useState<Method>("password");
  const [mode, setMode] = useState<"signin" | "signup">(modeParam ?? "signin");
  const [role, setRole] = useState<(typeof roleOptions)[number]["value"]>("client");
  const [email, setEmail] = useState(emailParam ?? "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [remember, setRemember] = useState(true);
  const [phone, setPhone] = useState("");
  const [contactPhone, setContactPhone] = useState<PhoneFieldValue>(() => ({
    countryCode: guessCountryCode(),
    national: "",
  }));
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const destination = safeNext(next);
  const dir = dirFor(locale);

  /** Honour ?next=, otherwise send each role to its own home. */
  async function goHome() {
    const to = destination ?? (await resolveLandingForSession());
    navigate({ to, replace: true });
  }

  function fail(err: unknown) {
    toast.error(friendlyError(err, "Something went wrong. Please try again."));
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

  async function handleMagicLink(e: React.FormEvent) {
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
        options: {
          emailRedirectTo: `${window.location.origin}${destination ?? ""}`,
          data: { role },
        },
      });
      if (error) throw error;
      setMagicSent(true);
      toast.success("Magic link sent — check your inbox.");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = phoneOnly.safeParse(phone);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      setRememberMe(remember);
      const { error } = await supabase.auth.signInWithOtp({
        phone: parsed.data,
        options: { data: { role } },
      });
      if (error) throw error;
      setOtpSent(true);
      toast.success("Code sent by SMS.");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp.trim(),
        type: "sms",
      });
      if (error) throw error;
      toast.success(t("signed_in"));
      await goHome();
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

  async function handleGoogle() {
    setBusy(true);
    try {
      setRememberMe(remember);
      if (destination) saveNextPath(destination);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Google sign-in failed");
        return;
      }
      if (result.redirected) return;
      await goHome();
    } finally {
      setBusy(false);
    }
  }

  const methods: { key: Method; label: string }[] = [
    { key: "password", label: "Password" },
    { key: "magic", label: "Magic link" },
    { key: "phone", label: "Phone" },
  ];

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
          <Link to="/" className="flex items-center gap-3">
            <LogoMark className="size-11" />
            <span className="text-lg font-extrabold">Dallty</span>
          </Link>
          <LanguageSwitcher />
        </div>

        <h1 className="text-3xl font-extrabold">
          {mode === "signin" ? t("sign_in_title") : t("sign_up_title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "signin" ? t("sign_in_sub") : t("sign_up_sub")}
        </p>

        {SHOW_ALT_METHODS && (
          <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl glass-soft p-1">
            {methods.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                aria-pressed={method === m.key}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors ${
                  method === m.key ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

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

        {method === "password" && (
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
        )}

        {SHOW_ALT_METHODS && method === "magic" && (
          <form onSubmit={handleMagicLink} className="mt-6 space-y-3">
            <div>
              <label htmlFor="magic-email" className="mb-1.5 block text-sm font-semibold">
                {t("email")}
              </label>
              <input
                id="magic-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {magicSent
                ? "Link sent. Open it on this device to finish signing in."
                : "We'll email you a one-tap sign-in link — no password needed."}
            </p>
            <button
              type="submit"
              disabled={busy}
              className="press flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {magicSent ? "Resend magic link" : "Email me a magic link"}
            </button>
          </form>
        )}

        {SHOW_ALT_METHODS && method === "phone" && (
          <form onSubmit={otpSent ? handleVerifyOtp : handleSendOtp} className="mt-6 space-y-3">
            <div>
              <label htmlFor="phone" className="mb-1.5 block text-sm font-semibold">
                {t("phone")}
              </label>
              <input
                id="phone"
                type="tel"
                required
                placeholder="+2135xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                disabled={otpSent}
                className={`${inputClass} disabled:opacity-60`}
              />
            </div>
            {otpSent && (
              <div>
                <label htmlFor="otp" className="mb-1.5 block text-sm font-semibold">
                  6-digit code
                </label>
                <input
                  id="otp"
                  inputMode="numeric"
                  required
                  maxLength={8}
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
              {otpSent ? "Verify and sign in" : "Send code"}
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
                Use a different number
              </button>
            )}
          </form>
        )}

        {SHOW_OAUTH_BUTTONS && (
          <>
            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              {t("or")}
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                className="press flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl glass-soft text-base font-semibold disabled:opacity-60"
              >
                <img src="https://www.google.com/favicon.ico" alt="" width={18} height={18} />
                {t("google")}
              </button>
              <button
                type="button"
                disabled
                title={t("apple_soon")}
                className="flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-3 rounded-2xl glass-soft text-base font-semibold opacity-50"
              >
                <Apple className="size-4" />
                {t("apple")}
                <span className="text-xs font-bold uppercase tracking-wide">{t("apple_soon")}</span>
              </button>
            </div>
          </>
        )}

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
      </main>
    </div>
  );
}
