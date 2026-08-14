import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Scissors,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { ListingReadiness } from "@/components/admin/listing-readiness";
import { ImageDrop } from "@/components/dallty/image-drop";
import { useAuth } from "@/hooks/use-auth";
import { uploadAndSign } from "@/lib/storage";
import {
  SERVICE_CATEGORIES,
  SERVICE_TAGS,
  money,
  useDeleteService,
  useManagedBusinesses,
  useManagedServices,
  useManagedStaff,
  useSaveService,
  useStaffServices,
  useToggleStaffService,
  type ServiceInput,
} from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/services")({
  head: () => ({
    meta: [
      { title: "Service catalogue — Dallty Business" },
      {
        name: "description",
        content:
          "Create, price and publish the services your salon offers, and choose which specialists perform each one.",
      },
      { property: "og:title", content: "Service catalogue — Dallty Business" },
      { property: "og:description", content: "Build and price your full menu of services." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ServicesPage,
});

const EMPTY = (businessId: string): ServiceInput => ({
  business_id: businessId,
  name: "",
  category: "hair",
  description: "",
  duration_minutes: 60,
  price: 100,
  discount_price: null,
  is_active: true,
  image_url: null,
  deposit: null,
  processing_minutes: 0,
  cleanup_minutes: 0,
  tag: "Standard",
});

const field =
  "mt-1 w-full rounded-2xl glass-soft px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40";

type Filters = {
  q: string;
  category: string;
  maxPrice: string;
  duration: string;
  status: "all" | "active" | "hidden";
};

const DEFAULT_FILTERS: Filters = {
  q: "",
  category: "all",
  maxPrice: "",
  duration: "all",
  status: "all",
};

function ServicesPage() {
  const { user } = useAuth();
  const businessesQuery = useManagedBusinesses();
  const businesses = businessesQuery.data ?? [];
  const [businessId, setBusinessId] = useState<string | null>(null);
  const activeBusinessId = businessId ?? businesses[0]?.id ?? null;
  const business = businesses.find((s) => s.id === activeBusinessId) ?? null;
  const ids = activeBusinessId ? [activeBusinessId] : [];

  const services = useManagedServices(ids);
  const staff = useManagedStaff(ids);
  const links = useStaffServices(ids);
  const save = useSaveService();
  const remove = useDeleteService();
  const toggleLink = useToggleStaffService();

  const [draft, setDraft] = useState<ServiceInput | null>(null);
  const [draftStaff, setDraftStaff] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  const linkedPairs = useMemo(() => {
    const activeStaffIds = new Set((staff.data ?? []).filter((s) => s.is_active).map((s) => s.id));
    const activeServiceIds = new Set(
      (services.data ?? []).filter((s) => s.is_active).map((s) => s.id),
    );
    return (links.data ?? []).filter(
      (l) => activeStaffIds.has(l.staff_id) && activeServiceIds.has(l.service_id),
    ).length;
  }, [links.data, staff.data, services.data]);

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return (services.data ?? []).filter((s) => {
      if (q && !`${s.name} ${s.category} ${s.description ?? ""}`.toLowerCase().includes(q))
        return false;
      if (filters.category !== "all" && s.category !== filters.category) return false;
      if (filters.status === "active" && !s.is_active) return false;
      if (filters.status === "hidden" && s.is_active) return false;
      const price = Number(s.discount_price ?? s.price);
      if (filters.maxPrice && price > Number(filters.maxPrice)) return false;
      const d = s.duration_minutes;
      if (filters.duration === "short" && d > 30) return false;
      if (filters.duration === "medium" && (d <= 30 || d > 60)) return false;
      if (filters.duration === "long" && d <= 60) return false;
      return true;
    });
  }, [services.data, filters]);

  if (businessesQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!activeBusinessId)
    return (
      <div className="rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
        No business linked to your account yet.
      </div>
    );

  const openWizard = (input: ServiceInput, assigned: string[] = []) => {
    setDraft(input);
    setDraftStaff(assigned);
    setImageFile(null);
    setStep(0);
  };

  const closeWizard = () => {
    setDraft(null);
    setDraftStaff([]);
    setImageFile(null);
    setStep(0);
  };

  const stepValid = (index: number) => {
    if (!draft) return false;
    if (index === 0)
      return Boolean(draft.name.trim()) && draft.duration_minutes >= 5 && draft.price >= 0;
    if (index === 1) return draftStaff.length > 0;
    return true;
  };

  const submit = async () => {
    if (!draft) return;
    if (!stepValid(0)) return toast.error("Add a name, duration and price first");
    if (!stepValid(1)) return toast.error("Assign at least one specialist");
    try {
      setUploading(true);
      let imageUrl = draft.image_url;
      if (imageFile && user) imageUrl = await uploadAndSign("business-media", user.id, imageFile);

      const serviceId = await save.mutateAsync({
        ...draft,
        business_id: activeBusinessId,
        name: draft.name.trim(),
        image_url: imageUrl,
        tag: draft.tag || "Standard",
      });

      const before = (links.data ?? [])
        .filter((l) => l.service_id === serviceId)
        .map((l) => l.staff_id);
      const add = draftStaff.filter((id) => !before.includes(id));
      const drop = before.filter((id) => !draftStaff.includes(id));
      for (const staffId of add)
        await toggleLink.mutateAsync({ staffId, serviceId, enabled: true });
      for (const staffId of drop)
        await toggleLink.mutateAsync({ staffId, serviceId, enabled: false });

      toast.success(draft.id ? "Service updated" : "Service added");
      closeWizard();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save service");
    } finally {
      setUploading(false);
    }
  };

  const busy = save.isPending || uploading;
  const steps = ["Basics", "Specialists", "Options"];

  return (
    <div className="space-y-5">
      {businesses.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {businesses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setBusinessId(s.id)}
              className={`press min-h-10 rounded-2xl px-4 text-sm font-bold ${
                s.id === activeBusinessId ? "bg-primary text-primary-foreground" : "glass-soft"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {business && (
        <ListingReadiness
          businessName={business.name}
          isListed={Boolean(business.is_listed)}
          status={business.status}
          activeServices={(services.data ?? []).filter((s) => s.is_active).length}
          activeStaff={(staff.data ?? []).filter((s) => s.is_active).length}
          linkedPairs={linkedPairs}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">
          Services ({visible.length}
          {visible.length !== (services.data ?? []).length ? ` / ${services.data?.length}` : ""})
        </h2>
        <button
          type="button"
          onClick={() => openWizard(EMPTY(activeBusinessId))}
          className="press flex min-h-10 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <Plus className="size-4" /> Add service
        </button>
      </div>

      {/* filters */}
      <div className="rounded-3xl glass p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Search services"
            className="w-full rounded-2xl glass-soft py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="rounded-2xl glass-soft px-3 py-2.5 text-sm font-semibold capitalize"
          >
            <option value="all">All categories</option>
            {SERVICE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filters.duration}
            onChange={(e) => setFilters({ ...filters, duration: e.target.value })}
            className="rounded-2xl glass-soft px-3 py-2.5 text-sm font-semibold"
          >
            <option value="all">Any duration</option>
            <option value="short">Up to 30 min</option>
            <option value="medium">31–60 min</option>
            <option value="long">Over 60 min</option>
          </select>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={filters.maxPrice}
            onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })}
            placeholder="Max price"
            className="rounded-2xl glass-soft px-3 py-2.5 text-sm font-semibold"
          />
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters({ ...filters, status: e.target.value as Filters["status"] })
            }
            className="rounded-2xl glass-soft px-3 py-2.5 text-sm font-semibold"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
      </div>

      {/* wizard */}
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 2) {
              if (!stepValid(step)) {
                toast.error(step === 0 ? "Complete the basics" : "Pick at least one specialist");
                return;
              }
              setStep(step + 1);
              return;
            }
            void submit();
          }}
          className="rounded-3xl glass p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {steps.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  className={`min-h-8 rounded-2xl px-3 text-xs font-bold ${
                    i === step
                      ? "bg-primary text-primary-foreground"
                      : i < step
                        ? "bg-primary/15 text-primary"
                        : "glass-soft text-muted-foreground"
                  }`}
                >
                  {i + 1}. {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={closeWizard}
              aria-label="Close"
              className="press grid size-9 place-items-center rounded-2xl glass-soft"
            >
              <X className="size-4" />
            </button>
          </div>

          {step === 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold sm:col-span-2">
                Service name
                <input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={field}
                  placeholder="Signature blow-dry"
                />
              </label>
              <label className="text-sm font-bold">
                Category
                <select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  className={`${field} capitalize`}
                >
                  {SERVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Duration (minutes)
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={draft.duration_minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, duration_minutes: Number(e.target.value) })
                  }
                  className={field}
                />
              </label>
              <label className="text-sm font-bold">
                Price
                <input
                  type="number"
                  min={0}
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                  className={field}
                />
              </label>
              <label className="text-sm font-bold">
                Discount price (optional)
                <input
                  type="number"
                  min={0}
                  value={draft.discount_price ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      discount_price: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={field}
                />
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="mt-4">
              <p className="text-sm font-bold">Who performs this service?</p>
              <p className="text-xs text-muted-foreground">
                At least one specialist is required so clients can book it.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(staff.data ?? []).length === 0 ? (
                  <span className="text-sm text-muted-foreground">Add a specialist first.</span>
                ) : (
                  (staff.data ?? []).map((m) => {
                    const on = draftStaff.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDraftStaff(
                            on ? draftStaff.filter((id) => id !== m.id) : [...draftStaff, m.id],
                          )
                        }
                        className={`press flex min-h-10 items-center gap-2 rounded-2xl px-3.5 text-sm font-bold ${
                          on ? "bg-primary text-primary-foreground" : "glass-soft"
                        }`}
                      >
                        {on && <Check className="size-4" />}
                        {m.full_name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold sm:col-span-2">
                Description
                <textarea
                  rows={2}
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className={field}
                />
              </label>
              <div className="sm:col-span-2">
                <ImageDrop
                  label="Service image (optional)"
                  hint="JPG or PNG up to 5 MB"
                  file={imageFile}
                  onChange={setImageFile}
                  aspect="wide"
                  busy={uploading}
                />
              </div>
              <label className="text-sm font-bold">
                Deposit (optional)
                <input
                  type="number"
                  min={0}
                  value={draft.deposit ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      deposit: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  className={field}
                />
              </label>
              <label className="text-sm font-bold">
                Tag
                <select
                  value={draft.tag ?? "Standard"}
                  onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                  className={field}
                >
                  {SERVICE_TAGS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                Processing time (minutes)
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={draft.processing_minutes}
                  onChange={(e) =>
                    setDraft({ ...draft, processing_minutes: Number(e.target.value) })
                  }
                  className={field}
                />
              </label>
              <label className="text-sm font-bold">
                Cleanup time (minutes)
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={draft.cleanup_minutes}
                  onChange={(e) => setDraft({ ...draft, cleanup_minutes: Number(e.target.value) })}
                  className={field}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-bold sm:col-span-2">
                <input
                  type="checkbox"
                  checked={!draft.is_active}
                  onChange={(e) => setDraft({ ...draft, is_active: !e.target.checked })}
                  className="size-4"
                />
                Hidden service (not bookable online)
              </label>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="press flex min-h-11 items-center gap-2 rounded-2xl glass-soft px-5 text-sm font-bold"
              >
                <ArrowLeft className="size-4" /> Back
              </button>
            )}
            <button
              type="submit"
              disabled={busy}
              className="press flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {step < 2 ? (
                <>
                  Continue <ArrowRight className="size-4" />
                </>
              ) : draft.id ? (
                "Save changes"
              ) : (
                "Create service"
              )}
            </button>
          </div>
        </form>
      )}

      {services.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading services…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl glass p-8 text-center">
          <Scissors className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {(services.data ?? []).length === 0
              ? "No services yet — add your first one to go live."
              : "No services match these filters."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((s) => {
            const assigned = (links.data ?? []).filter((l) => l.service_id === s.id);
            const toInput = (id?: string): ServiceInput => ({
              ...(id ? { id } : {}),
              business_id: s.business_id,
              name: id ? s.name : `${s.name} (copy)`,
              category: s.category,
              description: s.description,
              duration_minutes: s.duration_minutes,
              price: Number(s.price),
              discount_price: s.discount_price === null ? null : Number(s.discount_price),
              is_active: s.is_active,
              image_url: s.image_url ?? null,
              deposit: s.deposit === null ? null : Number(s.deposit),
              processing_minutes: s.processing_minutes ?? 0,
              cleanup_minutes: s.cleanup_minutes ?? 0,
              tag: s.tag ?? "Standard",
            });

            return (
              <article key={s.id} className="rounded-3xl glass p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-extrabold">{s.name}</h3>
                      {s.tag && s.tag !== "Standard" && (
                        <span className="rounded-xl bg-gold/20 px-2.5 py-0.5 text-xs font-bold text-gold-foreground">
                          {s.tag}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm capitalize text-muted-foreground">
                      {s.category} · {s.duration_minutes} min · {money(s.discount_price ?? s.price)}
                      {s.discount_price ? ` (was ${money(s.price)})` : ""}
                      {s.deposit ? ` · deposit ${money(s.deposit)}` : ""}
                    </p>
                    {s.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex items-center gap-1 rounded-xl px-3 py-1 text-xs font-bold ${
                        s.is_active
                          ? "bg-primary/15 text-primary"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {!s.is_active && <EyeOff className="size-3" />}
                      {s.is_active ? "Active" : "Hidden"}
                    </span>
                    <button
                      type="button"
                      aria-label="Edit service"
                      onClick={() =>
                        openWizard(
                          toInput(s.id),
                          assigned.map((l) => l.staff_id),
                        )
                      }
                      className="press grid size-10 place-items-center rounded-2xl glass-soft"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Duplicate service"
                      onClick={() =>
                        openWizard(
                          toInput(),
                          assigned.map((l) => l.staff_id),
                        )
                      }
                      className="press grid size-10 place-items-center rounded-2xl glass-soft"
                    >
                      <Copy className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete service"
                      onClick={() => {
                        if (!window.confirm(`Delete “${s.name}”?`)) return;
                        remove
                          .mutateAsync(s.id)
                          .then(() => toast.success("Service deleted"))
                          .catch((e) =>
                            toast.error(e instanceof Error ? e.message : "Delete failed"),
                          );
                      }}
                      className="press grid size-10 place-items-center rounded-2xl glass-soft text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Users className="size-3.5" /> Who performs this ({assigned.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(staff.data ?? []).length === 0 ? (
                      <span className="text-sm text-muted-foreground">Add a specialist first.</span>
                    ) : (
                      (staff.data ?? []).map((m) => {
                        const on = assigned.some((l) => l.staff_id === m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            aria-pressed={on}
                            disabled={toggleLink.isPending}
                            onClick={() =>
                              toggleLink
                                .mutateAsync({ staffId: m.id, serviceId: s.id, enabled: !on })
                                .catch((e) =>
                                  toast.error(e instanceof Error ? e.message : "Update failed"),
                                )
                            }
                            className={`press min-h-9 rounded-2xl px-3 text-sm font-bold disabled:opacity-60 ${
                              on ? "bg-primary text-primary-foreground" : "glass-soft"
                            }`}
                          >
                            {m.full_name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
