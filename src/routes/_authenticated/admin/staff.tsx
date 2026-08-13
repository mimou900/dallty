import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award,
  CalendarClock,
  Check,
  Eye,
  KeyRound,
  Languages,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  UserCog,
  X,
} from "lucide-react";

import { ListingReadiness } from "@/components/admin/listing-readiness";
import {
  SpecialistWizard,
  emptyDraft,
  type SpecialistDraft,
} from "@/components/admin/specialist-wizard";
import {
  inviteStaffMember,
  listStaffAccess,
  reviewStaffRequest,
  sendStaffPasswordLink,
} from "@/lib/staff-access.functions";
import {
  money,
  useActiveCurrency,
  useDeleteStaff,
  useManagedSalons,
  useManagedServices,
  useManagedStaff,
  useStaffDayRules,
  useStaffRatings,
  useStaffSchedules,
  useStaffServices,
} from "@/lib/admin";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  head: () => ({
    meta: [
      { title: "Specialists — Dallty Business" },
      {
        name: "description",
        content:
          "Manage your specialists: photos, roles, ratings, assigned services, working days and next availability.",
      },
      { property: "og:title", content: "Specialists — Dallty Business" },
      { property: "og:description", content: "Run your specialist team end to end." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SpecialistsPage,
});

const DAY_MS = 86_400_000;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function SpecialistsPage() {
  const salonsQuery = useManagedSalons();
  const salons = salonsQuery.data ?? [];
  const [salonId, setSalonId] = useState<string | null>(null);
  const activeSalonId = salonId ?? salons[0]?.id ?? null;
  const salon = salons.find((s) => s.id === activeSalonId) ?? null;
  const ids = useMemo(() => (activeSalonId ? [activeSalonId] : []), [activeSalonId]);
  const currency = useActiveCurrency();

  const staff = useManagedStaff(ids);
  const services = useManagedServices(ids);
  const links = useStaffServices(ids);
  const staffIds = useMemo(() => (staff.data ?? []).map((s) => s.id), [staff.data]);
  const schedules = useStaffSchedules(staffIds);
  const dayRules = useStaffDayRules(staffIds);
  const ratings = useStaffRatings(ids);
  const remove = useDeleteStaff();

  const [draft, setDraft] = useState<SpecialistDraft | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");

  const fetchAccess = useServerFn(listStaffAccess);
  const invite = useServerFn(inviteStaffMember);
  const recover = useServerFn(sendStaffPasswordLink);
  const review = useServerFn(reviewStaffRequest);

  const access = useQuery({
    queryKey: ["staff-access", activeSalonId],
    enabled: Boolean(activeSalonId),
    queryFn: () => fetchAccess({ data: { salonId: activeSalonId! } }),
  });

  const accountByStaff = useMemo(
    () => new Map((access.data?.accounts ?? []).map((a) => [a.staffId, a])),
    [access.data],
  );

  const inviteMutation = useMutation({
    mutationFn: (vars: { staffId: string; email: string }) =>
      invite({ data: { ...vars, origin: window.location.origin } }),
    onSuccess: (r) => {
      toast.success(r.sent ? `Login email sent to ${r.email}` : `${r.email} is not accepting email`);
      void access.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send invite"),
  });

  const recoverMutation = useMutation({
    mutationFn: (staffId: string) => recover({ data: { staffId, origin: window.location.origin } }),
    onSuccess: (r) =>
      toast.success(r.sent ? `Recovery link sent to ${r.email}` : "Recipient is not accepting email"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not send recovery link"),
  });

  const reviewMutation = useMutation({
    mutationFn: (vars: { requestId: string; approve: boolean }) => review({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.approve ? "Specialist added to your team" : "Request declined");
      void access.refetch();
      void staff.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not review request"),
  });

  const askInvite = (staffId: string, current: string | null, name: string) => {
    const email = window.prompt(`Login email for ${name}`, current ?? "")?.trim();
    if (!email) return;
    inviteMutation.mutate({ staffId, email });
  };

  const activeStaffIds = useMemo(
    () => new Set((staff.data ?? []).filter((s) => s.is_active).map((s) => s.id)),
    [staff.data],
  );

  const linkedPairs = useMemo(() => {
    const activeServiceIds = new Set(
      (services.data ?? []).filter((s) => s.is_active).map((s) => s.id),
    );
    return (links.data ?? []).filter(
      (l) => activeStaffIds.has(l.staff_id) && activeServiceIds.has(l.service_id),
    ).length;
  }, [links.data, activeStaffIds, services.data]);

  /** Working-today + next-available signals derived from hours, overrides and days off. */
  const availability = useMemo(() => {
    const weekly = new Map<string, Set<number>>();
    for (const row of schedules.data ?? []) {
      const set = weekly.get(row.staff_id) ?? new Set<number>();
      set.add(row.weekday);
      weekly.set(row.staff_id, set);
    }
    const off = new Set((dayRules.data?.timeOff ?? []).map((r) => `${r.staff_id}|${r.day}`));
    const overrides = new Set(
      (dayRules.data?.dayHours ?? []).map((r) => `${r.staff_id}|${r.day}`),
    );

    const result = new Map<string, { workingToday: boolean; nextAvailable: string | null }>();
    const now = new Date();
    for (const id of staffIds) {
      let next: string | null = null;
      let workingToday = false;
      for (let i = 0; i < 30; i += 1) {
        const date = new Date(now.getTime() + i * DAY_MS);
        const key = `${id}|${isoDay(date)}`;
        if (off.has(key)) continue;
        const works = overrides.has(key) || weekly.get(id)?.has(date.getDay());
        if (!works) continue;
        if (i === 0) workingToday = true;
        if (!next) {
          next =
            i === 0
              ? "Today"
              : i === 1
                ? "Tomorrow"
                : date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
        }
        if (workingToday) break;
      }
      result.set(id, { workingToday, nextAvailable: next });
    }
    return result;
  }, [schedules.data, dayRules.data, staffIds]);

  const serviceById = useMemo(
    () => new Map((services.data ?? []).map((s) => [s.id, s])),
    [services.data],
  );

  const roles = useMemo(
    () => [...new Set((staff.data ?? []).map((s) => s.title).filter(Boolean))].sort(),
    [staff.data],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (staff.data ?? []).filter((m) => {
      if (term && !m.full_name.toLowerCase().includes(term) && !m.title.toLowerCase().includes(term))
        return false;
      if (roleFilter !== "all" && m.title !== roleFilter) return false;
      if (statusFilter === "active" && !m.is_active) return false;
      if (statusFilter === "paused" && m.is_active) return false;
      const avail = availability.get(m.id);
      if (availabilityFilter === "today" && !avail?.workingToday) return false;
      if (availabilityFilter === "off" && avail?.workingToday) return false;
      if (availabilityFilter === "none" && avail?.nextAvailable) return false;
      if (
        serviceFilter !== "all" &&
        !(links.data ?? []).some((l) => l.staff_id === m.id && l.service_id === serviceFilter)
      )
        return false;
      return true;
    });
  }, [staff.data, search, roleFilter, statusFilter, availabilityFilter, serviceFilter, availability, links.data]);

  if (salonsQuery.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!activeSalonId)
    return (
      <div className="rounded-3xl glass p-8 text-center text-sm text-muted-foreground">
        No business linked to your account yet.
      </div>
    );

  const openEdit = (id: string) => {
    const m = (staff.data ?? []).find((s) => s.id === id);
    if (!m) return;
    const [firstName, ...rest] = m.full_name.split(" ");
    const social = (m.social_links ?? {}) as Record<string, string>;
    setViewing(null);
    setDraft({
      id: m.id,
      salonId: m.salon_id,
      firstName: firstName ?? "",
      lastName: rest.join(" "),
      title: m.title,
      email: accountByStaff.get(m.id)?.email ?? "",
      phone: accountByStaff.get(m.id)?.phone ?? "",
      avatarUrl: m.avatar_url,
      isActive: m.is_active,
      bio: m.bio ?? "",
      experienceYears: m.experience_years ? String(m.experience_years) : "",
      languages: (m.languages ?? []).join(", "),
      certificates: (m.certificates ?? []).join(", "),
      portfolio: m.portfolio ?? [],
      instagram: social.instagram ?? "",
      tiktok: social.tiktok ?? "",
      website: social.website ?? "",
      assignments: (links.data ?? [])
        .filter((l) => l.staff_id === m.id)
        .map((l) => ({
          serviceId: l.service_id,
          customPrice: l.custom_price ?? null,
          customDuration: l.custom_duration_minutes ?? null,
        })),
    });
  };

  const selectClass =
    "min-h-10 rounded-2xl glass-soft px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="space-y-5">
      {salons.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {salons.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSalonId(s.id)}
              className={`press min-h-10 rounded-2xl px-4 text-sm font-bold ${
                s.id === activeSalonId ? "bg-primary text-primary-foreground" : "glass-soft"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {salon && (
        <ListingReadiness
          salonName={salon.name}
          isListed={Boolean(salon.is_listed)}
          status={salon.status}
          activeServices={(services.data ?? []).filter((s) => s.is_active).length}
          activeStaff={(staff.data ?? []).filter((s) => s.is_active).length}
          linkedPairs={linkedPairs}
          staffWithHours={
            new Set(
              (schedules.data ?? [])
                .filter((r) => activeStaffIds.has(r.staff_id))
                .map((r) => r.staff_id),
            ).size
          }
        />
      )}

      {(access.data?.requests ?? []).length > 0 && (
        <section className="rounded-3xl glass p-5">
          <h2 className="text-lg font-extrabold">
            Join requests ({access.data?.requests.length})
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Specialists who signed up and asked to join your team.
          </p>
          <div className="mt-3 grid gap-2">
            {(access.data?.requests ?? []).map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl glass-soft px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-extrabold">
                    {r.fullName} · <span className="font-medium">{r.title}</span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.email ?? "no email"}
                    {r.phone ? ` · ${r.phone}` : ""}
                    {r.message ? ` · “${r.message}”` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ requestId: r.id, approve: true })}
                    className="press flex min-h-9 items-center gap-1.5 rounded-2xl bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
                  >
                    <Check className="size-4" /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={reviewMutation.isPending}
                    onClick={() => reviewMutation.mutate({ requestId: r.id, approve: false })}
                    className="press flex min-h-9 items-center gap-1.5 rounded-2xl glass px-3 text-sm font-bold text-destructive disabled:opacity-60"
                  >
                    <X className="size-4" /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">Specialists ({staff.data?.length ?? 0})</h2>
        <button
          type="button"
          onClick={() => setDraft(emptyDraft(activeSalonId))}
          className="press flex min-h-10 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <Plus className="size-4" /> Add specialist
        </button>
      </div>

      {draft && (
        <SpecialistWizard
          draft={draft}
          services={services.data ?? []}
          currency={currency}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            void access.refetch();
          }}
        />
      )}

      <div className="rounded-3xl glass p-4">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search specialists by name or role"
            className="min-h-11 w-full rounded-2xl glass-soft pl-10 pr-4 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={selectClass}>
            <option value="all">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value)}
            className={selectClass}
          >
            <option value="all">Any availability</option>
            <option value="today">Working today</option>
            <option value="off">Off today</option>
            <option value="none">No hours set</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className={selectClass}
          >
            <option value="all">All services</option>
            {(services.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {staff.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading specialists…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl glass p-8 text-center">
          <UserCog className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {(staff.data ?? []).length === 0
              ? "No specialists yet — add one so customers can book."
              : "No specialist matches these filters."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => {
            const assigned = (links.data ?? []).filter((l) => l.staff_id === m.id);
            const rating = ratings.data?.[m.id];
            const avail = availability.get(m.id);
            const acc = accountByStaff.get(m.id);
            const open = viewing === m.id;
            return (
              <article key={m.id} className="flex flex-col rounded-3xl glass p-5">
                <div className="flex items-start gap-3">
                  {m.avatar_url ? (
                    <img
                      src={m.avatar_url}
                      alt={m.full_name}
                      className="size-14 shrink-0 rounded-2xl object-cover"
                    />
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg font-extrabold text-primary">
                      {m.full_name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-extrabold">{m.full_name}</h3>
                    <p className="truncate text-sm text-muted-foreground">{m.title}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold">
                      <Star className="size-3.5 fill-gold text-gold" />
                      {rating ? `${rating.average.toFixed(1)} · ${rating.count}` : "No reviews yet"}
                    </p>
                  </div>
                  <span
                    className={`rounded-xl px-2.5 py-1 text-[11px] font-bold ${
                      m.is_active ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {m.is_active ? "Active" : "Paused"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-2xl glass-soft px-3 py-2">
                    <p className="font-bold uppercase tracking-wide text-muted-foreground">
                      Working today
                    </p>
                    <p className="mt-0.5 font-extrabold">{avail?.workingToday ? "Yes" : "No"}</p>
                  </div>
                  <div className="rounded-2xl glass-soft px-3 py-2">
                    <p className="font-bold uppercase tracking-wide text-muted-foreground">
                      Next available
                    </p>
                    <p className="mt-0.5 truncate font-extrabold">
                      {avail?.nextAvailable ?? "No hours set"}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Services ({assigned.length})
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {assigned.length === 0 ? (
                      <span className="text-xs text-muted-foreground">None assigned yet</span>
                    ) : (
                      assigned.slice(0, open ? assigned.length : 3).map((l) => (
                        <span
                          key={l.id}
                          className="rounded-xl glass-soft px-2.5 py-1 text-xs font-bold"
                        >
                          {serviceById.get(l.service_id)?.name ?? "Service"}
                          {l.custom_price != null && ` · ${money(l.custom_price, currency)}`}
                        </span>
                      ))
                    )}
                    {!open && assigned.length > 3 && (
                      <span className="rounded-xl px-2 py-1 text-xs font-bold text-muted-foreground">
                        +{assigned.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="mt-3 space-y-3 rounded-2xl glass-soft p-4 text-sm">
                    {m.bio && <p className="text-muted-foreground">{m.bio}</p>}
                    {m.experience_years != null && (
                      <p className="flex items-center gap-2 font-bold">
                        <Sparkles className="size-4 text-primary" /> {m.experience_years} years of
                        experience
                      </p>
                    )}
                    {(m.languages ?? []).length > 0 && (
                      <p className="flex items-center gap-2">
                        <Languages className="size-4 text-primary" />
                        {(m.languages ?? []).join(", ")}
                      </p>
                    )}
                    {(m.certificates ?? []).length > 0 && (
                      <p className="flex items-center gap-2">
                        <Award className="size-4 text-primary" />
                        {(m.certificates ?? []).join(", ")}
                      </p>
                    )}
                    {(m.portfolio ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {(m.portfolio ?? []).map((url) => (
                          <img
                            key={url}
                            src={url}
                            alt={`${m.full_name} portfolio`}
                            className="size-16 rounded-xl object-cover"
                          />
                        ))}
                      </div>
                    )}
                    <div className="space-y-1 text-xs">
                      <p className="flex items-center gap-2">
                        <Mail className="size-3.5" /> {acc?.email ?? "No email"}
                        {acc?.hasLogin ? (acc.acceptedAt ? " · active login" : " · invited") : " · no login"}
                      </p>
                      <p className="flex items-center gap-2">
                        <Phone className="size-3.5" /> {acc?.phone ?? "No phone"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={inviteMutation.isPending}
                        onClick={() => askInvite(m.id, acc?.email ?? null, m.full_name)}
                        className="press flex min-h-9 items-center gap-1.5 rounded-2xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-60"
                      >
                        <Mail className="size-3.5" />
                        {acc?.hasLogin ? "Resend invite" : "Send login email"}
                      </button>
                      <button
                        type="button"
                        disabled={!acc?.email || recoverMutation.isPending}
                        onClick={() => recoverMutation.mutate(m.id)}
                        className="press flex min-h-9 items-center gap-1.5 rounded-2xl glass px-3 text-xs font-bold disabled:opacity-50"
                      >
                        <KeyRound className="size-3.5" /> Recovery link
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setViewing(open ? null : m.id)}
                    className="press flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-2xl glass-soft px-3 text-xs font-bold"
                  >
                    <Eye className="size-3.5" /> {open ? "Hide" : "View"}
                  </button>
                  <Link
                    to="/admin/availability"
                    search={{ staff: m.id }}
                    className="press flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-2xl glass-soft px-3 text-xs font-bold"
                  >
                    <CalendarClock className="size-3.5" /> Calendar
                  </Link>
                  <button
                    type="button"
                    onClick={() => openEdit(m.id)}
                    className="press flex min-h-9 items-center justify-center gap-1.5 rounded-2xl glass-soft px-3 text-xs font-bold"
                  >
                    <Pencil className="size-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${m.full_name}`}
                    onClick={() => {
                      if (!window.confirm(`Remove ${m.full_name}?`)) return;
                      remove
                        .mutateAsync(m.id)
                        .then(() => toast.success("Specialist removed"))
                        .catch((e) => toast.error(e instanceof Error ? e.message : "Delete failed"));
                    }}
                    className="press grid size-9 place-items-center rounded-2xl glass-soft text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
