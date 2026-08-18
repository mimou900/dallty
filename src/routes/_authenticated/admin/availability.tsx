import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isSameDay, startOfDay } from "date-fns";
import {
  AlertCircle,
  CalendarDays,
  CalendarOff,
  ChevronDown,
  Coffee,
  Loader2,
  Plus,
  Repeat,
  Sun,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Calendar } from "@/components/ui/calendar";
import { SearchableSelect } from "@/components/admin/searchable-select";
import { TimeField, friendlyTime } from "@/components/admin/availability/time-field";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/availability")({
  validateSearch: (search: Record<string, unknown>) => ({
    staff: typeof search.staff === "string" ? search.staff : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Day-by-day working hours — Dallty" },
      {
        name: "description",
        content:
          "Pick a date on the calendar and set the exact hours, breaks and closures for each specialist.",
      },
      { property: "og:title", content: "Day-by-day working hours — Dallty" },
      {
        property: "og:description",
        content: "Set opening times for any single date in your calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminAvailabilityPage,
});

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_START = "10:00";
const DEFAULT_END = "20:00";
const BREAK_LABELS = ["Lunch", "Prayer", "Cleanup", "Rest"];
const PRESETS: { label: string; start: string; end: string }[] = [
  { label: "9 AM – 5 PM", start: "09:00", end: "17:00" },
  { label: "10 AM – 8 PM", start: "10:00", end: "20:00" },
  { label: "12 PM – 10 PM", start: "12:00", end: "22:00" },
  { label: "Morning only", start: "09:00", end: "13:00" },
  { label: "Evening only", start: "16:00", end: "22:00" },
];

type StaffRow = {
  id: string;
  full_name: string;
  title: string;
  business_id: string;
  user_id: string | null;
  businesses?: { name: string } | null;
};

const toMin = (v: string) => {
  const [h, m] = v.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};
const key = (d: Date) => format(d, "yyyy-MM-dd");

function AdminAvailabilityPage() {
  const { staff: staffParam } = Route.useSearch();
  const { user, primaryRole } = useAuth();
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState<string | null>(staffParam ?? null);
  const [selected, setSelected] = useState<Date>(startOfDay(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [breakDraft, setBreakDraft] = useState({
    starts_at: "13:00",
    ends_at: "14:00",
    label: "Lunch",
  });
  const [showBreak, setShowBreak] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const isPlatformAdmin = primaryRole === "admin" || primaryRole === "super_admin";
  const isStaffOnly = primaryRole === "specialist";

  const staffQuery = useQuery({
    queryKey: ["manageable-staff", user?.id, primaryRole],
    enabled: Boolean(user),
    queryFn: async (): Promise<StaffRow[]> => {
      let query = supabase
        .from("staff")
        .select("id, full_name, title, business_id, user_id, businesses(name)")
        .order("full_name");

      if (isStaffOnly) {
        query = query.eq("user_id", user!.id);
      } else if (!isPlatformAdmin) {
        const { data: owned, error: ownedError } = await supabase
          .from("businesses")
          .select("id")
          .eq("owner_id", user!.id);
        if (ownedError) throw ownedError;
        const businessIds = (owned ?? []).map((s) => s.id);
        query = businessIds.length
          ? query.or(`user_id.eq.${user!.id},business_id.in.(${businessIds.join(",")})`)
          : query.eq("user_id", user!.id);
      }

      const { data, error: qError } = await query;
      if (qError) throw qError;
      return (data ?? []) as StaffRow[];
    },
  });

  const staffList = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);

  useEffect(() => {
    if (!staffList.length) return;
    if (!staffList.some((s) => s.id === staffId)) setStaffId(staffList[0].id);
  }, [staffList, staffId]);

  // Every staff schedule now belongs to a specific branch (Project 09 Phase 1/2). This page
  // manages the staff member's primary branch only -- a full cross-branch schedule editor is a
  // future refinement once specialists commonly split time across branches; for now this
  // matches resolveStaffPrimaryBranchId()'s placeholder pattern used everywhere else.
  const primaryBranchQuery = useQuery({
    queryKey: ["primary-branch", staffId],
    enabled: Boolean(staffId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("staff_branches")
        .select("branch_id")
        .eq("staff_id", staffId!)
        .eq("is_primary", true)
        .single();
      if (e) throw e;
      return data.branch_id as string;
    },
  });
  const branchId = primaryBranchQuery.data;

  const dayHoursQuery = useQuery({
    queryKey: ["day-hours", staffId, branchId],
    enabled: Boolean(staffId && branchId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("staff_branch_day_hours")
        .select("*")
        .eq("staff_id", staffId!)
        .eq("branch_id", branchId!)
        .order("day");
      if (e) throw e;
      return data ?? [];
    },
  });

  const schedulesQuery = useQuery({
    queryKey: ["schedules", staffId, branchId],
    enabled: Boolean(staffId && branchId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("staff_branch_schedules")
        .select("*")
        .eq("staff_id", staffId!)
        .eq("branch_id", branchId!)
        .order("weekday");
      if (e) throw e;
      return data ?? [];
    },
  });

  const breaksQuery = useQuery({
    queryKey: ["breaks", staffId],
    enabled: Boolean(staffId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("staff_breaks")
        .select("*")
        .eq("staff_id", staffId!)
        .order("weekday");
      if (e) throw e;
      return data ?? [];
    },
  });

  const timeOffQuery = useQuery({
    queryKey: ["time-off", staffId],
    enabled: Boolean(staffId),
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("staff_time_off")
        .select("*")
        .eq("staff_id", staffId!)
        .order("day");
      if (e) throw e;
      return data ?? [];
    },
  });

  const invalidate = () => {
    ["day-hours", "schedules", "breaks", "time-off"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k, staffId] }),
    );
    queryClient.invalidateQueries({ queryKey: ["slots"] });
    queryClient.invalidateQueries({ queryKey: ["availability-summary"] });
  };

  const dayKey = key(selected);
  const weekday = selected.getDay();
  const override = (dayHoursQuery.data ?? []).find((r) => r.day === dayKey) ?? null;
  const usual = (schedulesQuery.data ?? []).find((s) => s.weekday === weekday) ?? null;
  const closedRow = (timeOffQuery.data ?? []).find((r) => r.day === dayKey) ?? null;
  const dayBreaks = (breaksQuery.data ?? []).filter((b) => b.weekday === weekday);

  const effective = override ?? usual;
  const isOpen = Boolean(effective) && !closedRow;
  const start = (effective?.starts_at ?? DEFAULT_START).slice(0, 5);
  const end = (effective?.ends_at ?? DEFAULT_END).slice(0, 5);

  const setDayHours = useMutation({
    mutationFn: async (input: { starts_at: string; ends_at: string }) => {
      // No unique constraint on (staff_id, branch_id, day) -- deliberate, so a future editor can
      // support multiple intervals in one day (split shifts). This page only ever sets one, so
      // replace-by-delete-then-insert keeps that single-interval behavior without an upsert.
      const { error: delErr } = await supabase
        .from("staff_branch_day_hours")
        .delete()
        .eq("staff_id", staffId!)
        .eq("branch_id", branchId!)
        .eq("day", dayKey);
      if (delErr) throw delErr;
      const { error: e } = await supabase.from("staff_branch_day_hours").insert({
        staff_id: staffId!,
        branch_id: branchId!,
        day: dayKey,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
      });
      if (e) throw e;
      if (closedRow) {
        const { error: delError } = await supabase
          .from("staff_time_off")
          .delete()
          .eq("id", closedRow.id);
        if (delError) throw delError;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(`Hours saved for ${format(selected, "EEEE d MMM")}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const closeDay = useMutation({
    mutationFn: async () => {
      if (override) {
        const { error: e } = await supabase
          .from("staff_branch_day_hours")
          .delete()
          .eq("id", override.id);
        if (e) throw e;
      }
      if (!closedRow) {
        const { error: e } = await supabase
          .from("staff_time_off")
          .insert({ staff_id: staffId!, day: dayKey, reason: "" });
        if (e) throw e;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(`${format(selected, "EEEE d MMM")} is now closed`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not close the day"),
  });

  const useUsual = useMutation({
    mutationFn: async () => {
      if (!override) return;
      const { error: e } = await supabase
        .from("staff_branch_day_hours")
        .delete()
        .eq("id", override.id);
      if (e) throw e;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Back to the usual weekly hours");
    },
  });

  const applyToWeekday = useMutation({
    mutationFn: async () => {
      const payload = { starts_at: start, ends_at: end };
      if (usual) {
        const { error: e } = await supabase
          .from("staff_branch_schedules")
          .update(payload)
          .eq("id", usual.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase
          .from("staff_branch_schedules")
          .insert({ staff_id: staffId!, branch_id: branchId!, weekday, ...payload });
        if (e) throw e;
      }
    },
    onSuccess: () => {
      invalidate();
      toast.success(`Every ${WEEKDAYS[weekday]} now uses these hours`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const addBreak = useMutation({
    mutationFn: async (input: { starts_at: string; ends_at: string; label: string }) => {
      const { data: primary, error: branchError } = await supabase
        .from("staff_branches")
        .select("branch_id")
        .eq("staff_id", staffId!)
        .eq("is_primary", true)
        .single();
      if (branchError) throw branchError;
      const { error: e } = await supabase
        .from("staff_breaks")
        .insert({ staff_id: staffId!, branch_id: primary.branch_id, weekday, ...input });
      if (e) throw e;
    },
    onSuccess: () => {
      invalidate();
      setShowBreak(false);
      toast.success("Break added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add break"),
  });

  const removeBreak = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from("staff_breaks").delete().eq("id", id);
      if (e) throw e;
    },
    onSuccess: invalidate,
  });

  function saveHours(nextStart: string, nextEnd: string) {
    if (toMin(nextStart) >= toMin(nextEnd)) {
      setError("The end time must come after the start time.");
      return;
    }
    const clash = dayBreaks.find(
      (b) => toMin(b.starts_at) < toMin(nextStart) || toMin(b.ends_at) > toMin(nextEnd),
    );
    if (clash) {
      setError(`These hours cut into the "${clash.label}" break. Move or remove it first.`);
      return;
    }
    setError(null);
    setDayHours.mutate({ starts_at: nextStart, ends_at: nextEnd });
  }

  function submitBreak() {
    const { starts_at, ends_at, label } = breakDraft;
    if (!label.trim()) return setError("Give the break a short label.");
    if (toMin(starts_at) >= toMin(ends_at)) return setError("The break must end after it starts.");
    if (!isOpen) return setError("Open this day before adding a break.");
    if (toMin(starts_at) < toMin(start) || toMin(ends_at) > toMin(end))
      return setError("The break must sit inside the working hours of that day.");
    const overlap = dayBreaks.find(
      (b) => toMin(b.starts_at) < toMin(ends_at) && toMin(b.ends_at) > toMin(starts_at),
    );
    if (overlap) return setError(`This overlaps the "${overlap.label}" break.`);
    setError(null);
    addBreak.mutate(breakDraft);
  }

  const today = startOfDay(new Date());
  const customDays = (dayHoursQuery.data ?? []).map((r) => new Date(`${r.day}T00:00:00`));
  const closedDays = (timeOffQuery.data ?? []).map((r) => new Date(`${r.day}T00:00:00`));
  const current = staffList.find((s) => s.id === staffId) ?? null;

  const quickDays = useMemo(
    () => Array.from({ length: 14 }, (_, i) => addDays(today, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today.getTime()],
  );

  if (staffQuery.isLoading) {
    return (
      <p className="flex items-center gap-2 rounded-3xl glass p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading your team…
      </p>
    );
  }

  if (!staffList.length) {
    return (
      <p className="rounded-3xl glass p-6 text-sm text-muted-foreground">
        No specialists linked to your account yet.
      </p>
    );
  }

  if (staffId && primaryBranchQuery.isLoading) {
    return (
      <p className="flex items-center gap-2 rounded-3xl glass p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-6">
      <header className="rounded-3xl glass p-4 sm:p-5">
        <h1 className="text-xl font-extrabold sm:text-2xl">My working hours</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Three easy steps: choose the person, tap a day, then set the times. Everything saves by
          itself.
        </p>
      </header>

      {/* Step 1 — who */}
      {staffList.length > 1 && (
        <section className="rounded-3xl glass p-4">
          <StepTitle n={1} title="Who is this for?" />
          {staffList.length > 6 ? (
            <SearchableSelect
              className="mt-3 w-full bg-card/70"
              value={staffId ?? ""}
              onChange={(next) => setStaffId(next)}
              searchPlaceholder="Search your team…"
              options={staffList.map((m) => ({
                value: m.id,
                label: m.full_name,
                hint: m.businesses?.name ?? m.title,
              }))}
            />
          ) : (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {staffList.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setStaffId(m.id)}
                  aria-pressed={staffId === m.id}
                  className={`press min-h-12 shrink-0 rounded-2xl px-4 text-sm font-bold ${
                    staffId === m.id ? "bg-primary text-primary-foreground" : "glass-soft"
                  }`}
                >
                  {m.full_name}
                </button>
              ))}
            </div>
          )}
          {current && (
            <p className="mt-2 text-xs text-muted-foreground">
              {current.title}
              {current.businesses?.name ? ` · ${current.businesses.name}` : ""}
            </p>
          )}
        </section>
      )}

      {/* Step 2 — which day */}
      <section className="rounded-3xl glass p-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <StepTitle n={staffList.length > 1 ? 2 : 1} title="Which day?" />
          <button
            type="button"
            onClick={() => setShowCalendar((v) => !v)}
            className="press inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-2xl glass-soft px-3 text-xs font-bold"
          >
            <CalendarDays className="size-4 text-primary" />
            {showCalendar ? "Hide calendar" : "Other date"}
            <ChevronDown
              className={cn("size-4 transition-transform", showCalendar && "rotate-180")}
            />
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {quickDays.map((d) => {
            const dk = key(d);
            const isClosed = (timeOffQuery.data ?? []).some((r) => r.day === dk);
            const isCustom = (dayHoursQuery.data ?? []).some((r) => r.day === dk);
            const active = isSameDay(d, selected);
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => (setSelected(d), setError(null))}
                aria-pressed={active}
                className={`press min-h-16 w-16 shrink-0 rounded-2xl px-2 py-1.5 text-center text-xs font-bold ${
                  active ? "bg-primary text-primary-foreground" : "glass-soft"
                }`}
              >
                <span className="block opacity-80">
                  {isSameDay(d, today) ? "Today" : format(d, "EEE")}
                </span>
                <span className="block text-lg leading-tight">{format(d, "d")}</span>
                <span
                  className={cn(
                    "mx-auto mt-0.5 block size-1.5 rounded-full",
                    isClosed ? "bg-destructive" : isCustom ? "bg-primary" : "bg-transparent",
                    active && (isClosed || isCustom) ? "bg-primary-foreground" : "",
                  )}
                />
              </button>
            );
          })}
        </div>

        {showCalendar && (
          <div className="mt-3 rounded-2xl glass-soft p-2">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={(d) =>
                d && (setSelected(startOfDay(d)), setError(null), setShowCalendar(false))
              }
              disabled={{ before: today }}
              modifiers={{ custom: customDays, closed: closedDays }}
              modifiersClassNames={{
                custom: "ring-1 ring-primary rounded-md font-bold",
                closed: "bg-destructive/80 text-destructive-foreground rounded-md",
              }}
              className={cn("pointer-events-auto mx-auto")}
            />
            <div className="flex flex-wrap gap-3 px-2 pb-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-3 rounded ring-1 ring-primary" /> custom hours
              </span>
              <span className="flex items-center gap-1">
                <span className="size-3 rounded bg-destructive/80" /> closed
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Step 3 — the hours */}
      <section className="space-y-4 rounded-3xl glass p-4 sm:p-5">
        <StepTitle n={staffList.length > 1 ? 3 : 2} title="Set the times" />

        <div className="rounded-2xl glass-soft p-4">
          <p className="text-base font-extrabold">{format(selected, "EEEE d MMMM")}</p>
          <p
            className={cn(
              "mt-1 text-sm font-semibold",
              isOpen ? "text-primary" : "text-destructive",
            )}
          >
            {isOpen ? `Open ${friendlyTime(start)} – ${friendlyTime(end)}` : "Closed all day"}
          </p>
          {isOpen && (
            <p className="text-xs text-muted-foreground">
              {override ? "Special hours just for this date" : `Usual ${WEEKDAYS[weekday]} hours`}
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => !isOpen && saveHours(DEFAULT_START, DEFAULT_END)}
              aria-pressed={isOpen}
              className={cn(
                "press flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold",
                isOpen ? "bg-primary text-primary-foreground" : "bg-card/70",
              )}
            >
              <Sun className="size-4" /> Working
            </button>
            <button
              type="button"
              onClick={() => isOpen && closeDay.mutate()}
              aria-pressed={!isOpen}
              className={cn(
                "press flex min-h-12 items-center justify-center gap-2 rounded-2xl text-sm font-extrabold",
                !isOpen ? "bg-destructive text-destructive-foreground" : "bg-card/70",
              )}
            >
              <CalendarOff className="size-4" /> Day off
            </button>
          </div>
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-2xl bg-destructive/10 p-3 text-xs font-semibold text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {error}
          </p>
        )}

        {isOpen && (
          <>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Common shifts — one tap
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => {
                  const active = p.start === start && p.end === end;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => saveHours(p.start, p.end)}
                      aria-pressed={active}
                      className={cn(
                        "press min-h-11 rounded-2xl px-3.5 text-xs font-bold",
                        active ? "bg-primary text-primary-foreground" : "glass-soft",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TimeField
                label="Starts at"
                ariaLabel="Opening time"
                value={start}
                onChange={(v) => saveHours(v, end)}
              />
              <TimeField
                label="Ends at"
                ariaLabel="Closing time"
                value={end}
                onChange={(v) => saveHours(start, v)}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => applyToWeekday.mutate()}
                className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl glass-soft px-4 text-xs font-bold"
              >
                <Repeat className="size-4 shrink-0 text-primary" />
                Repeat every {WEEKDAYS[weekday]}
              </button>
              {override && (
                <button
                  type="button"
                  onClick={() => useUsual.mutate()}
                  className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl glass-soft px-4 text-xs font-bold"
                >
                  <Undo2 className="size-4 shrink-0" /> Back to usual hours
                </button>
              )}
            </div>

            <div className="rounded-2xl glass-soft p-4">
              <p className="flex items-center gap-2 text-sm font-bold">
                <Coffee className="size-4 shrink-0 text-primary" /> Breaks on {WEEKDAYS[weekday]}s
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Times you are not available — lunch, prayer, cleanup.
              </p>
              <ul className="mt-3 space-y-2">
                {dayBreaks.map((b) => (
                  <li
                    key={b.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-card/70 p-2.5"
                  >
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {b.label} · {friendlyTime(b.starts_at)} – {friendlyTime(b.ends_at)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${b.label} break`}
                      onClick={() => removeBreak.mutate(b.id)}
                      className="press grid size-10 shrink-0 place-items-center rounded-xl glass"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </button>
                  </li>
                ))}
                {!dayBreaks.length && (
                  <li className="text-xs text-muted-foreground">No breaks on this weekday.</li>
                )}
              </ul>

              {showBreak ? (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {BREAK_LABELS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setBreakDraft((d) => ({ ...d, label: l }))}
                        aria-pressed={breakDraft.label === l}
                        className={`press min-h-10 rounded-xl px-3.5 text-xs font-bold ${
                          breakDraft.label === l
                            ? "bg-primary text-primary-foreground"
                            : "bg-card/70"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <TimeField
                      label="Break from"
                      ariaLabel="Break start"
                      value={breakDraft.starts_at}
                      onChange={(v) => setBreakDraft((d) => ({ ...d, starts_at: v }))}
                    />
                    <TimeField
                      label="Break to"
                      ariaLabel="Break end"
                      value={breakDraft.ends_at}
                      onChange={(v) => setBreakDraft((d) => ({ ...d, ends_at: v }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => (setShowBreak(false), setError(null))}
                      className="press min-h-12 rounded-2xl bg-card/70 text-sm font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitBreak}
                      className="press min-h-12 rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground"
                    >
                      Save break
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowBreak(true)}
                  className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-card/70 px-4 text-xs font-bold"
                >
                  <Plus className="size-4" /> Add a break
                </button>
              )}
            </div>
          </>
        )}

        {!isOpen && (
          <button
            type="button"
            onClick={() => saveHours(DEFAULT_START, DEFAULT_END)}
            className="press min-h-14 w-full rounded-2xl bg-primary text-sm font-extrabold text-primary-foreground"
          >
            Open this date (10:00 AM – 8:00 PM)
          </button>
        )}
      </section>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm font-extrabold">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">
        {n}
      </span>
      <span className="truncate">{title}</span>
    </p>
  );
}
