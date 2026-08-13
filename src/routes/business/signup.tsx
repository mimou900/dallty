import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { useCountries, getCountryByCode, getDefaultCountry } from "@/lib/reference-data";
import { citiesFor } from "@/lib/arab-cities";
import { PhoneField, type PhoneFieldValue } from "@/components/dallty/phone-field";
import { guessCountryCode, isValidNational, toE164 } from "@/lib/phone";
import {
  CalendarClock,
  CalendarDays,
  Check,
  CircleCheck,
  Clock,
  Image as ImageIcon,
  Loader2,
  Scissors,
  Store,
  UserCog,
  UserRound,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ImageDrop } from "@/components/dallty/image-drop";
import { PlacesAutocomplete, type PlaceResult } from "@/components/dallty/places-autocomplete";
import { uploadAndSign } from "@/lib/storage";
import { registerBusiness } from "@/lib/business.functions";
import { ensureSessionAfterSignUp } from "@/lib/auth-session";
import { businessDetailsSchema, phoneSchema, strongPassword } from "@/lib/business-schema";
import { useCategories } from "@/lib/reference-data";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PasswordStrength, isPasswordStrong } from "@/components/dallty/password-strength";
import { checkSignupPassword, checkPhoneHasAccount } from "@/lib/account.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/business/signup")({
  head: () => ({
    meta: [
      { title: "Create your salon — Dallty Business" },
      {
        name: "description",
        content:
          "Set up your salon on Dallty in three simple steps: business details and address, branding, and your opening hours.",
      },
      { property: "og:title", content: "Create your salon — Dallty Business" },
      {
        property: "og:description",
        content: "Take online bookings, manage your team and grow with Dallty Business.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BusinessSignupPage,
});

/** Platform admin accounts manage salons instead of owning one. */
function usePlatformAdminRedirect() {
  const { hasRole, loading, rolesLoading } = useAuth();
  const navigate = useNavigate();
  const isPlatformAdmin = hasRole("super_admin") || hasRole("admin");
  useEffect(() => {
    if (!loading && !rolesLoading && isPlatformAdmin) {
      navigate({ to: "/admin/platform/overview", replace: true });
    }
  }, [isPlatformAdmin, loading, rolesLoading, navigate]);
  return isPlatformAdmin;
}

const inputClass =
  "min-h-12 w-full rounded-2xl bg-card/70 px-4 text-base outline-none ring-ring focus:ring-2";
const labelClass = "mb-1.5 block text-sm font-semibold";

function CategoryIcon({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Sparkles;
  return <Icon className="size-3.5" />;
}

type Account = {
  fullName: string;
  email: string;
  phone: PhoneFieldValue;
  password: string;
  confirm: string;
};

type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function Field({
  label,
  children,
  hint,
  optional,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  optional?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <span className={labelClass}>
        {label}
        {optional && (
          <span className="ms-1 text-xs font-medium text-muted-foreground">(optional)</span>
        )}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs font-semibold text-destructive">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}

function BusinessSignupPage() {
  const isPlatformAdmin = usePlatformAdminRedirect();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  /**
   * Whether this visitor needs the account step. Captured once, so creating the
   * account mid-wizard never renumbers the steps under the user's feet.
   */
  const [hasAccountStep, setHasAccountStep] = useState<boolean | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const [checkingSalon, setCheckingSalon] = useState(true);

  useEffect(() => {
    if (authLoading || hasAccountStep !== null) return;
    setHasAccountStep(!user);
  }, [authLoading, user, hasAccountStep]);

  // An owner who already has a salon belongs in the dashboard, not here.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCheckingSalon(false);
      return;
    }
    if (accountCreated) {
      setCheckingSalon(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("salons")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) navigate({ to: "/admin", replace: true });
        else setCheckingSalon(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, accountCreated, navigate]);

  const needsAccount = hasAccountStep === true;

  const steps = useMemo(
    () => [
      ...(needsAccount ? [{ title: "Account", icon: UserRound }] : []),
      { title: "Salon details", icon: Store },
      { title: "Branding", icon: ImageIcon },
      { title: "Business hours", icon: Clock },
    ],
    [needsAccount],
  );
  const offset = needsAccount ? 1 : 0;

  const countries = useCountries();
  const categoryOptions = useCategories();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<null | "account" | "salon">(null);
  const [busyLabel, setBusyLabel] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState<null | { needsEmailConfirm: boolean }>(null);

  const [account, setAccount] = useState<Account>({
    fullName: "",
    email: "",
    phone: { countryCode: guessCountryCode(), national: "" },
    password: "",
    confirm: "",
  });

  const [b, setB] = useState({
    name: "",
    description: "",
    businessEmail: "",
    businessPhone: "",
    country: getDefaultCountry().default_name,
    countryCode: getDefaultCountry().iso_code,
    city: "",
    district: "",
    address: "",
    postalCode: "",
    mapsUrl: "",
    latitude: "" as string,
    longitude: "" as string,
    opensAt: "09:00",
    closesAt: "21:00",
  });
  const [categories, setCategories] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);

  const timezone = (getCountryByCode(b.countryCode) ?? getDefaultCountry()).timezone;
  const passwordOk = isPasswordStrong(account.password, "privileged");

  function set<K extends keyof typeof b>(key: K, value: string) {
    setB((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function setAccountField<K extends keyof Account>(key: K, value: Account[K]) {
    setAccount((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function toggleCategory(value: string) {
    setCategories((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value],
    );
    setErrors((prev) => ({ ...prev, categories: "" }));
  }

  /** Fills the address plus the silently-stored location metadata. */
  function applyPlace(place: PlaceResult) {
    setErrors((prev) => ({ ...prev, address: "", city: "" }));
    const known = (countries.data ?? []).find((c) => c.iso_code === place.countryCode);
    setB((prev) => ({
      ...prev,
      address: place.address || prev.address,
      city: place.city || prev.city,
      district: place.district || prev.district,
      country: known?.default_name ?? place.country ?? prev.country,
      countryCode: known?.iso_code ?? prev.countryCode,
      postalCode: place.postalCode || prev.postalCode,
      latitude: place.latitude != null ? place.latitude.toFixed(6) : prev.latitude,
      longitude: place.longitude != null ? place.longitude.toFixed(6) : prev.longitude,
      mapsUrl: place.mapsUrl || prev.mapsUrl,
    }));
  }

  function validateAccount(): FieldErrors {
    const next: FieldErrors = {};
    if (account.fullName.trim().length < 2) next.fullName = "Enter your full name";
    if (!EMAIL_RE.test(account.email.trim())) next.email = "Enter a valid email address";
    if (
      !isValidNational(
        (getCountryByCode(account.phone.countryCode) ?? getDefaultCountry()).calling_code,
        account.phone.national,
      )
    )
      next.phone = "Enter a valid phone number for the selected country";
    const pw = strongPassword.safeParse(account.password);
    if (!pw.success) next.password = pw.error.issues[0].message;
    if (!account.confirm) next.confirm = "Re-enter your password";
    else if (account.password !== account.confirm) next.confirm = "Passwords do not match";
    return next;
  }

  function validateStepFields(index: number): FieldErrors {
    if (needsAccount && index === 0) return validateAccount();
    if (index === offset) {
      const next: FieldErrors = {};
      if (b.name.trim().length < 2) next.name = "Salon name is required";
      if (!categories.length) next.categories = "Pick at least one category";
      if (!phoneSchema.safeParse(b.businessPhone).success)
        next.businessPhone = "Enter a valid business phone, e.g. +9714xxxxxxx";
      if (!EMAIL_RE.test(b.businessEmail.trim()))
        next.businessEmail = "Enter a valid business email";
      if (b.country.trim().length < 2) next.country = "Country is required";
      if (b.city.trim().length < 2) next.city = "City is required";
      if (b.address.trim().length < 4) next.address = "Full address is required";
      return next;
    }
    if (index === offset + 1) {
      return logoFile ? {} : { logo: "A logo is required" };
    }
    if (index === offset + 2) {
      const next: FieldErrors = {};
      if (!/^\d{2}:\d{2}$/.test(b.opensAt)) next.opensAt = "Set an opening time";
      if (!/^\d{2}:\d{2}$/.test(b.closesAt)) next.closesAt = "Set a closing time";
      if (!next.opensAt && !next.closesAt && b.opensAt >= b.closesAt)
        next.closesAt = "Closing time must be after opening time";
      if (!terms) next.terms = "Please accept the Terms & Conditions";
      return next;
    }
    return {};
  }

  /** Validates a step and surfaces messages under each field. */
  function guardStep(index: number): boolean {
    const found = validateStepFields(index);
    setErrors(found);
    if (Object.keys(found).length) {
      toast.error("Please complete all required fields.");
      return false;
    }
    return true;
  }

  /**
   * Creates the owner account as soon as step 1 is completed, signs them in and
   * moves straight on to the salon wizard — no second login, ever.
   */
  async function createAccount() {
    if (busy) return;
    if (!guardStep(0)) return;

    setBusy("account");
    setBusyLabel("Creating your account…");
    try {
      const email = account.email.trim().toLowerCase();
      const phoneE164 = toE164(
        (getCountryByCode(account.phone.countryCode) ?? getDefaultCountry()).calling_code,
        account.phone.national,
      );
      const check = await checkSignupPassword({
        data: { password: account.password, accountType: "privileged" },
      });
      if (!check.valid) {
        setErrors({ password: check.errors[0] ?? "Password does not meet requirements" });
        toast.error(check.errors[0] ?? "Password does not meet requirements");
        return;
      }

      const phoneCheck = await checkPhoneHasAccount({ data: { phone: phoneE164 } });
      if (phoneCheck.exists) {
        const message = "This phone number is already registered to another account.";
        setErrors({ phone: message });
        toast.error(message);
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password: account.password,
        options: {
          emailRedirectTo: `${window.location.origin}/business/signup`,
          data: {
            full_name: account.fullName.trim(),
            phone: phoneE164,
            country_code: account.phone.countryCode,
            role: "salon_owner",
          },
        },
      });
      if (signUpError) throw signUpError;

      // Supabase obfuscates existing accounts: a user with no identities means
      // the email is already registered.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setErrors({ email: "This email is already registered. Sign in instead." });
        toast.error("This email is already registered.");
        return;
      }

      setBusyLabel("Signing you in…");
      const session = await ensureSessionAfterSignUp(email, account.password, data.session);

      setAccountCreated(true);
      if (session) {
        toast.success("Account created — let's set up your salon.");
      } else {
        toast.message("Check your email to confirm your address, then continue here.");
      }
      setStep(1);
    } catch (err) {
      const message = friendlyError(err, "We couldn't create your account. Please try again.");
      if (message.toLowerCase().includes("already registered")) setErrors({ email: message });
      toast.error(message);
    } finally {
      setBusy(null);
      setBusyLabel("");
    }
  }

  function next() {
    if (needsAccount && step === 0 && !accountCreated) {
      void createAccount();
      return;
    }
    if (!guardStep(step)) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function submit() {
    if (busy) return;
    if (!guardStep(steps.length - 1)) return;

    const parsed = businessDetailsSchema.safeParse({
      name: b.name,
      businessType: categories[0],
      categories,
      description: b.description,
      businessEmail: b.businessEmail,
      businessPhone: b.businessPhone,
      country: b.country,
      countryCode: b.countryCode,
      city: b.city,
      district: b.district,
      address: b.address,
      postalCode: b.postalCode,
      mapsUrl: b.mapsUrl,
      latitude: b.latitude ? Number(b.latitude) : null,
      longitude: b.longitude ? Number(b.longitude) : null,
      opensAt: b.opensAt,
      closesAt: b.closesAt,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setErrors({ [String(issue.path[0] ?? "name")]: issue.message });
      toast.error(issue.message);
      setStep(offset);
      return;
    }

    setBusy("salon");
    setBusyLabel("Creating your salon…");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        toast.error("Please confirm your email address to finish setting up your salon.");
        return;
      }
      const userId = session.user.id;

      let logoUrl = "";
      let coverUrl = "";
      let galleryUrls: string[] = [];
      setBusyLabel("Uploading your photos…");
      try {
        if (logoFile) logoUrl = await uploadAndSign("business-media", userId, logoFile);
        if (coverFile) coverUrl = await uploadAndSign("business-media", userId, coverFile);
        galleryUrls = await Promise.all(
          galleryFiles.slice(0, 12).map((file) => uploadAndSign("business-media", userId, file)),
        );
      } catch {
        toast.message("Some photos could not be uploaded — you can add them from your dashboard.");
      }

      setBusyLabel("Creating your salon…");
      await registerBusiness({
        data: { userId, business: { ...parsed.data, logoUrl, coverUrl, galleryUrls } },
      });
      setDone({ needsEmailConfirm: false });
      toast.success("Your salon has been created successfully.");
    } catch (err) {
      const message = friendlyError(err, "We couldn't create your salon. Please try again.");
      if (message.toLowerCase().includes("already has a business")) {
        navigate({ to: "/admin", replace: true });
        return;
      }
      toast.error(message);
    } finally {
      setBusy(null);
      setBusyLabel("");
    }
  }

  if (isPlatformAdmin) {
    return (
      <main className="grid min-h-dvh place-items-center px-4 text-sm text-muted-foreground">
        Platform admin accounts manage salons — taking you to the console…
      </main>
    );
  }

  if (hasAccountStep === null || checkingSalon) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  if (done) {
    return (
      <main className="relative grid min-h-dvh place-items-center px-4 py-10">
        <div className="w-full max-w-lg rounded-4xl glass p-8 text-center">
          <CircleCheck className="mx-auto size-10 text-primary" />
          <h1 className="mt-4 text-3xl font-extrabold">Your salon has been created successfully</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {done.needsEmailConfirm
              ? "Confirm your email to activate your login, then finish setting up your salon."
              : "Here are the next steps to get you ready for bookings."}
          </p>

          <div className="mt-6 grid gap-2 text-start">
            {[
              { to: "/admin/services", label: "Add service", icon: Scissors },
              { to: "/admin/staff", label: "Add specialist", icon: UserCog },
              { to: "/admin/availability", label: "Configure availability", icon: CalendarClock },
            ].map((action) => (
              <Link
                key={action.to}
                to={action.to}
                {...(action.to === "/admin/availability" ? { search: { staff: undefined } } : {})}
                className="press flex min-h-12 items-center gap-3 rounded-2xl bg-primary px-5 text-base font-bold text-primary-foreground"
              >
                <action.icon className="size-5" />
                {action.label}
              </Link>
            ))}
            <Link
              to="/admin"
              className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl glass-soft text-base font-semibold"
            >
              <CalendarDays className="size-4" />
              Go to my dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-dvh overflow-hidden px-4 py-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 start-[-10%] size-[34rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-[-10%] end-[-10%] size-[30rem] rounded-full bg-gold/20 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Store className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-extrabold leading-tight">Dallty</span>
              <span className="block text-[11px] font-bold uppercase tracking-wide text-foreground">
                Business
              </span>
            </span>
          </Link>
          {needsAccount && (
            <Link
              to="/auth"
              search={{ next: undefined }}
              className="shrink-0 text-sm font-semibold underline underline-offset-4"
            >
              I already have an account
            </Link>
          )}
        </div>

        <div className="rounded-4xl glass p-6 sm:p-8">
          <ol className="mb-7 flex flex-wrap items-center gap-2">
            {steps.map((s, i) => (
              <li key={s.title} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  className={`flex min-h-9 items-center gap-2 rounded-2xl px-3 text-xs font-bold transition-colors ${
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                        ? "glass-soft text-foreground"
                        : "text-muted-foreground"
                  }`}
                >
                  {i < step ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">{i + 1}</span>
                </button>
              </li>
            ))}
          </ol>

          <h1 className="text-2xl font-extrabold sm:text-3xl">
            Step {step + 1} — {steps[step].title}
          </h1>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (step < steps.length - 1) next();
              else void submit();
            }}
          >
            <div className="mt-6 space-y-4">
              {needsAccount && step === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {accountCreated && (
                    <p className="sm:col-span-2 rounded-2xl glass-soft p-3.5 text-sm font-semibold">
                      Your account is ready — continue to your salon details.
                    </p>
                  )}
                  <Field label="Full name" error={errors.fullName}>
                    <input
                      id="owner-full-name"
                      name="name"
                      className={inputClass}
                      value={account.fullName}
                      disabled={accountCreated}
                      onChange={(e) => setAccountField("fullName", e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </Field>
                  <Field label="Email address" error={errors.email}>
                    <input
                      id="owner-email"
                      name="username"
                      className={inputClass}
                      type="email"
                      value={account.email}
                      disabled={accountCreated}
                      onChange={(e) => setAccountField("email", e.target.value)}
                      autoComplete="username"
                      inputMode="email"
                      required
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <PhoneField
                      id="owner-phone"
                      label="Mobile number"
                      value={account.phone}
                      onChange={(next) => setAccountField("phone", next)}
                      disabled={accountCreated}
                      required
                    />
                  </div>
                  {!accountCreated && (
                    <>
                      <Field label="Password" error={errors.password}>
                        <input
                          id="owner-password"
                          name="new-password"
                          className={inputClass}
                          type="password"
                          value={account.password}
                          onChange={(e) => setAccountField("password", e.target.value)}
                          autoComplete="new-password"
                          required
                        />
                      </Field>
                      <Field label="Confirm password" error={errors.confirm}>
                        <input
                          id="owner-password-confirm"
                          name="confirm-new-password"
                          className={inputClass}
                          type="password"
                          value={account.confirm}
                          onChange={(e) => setAccountField("confirm", e.target.value)}
                          autoComplete="new-password"
                          required
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <PasswordStrength value={account.password} policy="privileged" />
                      </div>
                    </>
                  )}
                </div>
              )}

              {step === offset && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Salon name" error={errors.name}>
                      <input
                        className={inputClass}
                        value={b.name}
                        onChange={(e) => set("name", e.target.value)}
                        autoComplete="organization"
                      />
                    </Field>
                  </div>

                  <div className="sm:col-span-2">
                    <span className={labelClass}>Business categories</span>
                    <div className="flex flex-wrap gap-2">
                      {(categoryOptions.data ?? []).map((category) => {
                        const on = categories.includes(category.default_name);
                        return (
                          <button
                            key={category.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleCategory(category.default_name)}
                            className={`press flex min-h-10 items-center gap-1.5 rounded-2xl px-3.5 text-sm font-bold transition-colors ${
                              on ? "bg-primary text-primary-foreground" : "glass-soft"
                            }`}
                          >
                            {on ? (
                              <Check className="size-3.5" />
                            ) : (
                              <CategoryIcon name={category.icon} />
                            )}
                            {category.default_name}
                          </button>
                        );
                      })}
                    </div>
                    {errors.categories ? (
                      <p className="mt-1.5 text-xs font-semibold text-destructive">
                        {errors.categories}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Pick every category your salon offers — clients filter by these.
                      </p>
                    )}
                  </div>

                  <Field label="Business phone" error={errors.businessPhone}>
                    <input
                      className={inputClass}
                      type="tel"
                      placeholder="+9714xxxxxxx"
                      value={b.businessPhone}
                      onChange={(e) => set("businessPhone", e.target.value)}
                      autoComplete="tel"
                    />
                  </Field>
                  <Field label="Business email" error={errors.businessEmail}>
                    <input
                      className={inputClass}
                      type="email"
                      value={b.businessEmail}
                      onChange={(e) => set("businessEmail", e.target.value)}
                      autoComplete="email"
                    />
                  </Field>

                  <Field label="Country" error={errors.country}>
                    <select
                      className={inputClass}
                      value={b.countryCode}
                      onChange={(e) => {
                        const c = getCountryByCode(e.target.value) ?? getDefaultCountry();
                        setB((prev) => ({
                          ...prev,
                          countryCode: c.iso_code,
                          country: c.default_name,
                          city: "",
                        }));
                      }}
                    >
                      {(countries.data ?? []).map((c) => (
                        <option key={c.iso_code} value={c.iso_code}>
                          {c.flag} {c.default_name} · {c.currency_code}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="City" error={errors.city}>
                    <input
                      className={inputClass}
                      list="salon-city-options"
                      placeholder="Start typing your city"
                      value={b.city}
                      onChange={(e) => set("city", e.target.value)}
                      autoComplete="address-level2"
                    />
                    <datalist id="salon-city-options">
                      {citiesFor(b.countryCode).map((c) => (
                        <option key={c.en} value={c.en}>
                          {c.ar}
                        </option>
                      ))}
                    </datalist>
                  </Field>

                  <div className="sm:col-span-2">
                    <span className={labelClass}>Full address</span>
                    <PlacesAutocomplete
                      className={inputClass}
                      value={b.address}
                      onChange={(value) => set("address", value)}
                      onSelect={applyPlace}
                    />
                    {errors.address && (
                      <p className="mt-1 text-xs font-semibold text-destructive">
                        {errors.address}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold text-muted-foreground">
                      <span className="rounded-full bg-secondary px-2.5 py-1">
                        Lat {b.latitude || "—"}
                      </span>
                      <span className="rounded-full bg-secondary px-2.5 py-1">
                        Lng {b.longitude || "—"}
                      </span>
                      <span className="rounded-full bg-secondary px-2.5 py-1">
                        Postal {b.postalCode || "—"}
                      </span>
                      <span className="rounded-full bg-secondary px-2.5 py-1">{timezone}</span>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <Field label="Business description" optional>
                      <textarea
                        rows={4}
                        className="w-full rounded-2xl bg-card/70 p-4 text-base outline-none ring-ring focus:ring-2"
                        value={b.description}
                        onChange={(e) => set("description", e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
              )}

              {step === offset + 1 && (
                <div className="grid gap-5 sm:grid-cols-2">
                  <ImageDrop
                    label="Logo"
                    hint="Required — square works best"
                    file={logoFile}
                    onChange={(file) => {
                      setLogoFile(file);
                      setErrors((prev) => ({ ...prev, logo: "" }));
                    }}
                  />
                  {errors.logo && (
                    <p className="-mt-3 text-xs font-semibold text-destructive sm:col-span-2">
                      {errors.logo}
                    </p>
                  )}
                  <ImageDrop
                    label="Cover image (optional)"
                    aspect="wide"
                    hint="Shown at the top of your salon page"
                    file={coverFile}
                    onChange={setCoverFile}
                  />

                  <div className="sm:col-span-2">
                    <span className={labelClass}>Gallery images (optional)</span>
                    <div className="flex flex-wrap gap-3">
                      {galleryFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="relative size-24 overflow-hidden rounded-2xl"
                        >
                          <img
                            src={URL.createObjectURL(file)}
                            alt={`Gallery ${index + 1}`}
                            className="size-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setGalleryFiles((prev) => prev.filter((_, i) => i !== index))
                            }
                            className="absolute end-1 top-1 rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {galleryFiles.length < 12 && (
                        <label className="press grid size-24 cursor-pointer place-items-center rounded-2xl border border-dashed border-border/70 bg-muted/30 text-xs font-bold text-muted-foreground">
                          Add photo
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              const picked = Array.from(e.target.files ?? []).filter((f) =>
                                f.type.startsWith("image/"),
                              );
                              setGalleryFiles((prev) => [...prev, ...picked].slice(0, 12));
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Up to 12 photos — you can always add more later from your dashboard.
                    </p>
                  </div>
                </div>
              )}

              {step === offset + 2 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Opens at" error={errors.opensAt}>
                    <input
                      className={inputClass}
                      type="time"
                      value={b.opensAt}
                      onChange={(e) => set("opensAt", e.target.value)}
                    />
                  </Field>
                  <Field label="Closes at" error={errors.closesAt}>
                    <input
                      className={inputClass}
                      type="time"
                      value={b.closesAt}
                      onChange={(e) => set("closesAt", e.target.value)}
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    These are your salon's default opening hours. Per-specialist shifts, breaks and
                    days off are configured in Availability after setup.
                  </p>

                  <label className="flex items-start gap-3 text-sm font-semibold sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={terms}
                      onChange={(e) => {
                        setTerms(e.target.checked);
                        setErrors((prev) => ({ ...prev, terms: "" }));
                      }}
                      className="mt-1 size-4 accent-primary"
                    />
                    I accept the Terms &amp; Conditions and confirm the details above are correct.
                  </label>
                  {errors.terms && (
                    <p className="text-xs font-semibold text-destructive sm:col-span-2">
                      {errors.terms}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => (step === 0 ? navigate({ to: "/" }) : setStep(step - 1))}
                className="press min-h-12 rounded-2xl glass-soft px-6 text-sm font-bold disabled:opacity-60"
              >
                {step === 0 ? "Cancel" : "Back"}
              </button>
              {step < steps.length - 1 ? (
                <button
                  type="submit"
                  disabled={
                    busy !== null || (needsAccount && step === 0 && !accountCreated && !passwordOk)
                  }
                  className="press flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-8 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {busy === "account" && <Loader2 className="size-4 animate-spin" />}
                  {busy === "account"
                    ? busyLabel || "Creating your account…"
                    : needsAccount && step === 0
                      ? "Create account & continue"
                      : "Continue"}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={busy !== null}
                  className="press flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-8 text-sm font-bold text-primary-foreground disabled:opacity-60"
                >
                  {busy === "salon" && <Loader2 className="size-4 animate-spin" />}
                  {busy === "salon" ? busyLabel || "Creating your salon…" : "Create my salon"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
