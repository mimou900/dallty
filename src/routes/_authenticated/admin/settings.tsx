import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  Clock,
  CreditCard,
  Globe,
  Image as ImageIcon,
  Loader2,
  Lock,
  MapPin,
  Save,
  ScrollText,
  Settings2,
  Store,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { useActiveBusiness, invalidateCatalogue } from "@/lib/admin";
import { ImageDrop } from "@/components/dallty/image-drop";
import { MapPinPicker } from "@/components/admin/map-pin-picker";
import { PlacesAutocomplete } from "@/components/dallty/places-autocomplete";
import { uploadAndSign } from "@/lib/storage";
import { getBusinessSettings, saveBusinessSettings } from "@/lib/business-settings.functions";
import { BUSINESS_TYPES } from "@/lib/business-schema";
import { useCategories, useCountries } from "@/lib/reference-data";

type TabKey =
  | "general"
  | "business"
  | "location"
  | "hours"
  | "booking"
  | "photos"
  | "policies"
  | "notifications"
  | "payments"
  | "billing"
  | "seo"
  | "advanced";

const TABS: { key: TabKey; label: string; icon: typeof Store }[] = [
  { key: "general", label: "General", icon: Store },
  { key: "business", label: "Business", icon: Building2 },
  { key: "location", label: "Location", icon: MapPin },
  { key: "hours", label: "Opening hours", icon: Clock },
  { key: "booking", label: "Booking", icon: CalendarClock },
  { key: "photos", label: "Photos", icon: ImageIcon },
  { key: "policies", label: "Policies", icon: ScrollText },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "payments", label: "Payments", icon: Wallet },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "seo", label: "SEO", icon: Globe },
  { key: "advanced", label: "Advanced", icon: Settings2 },
];

export const Route = createFileRoute("/_authenticated/admin/settings")({
  validateSearch: (search: Record<string, unknown>): { tab: TabKey } => ({
    tab: (TABS.some((t) => t.key === search.tab) ? search.tab : "general") as TabKey,
  }),
  head: () => ({
    meta: [
      { title: "Business settings — Dallty Business" },
      {
        name: "description",
        content:
          "Manage your business profile, exact map location, opening hours, booking rules, photos, policies, notifications, payments and SEO on Dallty.",
      },
      { property: "og:title", content: "Business settings — Dallty Business" },
      { property: "og:description", content: "Configure how your business runs on Dallty." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Hours = { weekday: number; is_closed: boolean; opens_at: string; closes_at: string };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_HOURS: Hours[] = DAYS.map((_, weekday) => ({
  weekday,
  is_closed: false,
  opens_at: "09:00",
  closes_at: "21:00",
}));

const inputClass =
  "min-h-11 w-full rounded-2xl border border-border/70 bg-background px-3 text-sm font-medium outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block min-w-0 ${className ?? ""}`}>
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl glass p-4 sm:p-6">
      <h2 className="text-base font-extrabold">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="press flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-background p-3 text-start"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        {description ? (
          <span className="block text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-all ${
            checked ? "start-[1.375rem]" : "start-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function SettingsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user, hasRole } = useAuth();
  const isPlatformAdmin = hasRole("super_admin") || hasRole("admin");
  const { businessId, isLoading } = useActiveBusiness();
  const queryClient = useQueryClient();

  const fetchSettings = useServerFn(getBusinessSettings);
  const persist = useServerFn(saveBusinessSettings);

  const [form, setForm] = useState<Record<string, any>>({});
  const [hours, setHours] = useState<Hours[]>(DEFAULT_HOURS);
  const [logo, setLogo] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);

  const settings = useQuery({
    queryKey: ["business-settings", businessId],
    enabled: Boolean(businessId),
    queryFn: () => fetchSettings({ data: { businessId: businessId! } }),
  });

  useEffect(() => {
    const business = settings.data?.business;
    if (!business) return;
    setForm({
      ...business,
      opens_at: (business.opens_at ?? "09:00").slice(0, 5),
      closes_at: (business.closes_at ?? "21:00").slice(0, 5),
      categories: business.categories ?? [],
    });
    const stored = settings.data?.hours ?? [];
    setHours(
      DEFAULT_HOURS.map((base) => {
        const hit = stored.find((h: any) => h.weekday === base.weekday);
        return hit
          ? {
              weekday: base.weekday,
              is_closed: Boolean(hit.is_closed),
              opens_at: String(hit.opens_at).slice(0, 5),
              closes_at: String(hit.closes_at).slice(0, 5),
            }
          : {
              ...base,
              opens_at: (business.opens_at ?? "09:00").slice(0, 5),
              closes_at: (business.closes_at ?? "21:00").slice(0, 5),
            };
      }),
    );
  }, [settings.data]);

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const countries = useCountries();
  const countryOptions = countries.data ?? [];
  const categoryOptions = useCategories();

  const save = useMutation({
    mutationFn: async () => {
      if (!businessId || !user) throw new Error("No business to update");
      const patch: Record<string, any> = {
        name: form.name ?? "",
        name_ar: form.name_ar ?? null,
        description: form.description ?? null,
        description_ar: form.description_ar ?? null,
        business_type: form.business_type ?? null,
        categories: form.categories ?? [],
        phone: form.phone ?? null,
        business_email: form.business_email ?? null,
        business_phone: form.business_phone ?? null,
        website_url: form.website_url ?? null,
        instagram_url: form.instagram_url ?? null,
        facebook_url: form.facebook_url ?? null,
        tiktok_url: form.tiktok_url ?? null,
        address: form.address ?? null,
        country: form.country ?? null,
        country_code: form.country_code ?? "",
        city: form.city ?? "",
        district: form.district ?? null,
        area: form.area ?? form.district ?? form.city ?? "",
        postal_code: form.postal_code ?? null,
        latitude:
          form.latitude === null || form.latitude === undefined || form.latitude === ""
            ? null
            : Number(form.latitude),
        longitude:
          form.longitude === null || form.longitude === undefined || form.longitude === ""
            ? null
            : Number(form.longitude),
        maps_url: form.maps_url ?? null,
        timezone: form.timezone ?? "UTC",
        currency: form.currency ?? "USD",
        opens_at: hours.find((h) => !h.is_closed)?.opens_at ?? form.opens_at ?? "09:00",
        closes_at: hours.find((h) => !h.is_closed)?.closes_at ?? form.closes_at ?? "21:00",
        instant_booking: Boolean(form.instant_booking),
        booking_confirmation: form.booking_confirmation ?? "manual",
        buffer_minutes: Number(form.buffer_minutes ?? 0),
        cancellation_hours: Number(form.cancellation_hours ?? 0),
        max_booking_days: Number(form.max_booking_days ?? 30),
        slot_interval_minutes: Number(form.slot_interval_minutes ?? 15),
        min_notice_hours: Number(form.min_notice_hours ?? 1),
        allow_waitlist: Boolean(form.allow_waitlist),
        cancellation_policy: form.cancellation_policy ?? null,
        cancellation_policy_ar: form.cancellation_policy_ar ?? null,
        house_rules: form.house_rules ?? null,
        house_rules_ar: form.house_rules_ar ?? null,
        owner_story: form.owner_story ?? null,
        notify_new_booking: Boolean(form.notify_new_booking),
        notify_cancellation: Boolean(form.notify_cancellation),
        notify_review: Boolean(form.notify_review),
        notify_daily_summary: Boolean(form.notify_daily_summary),
        notify_email_address: form.notify_email_address ?? null,
        accept_cash: Boolean(form.accept_cash),
        accept_card: Boolean(form.accept_card),
        accept_online: Boolean(form.accept_online),
        require_deposit: Boolean(form.require_deposit),
        deposit_percent: Number(form.deposit_percent ?? 0),
        tax_rate: Number(form.tax_rate ?? 0),
        seo_title: form.seo_title ?? null,
        seo_description: form.seo_description ?? null,
        seo_keywords: form.seo_keywords ?? null,
        is_active: form.is_active !== false,
      };
      if (logo) patch.logo_url = await uploadAndSign("business-media", user.id, logo);
      if (cover) {
        const url = await uploadAndSign("business-media", user.id, cover);
        patch.cover_url = url;
        patch.image_url = url;
      }
      await persist({ data: { businessId, patch, hours } });
    },
    onSuccess: () => {
      setLogo(null);
      setCover(null);
      queryClient.invalidateQueries({ queryKey: ["business-settings", businessId] });
      invalidateCatalogue(queryClient);
      toast.success("Settings saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  if (isLoading || settings.isLoading) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="rounded-3xl glass p-6">
        {isPlatformAdmin ? (
          <>
            <p className="text-sm font-bold">Pick a business to manage.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Platform admin accounts don’t own a business — choose any business from the business
              selector above, or browse them in the platform directory.
            </p>
            <Link
              to="/admin/platform/directory"
              className="press mt-4 inline-flex min-h-11 items-center rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              Open directory
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-bold">No business linked to this account yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Register your business to unlock business settings.
            </p>
            <Link
              to="/business/signup"
              className="press mt-4 inline-flex min-h-11 items-center rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              Register a business
            </Link>
          </>
        )}
      </div>
    );
  }

  const pin =
    form.latitude !== null &&
    form.latitude !== undefined &&
    form.longitude !== null &&
    form.longitude !== undefined
      ? { lat: Number(form.latitude), lng: Number(form.longitude) }
      : null;

  return (
    <form
      className="space-y-4 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black sm:text-2xl">Business settings</h1>
          <p className="truncate text-sm text-muted-foreground">
            {form.name || "Your business"} · {form.city || "—"}
          </p>
        </div>
        <button
          type="submit"
          disabled={save.isPending}
          className="press hidden min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-float disabled:opacity-60 sm:inline-flex"
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save changes
        </button>
      </header>

      {/* Tabs — horizontally scrollable on mobile, wrapped grid on desktop */}
      <nav
        aria-label="Settings sections"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:flex-wrap lg:overflow-visible"
      >
        {TABS.map((item) => {
          const active = item.key === tab;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => void navigate({ search: { tab: item.key }, replace: true })}
              aria-current={active ? "page" : undefined}
              className={`press inline-flex min-h-10 shrink-0 items-center gap-2 rounded-2xl px-3.5 text-sm font-bold transition ${
                active ? "bg-primary text-primary-foreground shadow-float" : "glass-soft"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {tab === "general" && (
        <Section title="General" description="The basics clients see first.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">
              <input
                className={inputClass}
                value={form.name ?? ""}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </Field>
            <Field label="Business name (Arabic)">
              <input
                dir="rtl"
                className={inputClass}
                value={form.name_ar ?? ""}
                onChange={(e) => set("name_ar", e.target.value)}
              />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea
                className={`${inputClass} min-h-24 py-2`}
                value={form.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
            <Field label="Description (Arabic)" className="sm:col-span-2">
              <textarea
                dir="rtl"
                className={`${inputClass} min-h-24 py-2`}
                value={form.description_ar ?? ""}
                onChange={(e) => set("description_ar", e.target.value)}
              />
            </Field>
            <Field label="Public phone">
              <input
                className={inputClass}
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </Field>
            <Field label="Website">
              <input
                className={inputClass}
                value={form.website_url ?? ""}
                onChange={(e) => set("website_url", e.target.value)}
              />
            </Field>
          </div>
        </Section>
      )}

      {tab === "business" && (
        <div className="space-y-4">
          <Section
            title="Business profile"
            description="How Dallty classifies and contacts your business."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Business type">
                <select
                  className={inputClass}
                  value={form.business_type ?? ""}
                  onChange={(e) => set("business_type", e.target.value)}
                >
                  <option value="">Select a type</option>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Business email" hint="Private — used for account and booking notices.">
                <input
                  type="email"
                  className={inputClass}
                  value={form.business_email ?? ""}
                  onChange={(e) => set("business_email", e.target.value)}
                />
              </Field>
              <Field label="Business phone" hint="Private line, not shown publicly.">
                <input
                  className={inputClass}
                  value={form.business_phone ?? ""}
                  onChange={(e) => set("business_phone", e.target.value)}
                />
              </Field>
              <Field label="Owner story" className="sm:col-span-2">
                <textarea
                  className={`${inputClass} min-h-24 py-2`}
                  value={form.owner_story ?? ""}
                  onChange={(e) => set("owner_story", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Categories" description="Pick everything your business offers.">
            <div className="flex flex-wrap gap-2">
              {(categoryOptions.data ?? []).map((category) => {
                const value = category.default_name;
                const label = category.default_name;
                const selected = (form.categories ?? []).includes(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() =>
                      set(
                        "categories",
                        selected
                          ? (form.categories ?? []).filter((c: string) => c !== value)
                          : [...(form.categories ?? []), value],
                      )
                    }
                    className={`press min-h-10 rounded-2xl px-3.5 text-sm font-semibold transition ${
                      selected ? "bg-primary text-primary-foreground" : "glass-soft"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Social profiles">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Instagram">
                <input
                  className={inputClass}
                  value={form.instagram_url ?? ""}
                  onChange={(e) => set("instagram_url", e.target.value)}
                />
              </Field>
              <Field label="Facebook">
                <input
                  className={inputClass}
                  value={form.facebook_url ?? ""}
                  onChange={(e) => set("facebook_url", e.target.value)}
                />
              </Field>
              <Field label="TikTok">
                <input
                  className={inputClass}
                  value={form.tiktok_url ?? ""}
                  onChange={(e) => set("tiktok_url", e.target.value)}
                />
              </Field>
            </div>
          </Section>
        </div>
      )}

      {tab === "location" && (
        <div className="space-y-4">
          <Section
            title="Location"
            description="Search your address with Google, then drag the pin to the exact entrance."
          >
            <div className="grid gap-4">
              <Field label="Full address">
                <PlacesAutocomplete
                  className={inputClass}
                  value={form.address ?? ""}
                  onChange={(v) => set("address", v)}
                  onSelect={(place) =>
                    setForm((f) => ({
                      ...f,
                      address: place.address,
                      city: place.city || f.city,
                      district: place.district || f.district,
                      country: place.country || f.country,
                      country_code: (place.countryCode || f.country_code || "").toUpperCase(),
                      postal_code: place.postalCode || f.postal_code,
                      latitude: place.latitude,
                      longitude: place.longitude,
                      maps_url: place.mapsUrl || f.maps_url,
                      area: f.area || place.district || place.city,
                    }))
                  }
                />
              </Field>

              <MapPinPicker
                value={pin}
                onChange={(next) =>
                  setForm((f) => ({ ...f, latitude: next.lat, longitude: next.lng }))
                }
              />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Country">
                  <select
                    className={inputClass}
                    value={form.country_code ?? ""}
                    onChange={(e) => {
                      const hit = countryOptions.find((c) => c.iso_code === e.target.value);
                      setForm((f) => ({
                        ...f,
                        country_code: e.target.value,
                        country: hit?.default_name ?? f.country,
                      }));
                    }}
                  >
                    <option value="">Select a country</option>
                    {countryOptions.map((c) => (
                      <option key={c.iso_code} value={c.iso_code}>
                        {c.flag} {c.default_name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="State / Province">
                  <input
                    className={inputClass}
                    value={form.district ?? ""}
                    onChange={(e) => set("district", e.target.value)}
                  />
                </Field>
                <Field label="City">
                  <input
                    className={inputClass}
                    value={form.city ?? ""}
                    onChange={(e) => set("city", e.target.value)}
                  />
                </Field>
                <Field label="Postal code">
                  <input
                    className={inputClass}
                    value={form.postal_code ?? ""}
                    onChange={(e) => set("postal_code", e.target.value)}
                  />
                </Field>
                <Field label="Latitude">
                  <input
                    inputMode="decimal"
                    className={inputClass}
                    value={form.latitude ?? ""}
                    onChange={(e) =>
                      set("latitude", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </Field>
                <Field label="Longitude">
                  <input
                    inputMode="decimal"
                    className={inputClass}
                    value={form.longitude ?? ""}
                    onChange={(e) =>
                      set("longitude", e.target.value === "" ? null : Number(e.target.value))
                    }
                  />
                </Field>
              </div>
            </div>
          </Section>
        </div>
      )}

      {tab === "hours" && (
        <Section
          title="Opening hours"
          description="Business-level hours. Specialist shifts live in availability."
        >
          <div className="space-y-2">
            {hours.map((day, index) => (
              <div
                key={day.weekday}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border/70 bg-background p-3 sm:grid-cols-[8rem_auto_1fr]"
              >
                <span className="truncate text-sm font-bold">{DAYS[day.weekday]}</span>
                <button
                  type="button"
                  onClick={() =>
                    setHours((h) =>
                      h.map((d, i) => (i === index ? { ...d, is_closed: !d.is_closed } : d)),
                    )
                  }
                  className={`press min-h-9 shrink-0 rounded-xl px-3 text-xs font-bold ${
                    day.is_closed ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                  }`}
                >
                  {day.is_closed ? "Closed" : "Open"}
                </button>
                {!day.is_closed && (
                  <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                    <input
                      type="time"
                      className={inputClass}
                      value={day.opens_at}
                      onChange={(e) =>
                        setHours((h) =>
                          h.map((d, i) => (i === index ? { ...d, opens_at: e.target.value } : d)),
                        )
                      }
                    />
                    <span className="text-sm text-muted-foreground">–</span>
                    <input
                      type="time"
                      className={inputClass}
                      value={day.closes_at}
                      onChange={(e) =>
                        setHours((h) =>
                          h.map((d, i) => (i === index ? { ...d, closes_at: e.target.value } : d)),
                        )
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              const first = hours[0];
              setHours((h) =>
                h.map((d) => ({ ...d, opens_at: first.opens_at, closes_at: first.closes_at })),
              );
            }}
            className="press mt-3 min-h-10 rounded-2xl glass-soft px-4 text-sm font-bold"
          >
            Apply Sunday hours to every day
          </button>
        </Section>
      )}

      {tab === "booking" && (
        <Section title="Booking rules" description="How clients can book with you.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Confirmation">
              <select
                className={inputClass}
                value={form.booking_confirmation ?? "manual"}
                onChange={(e) => set("booking_confirmation", e.target.value)}
              >
                <option value="manual">Approve each booking manually</option>
                <option value="auto">Confirm automatically</option>
              </select>
            </Field>
            <Field label="Slot interval (minutes)">
              <input
                type="number"
                min={5}
                max={120}
                step={5}
                className={inputClass}
                value={form.slot_interval_minutes ?? 15}
                onChange={(e) => set("slot_interval_minutes", Number(e.target.value))}
              />
            </Field>
            <Field label="Buffer between bookings (minutes)">
              <input
                type="number"
                min={0}
                max={240}
                className={inputClass}
                value={form.buffer_minutes ?? 0}
                onChange={(e) => set("buffer_minutes", Number(e.target.value))}
              />
            </Field>
            <Field label="Minimum notice (hours)">
              <input
                type="number"
                min={0}
                max={240}
                className={inputClass}
                value={form.min_notice_hours ?? 1}
                onChange={(e) => set("min_notice_hours", Number(e.target.value))}
              />
            </Field>
            <Field label="Cancellation window (hours)">
              <input
                type="number"
                min={0}
                max={720}
                className={inputClass}
                value={form.cancellation_hours ?? 24}
                onChange={(e) => set("cancellation_hours", Number(e.target.value))}
              />
            </Field>
            <Field label="Book up to (days ahead)">
              <input
                type="number"
                min={1}
                max={365}
                className={inputClass}
                value={form.max_booking_days ?? 30}
                onChange={(e) => set("max_booking_days", Number(e.target.value))}
              />
            </Field>
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
              <Toggle
                label="Instant booking"
                description="Show the instant-booking badge in the marketplace."
                checked={Boolean(form.instant_booking)}
                onChange={(v) => set("instant_booking", v)}
              />
              <Toggle
                label="Waitlist"
                description="Let clients join a waitlist when a day is full."
                checked={Boolean(form.allow_waitlist)}
                onChange={(v) => set("allow_waitlist", v)}
              />
            </div>
          </div>
        </Section>
      )}

      {tab === "photos" && (
        <Section
          title="Photos"
          description="A sharp logo and a wide cover shot make your listing convert."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageDrop label="Logo" file={logo} onChange={setLogo} />
            <ImageDrop label="Cover photo" file={cover} onChange={setCover} aspect="wide" />
          </div>
          {(form.logo_url || form.cover_url) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {form.logo_url ? (
                <img
                  src={form.logo_url}
                  alt="Current logo"
                  className="h-28 w-28 rounded-2xl object-cover"
                />
              ) : null}
              {form.cover_url ? (
                <img
                  src={form.cover_url}
                  alt="Current cover"
                  className="h-28 w-full rounded-2xl object-cover"
                />
              ) : null}
            </div>
          )}
        </Section>
      )}

      {tab === "policies" && (
        <Section title="Policies" description="Shown to clients before they confirm a booking.">
          <div className="grid gap-4">
            <Field label="Cancellation policy">
              <textarea
                className={`${inputClass} min-h-24 py-2`}
                value={form.cancellation_policy ?? ""}
                onChange={(e) => set("cancellation_policy", e.target.value)}
              />
            </Field>
            <Field label="Cancellation policy (Arabic)">
              <textarea
                dir="rtl"
                className={`${inputClass} min-h-24 py-2`}
                value={form.cancellation_policy_ar ?? ""}
                onChange={(e) => set("cancellation_policy_ar", e.target.value)}
              />
            </Field>
            <Field label="House rules">
              <textarea
                className={`${inputClass} min-h-24 py-2`}
                value={form.house_rules ?? ""}
                onChange={(e) => set("house_rules", e.target.value)}
              />
            </Field>
            <Field label="House rules (Arabic)">
              <textarea
                dir="rtl"
                className={`${inputClass} min-h-24 py-2`}
                value={form.house_rules_ar ?? ""}
                onChange={(e) => set("house_rules_ar", e.target.value)}
              />
            </Field>
          </div>
        </Section>
      )}

      {tab === "notifications" && (
        <Section title="Notifications" description="What your team gets alerted about.">
          <div className="grid gap-2 sm:grid-cols-2">
            <Toggle
              label="New bookings"
              checked={form.notify_new_booking !== false}
              onChange={(v) => set("notify_new_booking", v)}
            />
            <Toggle
              label="Cancellations & reschedules"
              checked={form.notify_cancellation !== false}
              onChange={(v) => set("notify_cancellation", v)}
            />
            <Toggle
              label="New reviews"
              checked={form.notify_review !== false}
              onChange={(v) => set("notify_review", v)}
            />
            <Toggle
              label="Daily summary email"
              checked={Boolean(form.notify_daily_summary)}
              onChange={(v) => set("notify_daily_summary", v)}
            />
          </div>
          <div className="mt-4 max-w-md">
            <Field label="Send notifications to" hint="Leave empty to use your business email.">
              <input
                type="email"
                className={inputClass}
                value={form.notify_email_address ?? ""}
                onChange={(e) => set("notify_email_address", e.target.value)}
              />
            </Field>
          </div>
        </Section>
      )}

      {tab === "payments" && (
        <Section
          title="Payments"
          description="How clients pay you today. Online payments arrive with Billing."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Toggle
              label="Cash"
              checked={form.accept_cash !== false}
              onChange={(v) => set("accept_cash", v)}
            />
            <Toggle
              label="Card in business"
              checked={Boolean(form.accept_card)}
              onChange={(v) => set("accept_card", v)}
            />
            <Toggle
              label="Online payment"
              description="Coming soon"
              checked={Boolean(form.accept_online)}
              onChange={(v) => set("accept_online", v)}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Toggle
              label="Require deposit"
              checked={Boolean(form.require_deposit)}
              onChange={(v) => set("require_deposit", v)}
            />
            <Field label="Deposit (%)">
              <input
                type="number"
                min={0}
                max={100}
                className={inputClass}
                value={form.deposit_percent ?? 0}
                onChange={(e) => set("deposit_percent", Number(e.target.value))}
              />
            </Field>
            <Field label="Tax rate (%)">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                className={inputClass}
                value={form.tax_rate ?? 0}
                onChange={(e) => set("tax_rate", Number(e.target.value))}
              />
            </Field>
          </div>
        </Section>
      )}

      {tab === "billing" && (
        <Section title="Billing" description="Your Dallty subscription.">
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <Lock className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-bold">Billing is coming soon</p>
            <p className="mt-1 text-sm text-muted-foreground">
              You are on the{" "}
              <span className="font-semibold capitalize">{form.plan ?? "starter"}</span> plan.
              Invoices and plan changes will appear here.
            </p>
          </div>
        </Section>
      )}

      {tab === "seo" && (
        <Section title="SEO" description="How your business appears on Google and when shared.">
          <div className="grid gap-4">
            <Field label="Page title" hint="Keep it under 60 characters.">
              <input
                maxLength={120}
                className={inputClass}
                value={form.seo_title ?? ""}
                onChange={(e) => set("seo_title", e.target.value)}
                placeholder={form.name ? `${form.name} — book online on Dallty` : ""}
              />
            </Field>
            <Field label="Meta description" hint="Keep it under 160 characters.">
              <textarea
                maxLength={320}
                className={`${inputClass} min-h-20 py-2`}
                value={form.seo_description ?? ""}
                onChange={(e) => set("seo_description", e.target.value)}
              />
            </Field>
            <Field label="Keywords" hint="Comma separated.">
              <input
                className={inputClass}
                value={form.seo_keywords ?? ""}
                onChange={(e) => set("seo_keywords", e.target.value)}
              />
            </Field>
          </div>
        </Section>
      )}

      {tab === "advanced" && (
        <div className="space-y-4">
          <Section
            title="Regional"
            description="Currency and time zone used across bookings and reports."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <input
                  className={inputClass}
                  value={form.currency ?? "USD"}
                  onChange={(e) => set("currency", e.target.value.toUpperCase())}
                />
              </Field>
              <Field label="Time zone">
                <input
                  className={inputClass}
                  value={form.timezone ?? "UTC"}
                  onChange={(e) => set("timezone", e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Marketplace" description="Listing status is reviewed by the Dallty team.">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-2xl glass-soft px-3.5 py-2 text-sm font-bold capitalize">
                <BadgeCheck className="size-4 text-primary" />
                {String(form.marketplace_status ?? "draft").replace("_", " ")}
              </span>
              <Link
                to="/admin/marketplace"
                className="press inline-flex min-h-10 items-center rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                Open marketplace
              </Link>
            </div>
          </Section>

          <Section title="Visibility" description="Pause your business without deleting anything.">
            <Toggle
              label="Business is open"
              description="Turning this off hides you from the marketplace and stops new bookings."
              checked={form.is_active !== false}
              onChange={(v) => set("is_active", v)}
            />
          </Section>
        </div>
      )}

      {/* Mobile sticky save */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 p-3 backdrop-blur sm:hidden">
        <button
          type="submit"
          disabled={save.isPending}
          className="press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save changes
        </button>
      </div>
    </form>
  );
}
