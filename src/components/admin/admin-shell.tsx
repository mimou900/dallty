import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  Building2,
  ShieldCheck,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  Globe,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogOut,
  Menu,
  Moon,
  Plus,
  Scissors,
  Search,
  Settings,
  Star,
  Store,
  Sun,
  Tags,
  Users,
  UserCog,
  Wallet,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMyStaffRecord } from "@/lib/admin";
import { NotificationCenter } from "@/components/dallty/notification-center";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { LogoMark } from "@/components/dallty/logo";
import { useLocale, type Lang } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import { preloadNamespaces } from "@/lib/i18n/loader";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";
import { SHORT_LABEL } from "@/components/dallty/language-switcher";

type ShellNamespace =
  | "common"
  | "booking"
  | "customer"
  | "services"
  | "staff"
  | "reviews"
  | "payments"
  | "reports"
  | "settings"
  | "platform";

type NavItem = {
  to: string;
  namespace: ShellNamespace;
  labelKey: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  /** Rendered as a disabled "Coming soon" row. */
  soon?: boolean;
};

type NavSection = { labelKey: string; items: NavItem[] };

const LANG_ORDER: Lang[] = ["en", "fr", "ar"];

/** Owner / manager back-office, grouped by the way a business actually runs. */
export const ADMIN_SECTIONS: NavSection[] = [
  {
    labelKey: "section_today",
    items: [
      {
        to: "/admin",
        namespace: "common",
        labelKey: "menu.dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
      { to: "/admin/calendar", namespace: "booking", labelKey: "nav_calendar", icon: CalendarDays },
      {
        to: "/admin/appointments",
        namespace: "booking",
        labelKey: "nav_appointments",
        icon: ClipboardList,
      },
    ],
  },
  {
    labelKey: "section_business",
    items: [
      { to: "/admin/customers", namespace: "customer", labelKey: "nav_clients", icon: Users },
      { to: "/admin/services", namespace: "services", labelKey: "nav_services", icon: Scissors },
      { to: "/admin/staff", namespace: "staff", labelKey: "nav_specialists", icon: UserCog },
      { to: "/admin/reviews", namespace: "reviews", labelKey: "nav_reviews", icon: Star },
    ],
  },
  {
    labelKey: "section_finance",
    items: [
      { to: "/admin/payments", namespace: "payments", labelKey: "nav_payments", icon: Wallet },
      { to: "/admin/reports", namespace: "reports", labelKey: "nav_reports", icon: BarChart3 },
      {
        to: "/admin/billing",
        namespace: "payments",
        labelKey: "nav_billing",
        icon: CreditCard,
        soon: true,
      },
    ],
  },
  {
    labelKey: "section_account",
    items: [
      {
        to: "/admin/notifications",
        namespace: "common",
        labelKey: "menu.notifications",
        icon: Bell,
      },
      {
        to: "/admin/settings",
        namespace: "settings",
        labelKey: "nav_business_settings",
        icon: Settings,
      },
      {
        to: "/admin/marketplace",
        namespace: "settings",
        labelKey: "nav_marketplace_status",
        icon: Store,
      },
    ],
  },
];

export const ADMIN_NAV: NavItem[] = ADMIN_SECTIONS.flatMap((s) => s.items).filter((i) => !i.soon);

/** Reduced menu for specialists: their own book only. */
export const STAFF_SECTIONS: NavSection[] = [
  {
    labelKey: "section_my_work",
    items: [
      {
        to: "/admin/my-appointments",
        namespace: "booking",
        labelKey: "nav_my_appointments",
        icon: ClipboardList,
      },
      {
        to: "/admin/calendar",
        namespace: "booking",
        labelKey: "nav_my_calendar",
        icon: CalendarDays,
      },
      { to: "/admin/availability", namespace: "staff", labelKey: "nav_my_hours", icon: Clock },
    ],
  },
  {
    labelKey: "section_feedback",
    items: [{ to: "/admin/reviews", namespace: "reviews", labelKey: "nav_reviews", icon: Star }],
  },
];

export const STAFF_NAV: NavItem[] = STAFF_SECTIONS.flatMap((s) => s.items);

export const PLATFORM_NAV: NavItem[] = [
  {
    to: "/admin/platform/overview",
    namespace: "platform",
    labelKey: "nav_overview",
    icon: BarChart3,
  },
  {
    to: "/admin/platform/directory",
    namespace: "platform",
    labelKey: "nav_directory",
    icon: Search,
  },
  {
    to: "/admin/platform/businesses",
    namespace: "platform",
    labelKey: "nav_businesses",
    icon: Building2,
  },
  {
    to: "/admin/platform/marketplace",
    namespace: "platform",
    labelKey: "nav_marketplace_approvals",
    icon: Store,
  },
  {
    to: "/admin/platform/users",
    namespace: "platform",
    labelKey: "nav_users",
    icon: ShieldCheck,
  },
  {
    to: "/admin/platform/categories",
    namespace: "platform",
    labelKey: "nav_categories",
    icon: Tags,
  },
  {
    to: "/admin/platform/reserved-slugs",
    namespace: "platform",
    labelKey: "nav_reserved_slugs",
    icon: Link2,
  },
  {
    to: "/admin/platform/countries",
    namespace: "platform",
    labelKey: "nav_countries",
    icon: Globe,
  },
  {
    to: "/admin/platform/auth-policies",
    namespace: "platform",
    labelKey: "nav_auth_policies",
    icon: KeyRound,
  },
];

const QUICK_ACTIONS: { namespace: ShellNamespace; labelKey: string; to: string }[] = [
  { namespace: "services", labelKey: "quick_add_service", to: "/admin/services" },
  { namespace: "staff", labelKey: "quick_add_specialist", to: "/admin/staff" },
  { namespace: "booking", labelKey: "quick_open_calendar", to: "/admin/calendar" },
  { namespace: "booking", labelKey: "quick_new_booking", to: "/admin/appointments" },
  { namespace: "customer", labelKey: "quick_add_client", to: "/admin/customers" },
];

/* ---------------------------------- theme --------------------------------- */

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const stored = window.localStorage.getItem("dallty:theme");
    const initial =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("dallty:theme", theme);
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

/* ------------------------------ command palette --------------------------- */

function GlobalCommand({
  open,
  onOpenChange,
  label,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  label: (item: NavItem) => string;
}) {
  const { t: tCommon } = useTranslation("common");
  const { t: tCustomer } = useTranslation("customer");
  const { t: tStaff } = useTranslation("staff");
  const { t: tServices } = useTranslation("services");
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const q = term.trim();

  const results = useQuery({
    queryKey: ["admin-command", q],
    enabled: open && q.length >= 2,
    queryFn: async () => {
      const like = `%${q}%`;
      const [customers, services, staff] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone").ilike("full_name", like).limit(5),
        supabase.from("services").select("id, name, business_id").ilike("name", like).limit(5),
        supabase
          .from("staff")
          .select("id, full_name, business_id")
          .ilike("full_name", like)
          .limit(5),
      ]);
      return {
        customers: customers.data ?? [],
        services: services.data ?? [],
        staff: staff.data ?? [],
      };
    },
  });

  function go(to: string) {
    onOpenChange(false);
    setTerm("");
    navigate({ to });
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={tCommon("palette_placeholder")}
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>{tCommon("palette_no_matches")}</CommandEmpty>
        <CommandGroup heading={tCommon("palette_go_to")}>
          {ADMIN_NAV.map((item) => (
            <CommandItem key={item.to} value={`nav ${label(item)}`} onSelect={() => go(item.to)}>
              <item.icon className="mr-2 size-4" />
              {label(item)}
            </CommandItem>
          ))}
        </CommandGroup>
        {results.data?.customers.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={tCustomer("palette_heading")}>
              {results.data.customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`customer ${c.full_name}`}
                  onSelect={() => go("/admin/customers")}
                >
                  <Users className="mr-2 size-4" />
                  {c.full_name || tCommon("palette_unnamed")}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        {results.data?.staff.length ? (
          <CommandGroup heading={tStaff("palette_heading")}>
            {results.data.staff.map((s) => (
              <CommandItem
                key={s.id}
                value={`staff ${s.full_name}`}
                onSelect={() => go("/admin/staff")}
              >
                <UserCog className="mr-2 size-4" />
                {s.full_name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {results.data?.services.length ? (
          <CommandGroup heading={tServices("palette_heading")}>
            {results.data.services.map((s) => (
              <CommandItem
                key={s.id}
                value={`service ${s.name}`}
                onSelect={() => go("/admin/services")}
              >
                <Scissors className="mr-2 size-4" />
                {s.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}

/* --------------------------------- shell ---------------------------------- */

export function AdminShell({ children }: { children: ReactNode }) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang: locale, setLang } = useLocale();
  const { user, primaryRole, hasRole } = useAuth();
  const isPlatformAdmin = hasRole("super_admin") || hasRole("admin");
  const { isStaffOnly } = useMyStaffRecord();

  const { t: tCommon } = useTranslation("common");
  const { t: tBooking } = useTranslation("booking");
  const { t: tCustomer } = useTranslation("customer");
  const { t: tServices } = useTranslation("services");
  const { t: tStaff } = useTranslation("staff");
  const { t: tReviews } = useTranslation("reviews");
  const { t: tPayments } = useTranslation("payments");
  const { t: tReports } = useTranslation("reports");
  const { t: tSettings } = useTranslation("settings");
  const { t: tPlatform } = useTranslation("platform");

  const T_BY_NAMESPACE: Record<ShellNamespace, (key: string) => string> = {
    common: tCommon as (key: string) => string,
    booking: tBooking as (key: string) => string,
    customer: tCustomer as (key: string) => string,
    services: tServices as (key: string) => string,
    staff: tStaff as (key: string) => string,
    reviews: tReviews as (key: string) => string,
    payments: tPayments as (key: string) => string,
    reports: tReports as (key: string) => string,
    settings: tSettings as (key: string) => string,
    platform: tPlatform as (key: string) => string,
  };

  function label(item: NavItem): string {
    return T_BY_NAMESPACE[item.namespace](item.labelKey);
  }

  useEffect(() => {
    void preloadNamespaces(locale, [
      "common",
      "booking",
      "customer",
      "services",
      "staff",
      "reviews",
      "payments",
      "reports",
      "settings",
      "platform",
    ]);
  }, [locale]);

  // Owners see a review banner until the platform team approves their business.
  const ownedBusiness = useQuery({
    queryKey: ["owned-business-status", user?.id, isPlatformAdmin],
    enabled: Boolean(user?.id) && !isPlatformAdmin,
    queryFn: async () => {
      const { data } = await supabase
        .from("businesses")
        .select("id, name, marketplace_status, trial_ends_at")
        .eq("owner_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const quickRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!quickOpen) return;
    function onClick(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setQuickOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [quickOpen]);

  const current = useMemo(
    () =>
      [...ADMIN_NAV, ...STAFF_NAV, ...PLATFORM_NAV]
        .sort((a, b) => b.to.length - a.to.length)
        .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`)),
    [pathname],
  );

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { next: undefined }, replace: true });
  }

  const renderLink = (item: NavItem) => {
    const active = item.exact
      ? pathname === item.to
      : pathname === item.to || pathname.startsWith(`${item.to}/`);
    if (item.soon) {
      return (
        <span
          key={item.to}
          aria-disabled="true"
          className="flex min-h-11 cursor-not-allowed items-center gap-3 rounded-2xl px-3 text-sm font-bold text-muted-foreground/60"
        >
          <item.icon className="size-4 shrink-0" />
          <span className="truncate">{label(item)}</span>
          <span className="ms-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-extrabold uppercase text-muted-foreground">
            {tCommon("soon")}
          </span>
        </span>
      );
    }
    return (
      <Link
        key={item.to}
        to={item.to}
        className={`press flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-bold transition-colors ${
          active
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
        }`}
      >
        <item.icon className="size-4 shrink-0" />
        <span className="truncate">{label(item)}</span>
      </Link>
    );
  };

  const sectionHeading = (text: string) => (
    <span
      key={`h-${text}`}
      className="mt-4 px-3 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground first:mt-0"
    >
      {text}
    </span>
  );

  // Platform admins own no business: they get the platform console first, then the
  // business modules scoped to whichever business they pick.
  const businessSections = isStaffOnly
    ? STAFF_SECTIONS
    : isPlatformAdmin
      ? ADMIN_SECTIONS.map((section) =>
          section.labelKey === "section_today"
            ? { ...section, items: section.items.filter((i) => i.to !== "/admin") }
            : section.labelKey === "section_account"
              ? {
                  ...section,
                  items: section.items.filter((i) => i.to !== "/admin/marketplace"),
                }
              : section,
        ).filter((section) => section.items.length > 0)
      : ADMIN_SECTIONS;

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {isPlatformAdmin && (
        <div className="flex flex-col gap-1">
          {sectionHeading(tPlatform("nav_section_label"))}
          {PLATFORM_NAV.map(renderLink)}
        </div>
      )}
      {isPlatformAdmin ? sectionHeading(tPlatform("manage_any_business")) : null}
      {businessSections.map((section) => (
        <div key={section.labelKey} className="flex flex-col gap-1">
          {sectionHeading(tCommon(section.labelKey as NamespaceKeyMap["common"]))}
          {section.items.map(renderLink)}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-border/60 bg-card/60 backdrop-blur-xl lg:flex">
        <Link to="/" className="flex items-center gap-3 px-5 py-5">
          <LogoMark className="size-10" />
          <span>
            <span className="block text-base font-extrabold leading-tight">Dallty</span>
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {tCommon("brand_business_subtitle")}
            </span>
          </span>
        </Link>
        {nav}
        <div className="border-t border-border/60 p-3">
          <button
            type="button"
            onClick={signOut}
            className="press flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-bold text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
          >
            <LogOut className="size-4" /> {tCommon("menu.sign_out" as NamespaceKeyMap["common"])}
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={tCommon("close_menu")}
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-float">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-base font-extrabold">{tCommon("brand_business")}</span>
              <button
                type="button"
                aria-label={tCommon("close_menu")}
                onClick={() => setMobileOpen(false)}
                className="grid size-9 place-items-center rounded-xl bg-secondary"
              >
                <X className="size-4" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="lg:ps-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label={tCommon("open_menu")}
                onClick={() => setMobileOpen(true)}
                className="grid size-10 shrink-0 place-items-center rounded-2xl glass-soft lg:hidden"
              >
                <Menu className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl glass-soft px-3 text-start text-sm text-muted-foreground sm:max-w-md"
              >
                <Search className="size-4 shrink-0" />
                <span className="truncate">{tCommon("palette_placeholder")}</span>
                <kbd className="ms-auto hidden shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold sm:block">
                  ⌘K
                </kbd>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div ref={quickRef} className="relative">
                <button
                  type="button"
                  onClick={() => setQuickOpen((v) => !v)}
                  aria-label={tCommon("quick_create_label")}
                  className="press flex min-h-10 items-center gap-1.5 rounded-2xl bg-primary px-3 text-sm font-bold text-primary-foreground"
                >
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">{tCommon("quick_create")}</span>
                </button>
                {quickOpen && (
                  <div className="absolute end-0 top-12 z-50 w-56 overflow-hidden rounded-2xl glass p-1.5 shadow-xl">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.to}
                        type="button"
                        onClick={() => {
                          setQuickOpen(false);
                          navigate({ to: action.to });
                        }}
                        className="block w-full rounded-xl px-3 py-2 text-start text-sm font-semibold hover:bg-secondary/70"
                      >
                        {T_BY_NAMESPACE[action.namespace](action.labelKey)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <NotificationCenter />

              <button
                type="button"
                onClick={() =>
                  void setLang(LANG_ORDER[(LANG_ORDER.indexOf(locale) + 1) % LANG_ORDER.length])
                }
                aria-label={tCommon("switch_language")}
                className="grid size-10 place-items-center rounded-2xl glass-soft text-xs font-extrabold"
              >
                {SHORT_LABEL[locale]}
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={tCommon("toggle_dark_mode")}
                className="grid size-10 place-items-center rounded-2xl glass-soft"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <a
                href="mailto:support@dallty.com"
                aria-label={tCommon("live_support")}
                className="hidden size-10 place-items-center rounded-2xl glass-soft sm:grid"
              >
                <LifeBuoy className="size-4" />
              </a>
            </div>
          </div>
        </header>

        <main className="px-4 pb-16 pt-6 sm:px-6">
          {ownedBusiness.data && ownedBusiness.data.marketplace_status !== "approved" && (
            <div className="mb-5 rounded-3xl glass p-5">
              <p className="text-sm font-extrabold">
                {ownedBusiness.data.marketplace_status === "pending_review"
                  ? tSettings("banner_pending_review")
                  : ownedBusiness.data.marketplace_status === "rejected"
                    ? tSettings("banner_rejected")
                    : ownedBusiness.data.marketplace_status === "hidden"
                      ? tSettings("banner_hidden")
                      : tSettings("banner_not_listed")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tSettings("banner_helper")}
                {ownedBusiness.data.trial_ends_at
                  ? ` ${tSettings("banner_trial_ends", { date: new Date(ownedBusiness.data.trial_ends_at).toLocaleDateString() })}`
                  : ""}
              </p>
            </div>
          )}

          <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
                {current ? label(current) : tCommon("brand_business")}
              </h1>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {user?.email} · {primaryRole.replace("_", " ")}
              </p>
            </div>
            <Link
              to="/"
              className="press hidden min-h-10 items-center rounded-2xl glass-soft px-4 text-sm font-bold sm:flex"
            >
              {tCommon("customer_app")}
            </Link>
          </div>
          {children}
        </main>
      </div>

      <GlobalCommand open={paletteOpen} onOpenChange={setPaletteOpen} label={label} />

      {/* Mobile language/theme safe area spacer */}
      <div className="h-2 lg:hidden" />
    </div>
  );
}
