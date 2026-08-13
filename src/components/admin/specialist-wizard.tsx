import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ImagePlus,
  Loader2,
  Trash2,
  X,
} from "lucide-react";

import { ImageDrop } from "@/components/dallty/image-drop";
import { uploadAndSign } from "@/lib/storage";
import { useAuth } from "@/hooks/use-auth";
import {
  SPECIALIST_ROLES,
  money,
  useSaveStaff,
  useSaveStaffServices,
  type StaffInput,
  type StaffServiceAssignment,
} from "@/lib/admin";

export type WizardService = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  category: string;
};

export type SpecialistDraft = {
  id?: string;
  salonId: string;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  isActive: boolean;
  bio: string;
  experienceYears: string;
  languages: string;
  certificates: string;
  portfolio: string[];
  instagram: string;
  tiktok: string;
  website: string;
  assignments: StaffServiceAssignment[];
};

export function emptyDraft(salonId: string): SpecialistDraft {
  return {
    salonId,
    firstName: "",
    lastName: "",
    title: "Stylist",
    email: "",
    phone: "",
    avatarUrl: null,
    isActive: true,
    bio: "",
    experienceYears: "",
    languages: "",
    certificates: "",
    portfolio: [],
    instagram: "",
    tiktok: "",
    website: "",
    assignments: [],
  };
}

const STEPS = ["Identity", "Working hours", "Services", "Profile"] as const;

const input =
  "mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40";

type Props = {
  draft: SpecialistDraft;
  services: WizardService[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Four-step specialist wizard. Working hours stay in the existing availability
 * editor — step 2 only links there so the two systems never diverge.
 */
export function SpecialistWizard({ draft, services, currency, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SpecialistDraft>(draft);
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const portfolioInput = useRef<HTMLInputElement>(null);

  const saveStaff = useSaveStaff();
  const saveServices = useSaveStaffServices();
  const busy = saveStaff.isPending || saveServices.isPending || uploading;

  const set = <K extends keyof SpecialistDraft>(key: K, value: SpecialistDraft[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const assignedIds = useMemo(
    () => new Set(form.assignments.map((a) => a.serviceId)),
    [form.assignments],
  );

  const toggleService = (serviceId: string) => {
    setForm((prev) => ({
      ...prev,
      assignments: prev.assignments.some((a) => a.serviceId === serviceId)
        ? prev.assignments.filter((a) => a.serviceId !== serviceId)
        : [...prev.assignments, { serviceId, customPrice: null, customDuration: null }],
    }));
  };

  const patchAssignment = (serviceId: string, patch: Partial<StaffServiceAssignment>) =>
    setForm((prev) => ({
      ...prev,
      assignments: prev.assignments.map((a) =>
        a.serviceId === serviceId ? { ...a, ...patch } : a,
      ),
    }));

  const stepValid = () => {
    if (step === 0) return form.firstName.trim().length > 0 && form.title.trim().length > 0;
    if (step === 2) return form.assignments.length > 0 || services.length === 0;
    return true;
  };

  const addPortfolio = async (files: FileList | null) => {
    if (!files?.length || !user) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 6)) {
        if (!file.type.startsWith("image/")) continue;
        urls.push(await uploadAndSign("salon-media", user.id, file));
      }
      set("portfolio", [...form.portfolio, ...urls]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!form.firstName.trim()) {
      setStep(0);
      return toast.error("Enter a first name");
    }
    if (!form.assignments.length && services.length > 0) {
      setStep(2);
      return toast.error("Assign at least one service");
    }

    try {
      let avatar = form.avatarUrl;
      if (photo && user) {
        setUploading(true);
        avatar = await uploadAndSign("salon-media", user.id, photo);
        setUploading(false);
      }

      const social: Record<string, string> = {};
      if (form.instagram.trim()) social.instagram = form.instagram.trim();
      if (form.tiktok.trim()) social.tiktok = form.tiktok.trim();
      if (form.website.trim()) social.website = form.website.trim();

      const payload: StaffInput = {
        id: form.id,
        salon_id: form.salonId,
        full_name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        title: form.title.trim() || "Specialist",
        avatar_url: avatar,
        is_active: form.isActive,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        bio: form.bio.trim() || null,
        experience_years: form.experienceYears ? Number(form.experienceYears) : null,
        languages: splitList(form.languages),
        certificates: splitList(form.certificates),
        portfolio: form.portfolio,
        social_links: social,
      };

      const staffId = await saveStaff.mutateAsync(payload);
      await saveServices.mutateAsync({ staffId, assignments: form.assignments });
      toast.success(form.id ? "Specialist updated" : "Specialist added");
      onSaved();
    } catch (e) {
      setUploading(false);
      toast.error(e instanceof Error ? e.message : "Could not save specialist");
    }
  };

  return (
    <div className="rounded-3xl glass p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold">
            {form.id ? "Edit specialist" : "New specialist"}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Step {step + 1} of 4 · {STEPS[step]}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close wizard"
          className="press grid size-10 place-items-center rounded-2xl glass-soft"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4 flex gap-1.5">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i < step && setStep(i)}
            className="flex-1 text-left"
          >
            <span
              className={`block h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-border"}`}
            />
            <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {label}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <ImageDrop
                label="Photo"
                hint={form.avatarUrl && !photo ? "A photo is already saved." : "Square photo works best."}
                file={photo}
                onChange={setPhoto}
              />
              {form.avatarUrl && !photo && (
                <img
                  src={form.avatarUrl}
                  alt={form.firstName}
                  className="mt-2 size-16 rounded-2xl object-cover"
                />
              )}
            </div>
            <label className="text-sm font-bold">
              First name
              <input
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                className={input}
                placeholder="Layla"
              />
            </label>
            <label className="text-sm font-bold">
              Last name
              <input
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                className={input}
                placeholder="Hassan"
              />
            </label>
            <label className="text-sm font-bold">
              Role
              <input
                list="specialist-roles"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={input}
                placeholder="Senior colourist"
              />
              <datalist id="specialist-roles">
                {SPECIALIST_ROLES.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </label>
            <label className="text-sm font-bold">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className={input}
                placeholder="layla@salon.com"
              />
            </label>
            <label className="text-sm font-bold sm:col-span-2">
              Phone
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className={input}
                placeholder="+971 50 000 0000"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="size-4"
              />
              Taking bookings
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="rounded-2xl glass-soft p-5">
            <CalendarClock className="size-6 text-primary" />
            <h4 className="mt-2 text-base font-extrabold">Working hours</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Weekly hours, breaks, day overrides and time off stay in the availability editor —
              nothing changes there. Save this specialist first, then open their calendar to set
              hours.
            </p>
            {form.id && (
              <Link
                to="/admin/availability"
                search={{ staff: form.id }}
                className="press mt-3 inline-flex min-h-10 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                <CalendarClock className="size-4" /> Open availability editor
              </Link>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Pick everything this specialist performs. Leave price and duration empty to use the
              service defaults.
            </p>
            {services.length === 0 && (
              <p className="rounded-2xl glass-soft p-4 text-sm text-muted-foreground">
                Add a service first, then come back here.
              </p>
            )}
            {services.map((s) => {
              const on = assignedIds.has(s.id);
              const assignment = form.assignments.find((a) => a.serviceId === s.id);
              return (
                <div key={s.id} className="rounded-2xl glass-soft p-3">
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleService(s.id)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-lg ${
                        on ? "bg-primary text-primary-foreground" : "bg-background"
                      }`}
                    >
                      {on && <Check className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-extrabold">{s.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {s.category} · {s.duration_minutes} min · {money(s.price, currency)}
                      </span>
                    </span>
                  </button>
                  {on && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-bold text-muted-foreground">
                        Custom price (optional)
                        <input
                          type="number"
                          min={0}
                          value={assignment?.customPrice ?? ""}
                          onChange={(e) =>
                            patchAssignment(s.id, {
                              customPrice: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={input}
                          placeholder={String(s.price)}
                        />
                      </label>
                      <label className="text-xs font-bold text-muted-foreground">
                        Custom duration in minutes (optional)
                        <input
                          type="number"
                          min={5}
                          step={5}
                          value={assignment?.customDuration ?? ""}
                          onChange={(e) =>
                            patchAssignment(s.id, {
                              customDuration: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={input}
                          placeholder={String(s.duration_minutes)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-bold sm:col-span-2">
              Biography
              <textarea
                value={form.bio}
                onChange={(e) => set("bio", e.target.value)}
                rows={4}
                className={input}
                placeholder="Ten years shaping balayage and lived-in colour…"
              />
            </label>
            <label className="text-sm font-bold">
              Experience (years)
              <input
                type="number"
                min={0}
                value={form.experienceYears}
                onChange={(e) => set("experienceYears", e.target.value)}
                className={input}
                placeholder="8"
              />
            </label>
            <label className="text-sm font-bold">
              Languages
              <input
                value={form.languages}
                onChange={(e) => set("languages", e.target.value)}
                className={input}
                placeholder="Arabic, English, French"
              />
            </label>
            <label className="text-sm font-bold sm:col-span-2">
              Certificates
              <input
                value={form.certificates}
                onChange={(e) => set("certificates", e.target.value)}
                className={input}
                placeholder="L'Oréal Colour Specialist, Wella Master"
              />
            </label>

            <div className="sm:col-span-2">
              <span className="text-sm font-bold">Portfolio</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {form.portfolio.map((url) => (
                  <div key={url} className="relative size-20 overflow-hidden rounded-2xl">
                    <img src={url} alt="Portfolio work" className="size-full object-cover" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() =>
                        set(
                          "portfolio",
                          form.portfolio.filter((p) => p !== url),
                        )
                      }
                      className="press absolute right-1 top-1 grid size-6 place-items-center rounded-lg bg-background/90 text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => portfolioInput.current?.click()}
                  className="press grid size-20 place-items-center rounded-2xl border border-dashed border-border/70 text-muted-foreground"
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <ImagePlus className="size-5" />
                  )}
                </button>
                <input
                  ref={portfolioInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void addPortfolio(e.target.files)}
                />
              </div>
            </div>

            <label className="text-sm font-bold">
              Instagram
              <input
                value={form.instagram}
                onChange={(e) => set("instagram", e.target.value)}
                className={input}
                placeholder="https://instagram.com/…"
              />
            </label>
            <label className="text-sm font-bold">
              TikTok
              <input
                value={form.tiktok}
                onChange={(e) => set("tiktok", e.target.value)}
                className={input}
                placeholder="https://tiktok.com/@…"
              />
            </label>
            <label className="text-sm font-bold sm:col-span-2">
              Website
              <input
                value={form.website}
                onChange={(e) => set("website", e.target.value)}
                className={input}
                placeholder="https://…"
              />
            </label>
          </div>
        )}
      </div>

      <div className="mt-5 flex gap-2">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="press flex min-h-11 items-center gap-2 rounded-2xl glass-soft px-4 text-sm font-bold"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
        )}
        {step < 3 ? (
          <button
            type="button"
            disabled={!stepValid()}
            onClick={() => setStep(step + 1)}
            className="press ml-auto flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            Continue <ArrowRight className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="press ml-auto flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {form.id ? "Save specialist" : "Add specialist"}
          </button>
        )}
      </div>
    </div>
  );
}

function splitList(value: string) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
