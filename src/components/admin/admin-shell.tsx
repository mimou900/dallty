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
import { useLocale } from "@/lib/i18n";

type NavItem = {
  to: string;
  label: string;
  labelAr: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  /** Rendered as a disabled "Coming soon" row. */
  soon?: boolean;
};

type NavSection = { label: string; items: NavItem[] };

/** Owner / manager back-office, grouped by the way a salon actually runs. */
export const ADMIN_SECTIONS: NavSection[] = [
  {
    label: "Today",
    items: [
      {
        to: "/admin",
        label: "Dashboard",
        labelAr: "لوحة التحكم",
        icon: LayoutDashboard,
        exact: true,
      },
      { to: "/admin/calendar", label: "Calendar", labelAr: "التقويم", icon: CalendarDays },
      { to: "/admin/appointments", label: "Bookings", labelAr: "الحجوزات", icon: ClipboardList },
    ],
  },
  {
    label: "Business",
    items: [
      { to: "/admin/customers", label: "Clients", labelAr: "العملاء", icon: Users },
      { to: "/admin/services", label: "Services", labelAr: "الخدمات", icon: Scissors },
      { to: "/admin/staff", label: "Specialists", labelAr: "المختصون", icon: UserCog },
      { to: "/admin/reviews", label: "Reviews", labelAr: "التقييمات", icon: Star },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/admin/payments", label: "Payments", labelAr: "المدفوعات", icon: Wallet },
      { to: "/admin/reports", label: "Reports", labelAr: "التقارير", icon: BarChart3 },
      {
        to: "/admin/billing",
        label: "Billing",
        labelAr: "الفوترة",
        icon: CreditCard,
        soon: true,
      },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/admin/notifications", label: "Notifications", labelAr: "الإشعارات", icon: Bell },
      {
        to: "/admin/settings",
        label: "Salon settings",
        labelAr: "إعدادات الصالون",
        icon: Settings,
      },
      {
        to: "/admin/marketplace",
        label: "Marketplace status",
        labelAr: "حالة المتجر",
        icon: Store,
      },
    ],
  },
];

export const ADMIN_NAV: NavItem[] = ADMIN_SECTIONS.flatMap((s) => s.items).filter((i) => !i.soon);

/** Reduced menu for specialists: their own book only. */
export const STAFF_SECTIONS: NavSection[] = [
  {
    label: "My work",
    items: [
      {
        to: "/admin/my-appointments",
        label: "My appointments",
        labelAr: "مواعيدي",
        icon: ClipboardList,
      },
      { to: "/admin/calendar", label: "My calendar", labelAr: "تقويمي", icon: CalendarDays },
      { to: "/admin/availability", label: "My hours", labelAr: "ساعات العمل", icon: Clock },
    ],
  },
  {
    label: "Feedback",
    items: [{ to: "/admin/reviews", label: "Reviews", labelAr: "التقييمات", icon: Star }],
  },
];

export const STAFF_NAV: NavItem[] = STAFF_SECTIONS.flatMap((s) => s.items);

export const PLATFORM_NAV: NavItem[] = [
  {
    to: "/admin/platform/overview",
    label: "Global data",
    labelAr: "البيانات العامة",
    icon: BarChart3,
  },
  { to: "/admin/platform/directory", label: "Directory", labelAr: "الفهرس", icon: Search },
  {
    to: "/admin/platform/businesses",
    label: "Businesses",
    labelAr: "الأنشطة التجارية",
    icon: Building2,
  },
  {
    to: "/admin/platform/marketplace",
    label: "Marketplace approvals",
    labelAr: "موافقات المتجر",
    icon: Store,
  },
  {
    to: "/admin/platform/users",
    label: "Platform users",
    labelAr: "المستخدمون",
    icon: ShieldCheck,
  },
  { to: "/admin/platform/categories", label: "Categories", labelAr: "الفئات", icon: Tags },
  { to: "/admin/platform/countries", label: "Countries", labelAr: "الدول", icon: Globe },
  {
    to: "/admin/platform/auth-policies",
    label: "Auth policies",
    labelAr: "سياسات الدخول",
    icon: KeyRound,
  },
];

const QUICK_ACTIONS = [
  { label: "Add service", to: "/admin/services" },
  { label: "Add specialist", to: "/admin/staff" },
  { label: "Open calendar", to: "/admin/calendar" },
  { label: "New booking", to: "/admin/appointments" },
  { label: "Add client", to: "/admin/customers" },
] as const;

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

/** Back-office reuses the site-wide language + RTL state. */
function useAdminLocale() {
  const { lang, toggleLang } = useLocale();
  return { locale: lang, toggle: toggleLang };
}

/* ------------------------------ command palette --------------------------- */

function GlobalCommand({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
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
        supabase.from("staff").select("id, full_name, business_id").ilike("full_name", like).limit(5),
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
        placeholder="Search customers, bookings, services, staff…"
        value={term}
        onValueChange={setTerm}
      />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Go to">
          {ADMIN_NAV.map((item) => (
            <CommandItem key={item.to} value={`nav ${item.label}`} onSelect={() => go(item.to)}>
              <item.icon className="mr-2 size-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        {results.data?.customers.length ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Customers">
              {results.data.customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`customer ${c.full_name}`}
                  onSelect={() => go("/admin/customers")}
                >
                  <Users className="mr-2 size-4" />
                  {c.full_name || "Unnamed"}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
        {results.data?.staff.length ? (
          <CommandGroup heading="Specialists">
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
          <CommandGroup heading="Services">
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
  const { locale, toggle: toggleLocale } = useAdminLocale();
  const { user, primaryRole, hasRole } = useAuth();
  const isPlatformAdmin = hasRole("super_admin") || hasRole("admin");
  const { isStaffOnly } = useMyStaffRecord();

  // Owners see a review banner until the platform team approves their salon.
  const ownedSalon = useQuery({
    queryKey: ["owned-salon-status", user?.id, isPlatformAdmin],
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
          <span className="truncate">{locale === "ar" ? item.labelAr : item.label}</span>
          <span className="ms-auto shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-extrabold uppercase text-muted-foreground">
            {locale === "ar" ? "قريباً" : "Soon"}
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
        <span className="truncate">{locale === "ar" ? item.labelAr : item.label}</span>
      </Link>
    );
  };

  const sectionHeading = (label: string) => (
    <span
      key={`h-${label}`}
      className="mt-4 px-3 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground first:mt-0"
    >
      {label}
    </span>
  );

  // Platform admins own no salon: they get the platform console first, then the
  // salon modules scoped to whichever business they pick.
  const salonSections = isStaffOnly
    ? STAFF_SECTIONS
    : isPlatformAdmin
      ? ADMIN_SECTIONS.map((section) =>
          section.label === "Today"
            ? { ...section, items: section.items.filter((i) => i.to !== "/admin") }
            : section.label === "Account"
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
          {sectionHeading(locale === "ar" ? "المنصة" : "Platform")}
          {PLATFORM_NAV.map(renderLink)}
        </div>
      )}
      {isPlatformAdmin
        ? sectionHeading(locale === "ar" ? "إدارة أي صالون" : "Manage any salon")
        : null}
      {salonSections.map((section) => (
        <div key={section.label} className="flex flex-col gap-1">
          {sectionHeading(section.label)}
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
              Business
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
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-float">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-base font-extrabold">Dallty Business</span>
              <button
                type="button"
                aria-label="Close menu"
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
                aria-label="Open menu"
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
                <span className="truncate">Search customers, bookings, services…</span>
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
                  aria-label="Quick create"
                  className="press flex min-h-10 items-center gap-1.5 rounded-2xl bg-primary px-3 text-sm font-bold text-primary-foreground"
                >
                  <Plus className="size-4" />
                  <span className="hidden sm:inline">Create</span>
                </button>
                {quickOpen && (
                  <div className="absolute end-0 top-12 z-50 w-56 overflow-hidden rounded-2xl glass p-1.5 shadow-xl">
                    {QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => {
                          setQuickOpen(false);
                          navigate({ to: action.to });
                        }}
                        className="block w-full rounded-xl px-3 py-2 text-start text-sm font-semibold hover:bg-secondary/70"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <NotificationCenter />

              <button
                type="button"
                onClick={toggleLocale}
                aria-label="Switch language"
                className="grid size-10 place-items-center rounded-2xl glass-soft text-xs font-extrabold"
              >
                {locale === "ar" ? "EN" : "ع"}
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle dark mode"
                className="grid size-10 place-items-center rounded-2xl glass-soft"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <a
                href="mailto:support@dallty.com"
                aria-label="Live support"
                className="hidden size-10 place-items-center rounded-2xl glass-soft sm:grid"
              >
                <LifeBuoy className="size-4" />
              </a>
            </div>
          </div>
        </header>

        <main className="px-4 pb-16 pt-6 sm:px-6">
          {ownedSalon.data && ownedSalon.data.marketplace_status !== "approved" && (
            <div className="mb-5 rounded-3xl glass p-5">
              <p className="text-sm font-extrabold">
                {ownedSalon.data.marketplace_status === "pending_review"
                  ? "Your salon is under marketplace review"
                  : ownedSalon.data.marketplace_status === "rejected"
                    ? "Your salon was not approved for the marketplace"
                    : ownedSalon.data.marketplace_status === "hidden"
                      ? "Your salon is hidden from the marketplace"
                      : "Your salon is not listed yet"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You have full access to your dashboard — only public marketplace visibility is
                affected.
                {ownedSalon.data.trial_ends_at
                  ? ` Trial ends ${new Date(ownedSalon.data.trial_ends_at).toLocaleDateString()}.`
                  : ""}
              </p>
            </div>
          )}

          <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
                {current ? (locale === "ar" ? current.labelAr : current.label) : "Dallty Business"}
              </h1>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {user?.email} · {primaryRole.replace("_", " ")}
              </p>
            </div>
            <Link
              to="/"
              className="press hidden min-h-10 items-center rounded-2xl glass-soft px-4 text-sm font-bold sm:flex"
            >
              Customer app
            </Link>
          </div>
          {children}
        </main>
      </div>

      <GlobalCommand open={paletteOpen} onOpenChange={setPaletteOpen} />

      {/* Mobile language/theme safe area spacer */}
      <div className="h-2 lg:hidden" />
    </div>
  );
}
