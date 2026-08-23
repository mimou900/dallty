import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Briefcase,
  Calendar,
  ChevronDown,
  Heart,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Search,
  Sparkles,
  Store,
  User,
  UserPlus,
  Users,
} from "lucide-react";

import wordmarkUrl from "@/assets/dallty-wordmark.png";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { landingForRoles } from "@/lib/post-login";
import type { Lang } from "@/lib/dallty-content";
import { dirFor, useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";
import { LanguageSwitcher } from "@/components/dallty/language-switcher";
import { NotificationCenter } from "@/components/dallty/notification-center";
import { supabase } from "@/integrations/supabase/client";

type NavProps = {
  /** Optional override — by default the shared site language is used. */
  lang?: Lang;
};

function buildLegacyM(t: (key: NamespaceKeyMap["common"]) => string) {
  return {
    open: "Menu",
    close: "Close menu",
    customers: t("menu.customers"),
    business: t("menu.business"),
    explore: t("menu.explore"),
    search: t("menu.search"),
    bookings: t("menu.bookings"),
    favorites: t("menu.favorites"),
    account: t("menu.account"),
    notifications: t("menu.notifications"),
    dashboard: t("menu.dashboard"),
    listBusiness: t("menu.list_business"),
    businessSignIn: t("menu.business_sign_in"),
    staffSignIn: t("menu.staff_sign_in"),
    businessDashboard: t("menu.business_dashboard"),
    createAccount: t("menu.create_account"),
    signOut: t("menu.sign_out"),
    language: t("language"),
  };
}

/** Customer-first links, always the top priority in every menu. */
function useNavLinks(lang: Lang) {
  const { user, roles } = useAuth();
  const { t } = useTranslation("common");
  const m = buildLegacyM(t);
  const home = landingForRoles(roles);
  const isManager = home !== "/bookings";

  const customer = [
    { to: "/" as const, label: m.explore, icon: Sparkles },
    { to: "/search" as const, label: m.search, icon: Search },
    { to: "/bookings" as const, label: m.bookings, icon: Calendar },
    { to: "/favorites" as const, label: m.favorites, icon: Heart },
    { to: "/profile" as const, label: m.account, icon: User },
  ];

  // Signed-in visitors must never see links that only work when logged out —
  // "Business sign in" bounces them straight back, so it's hidden once authed.
  const business = [
    { to: "/business/signup" as const, label: m.listBusiness, icon: Store },
    ...(user ? [] : [{ to: "/auth" as const, label: m.businessSignIn, icon: Briefcase }]),
    { to: "/staff/signup" as const, label: m.staffSignIn, icon: Users },
    ...(isManager ? [{ to: home, label: m.businessDashboard, icon: LayoutDashboard }] : []),
  ];

  return { customer, business, user, home, isManager, m };
}

/** Compact trigger + panel, reusable on pages that keep their own contextual header. */
/** Where sign-in should send the visitor back to (keeps a half-made booking). */
function useReturnPath() {
  return useRouterState({
    select: (state) => state.location.pathname + state.location.searchStr,
  });
}

export function NavMenu({ lang: langProp }: NavProps) {
  const { lang: activeLang } = useLocale();
  const lang = langProp ?? activeLang;
  const returnPath = useReturnPath();
  const [open, setOpen] = useState(false);
  const { customer, business, user, home, isManager, m } = useNavLinks(lang);
  const { t } = useTranslation("common");
  const dir = dirFor(lang);

  async function signOut() {
    setOpen(false);
    await supabase.auth.signOut();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label={m.open}
        className="press flex size-11 shrink-0 items-center justify-center rounded-2xl glass-soft"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side={dir === "rtl" ? "left" : "right"}
        dir={dir}
        className="w-[19rem] border-s border-border bg-background p-0 shadow-2xl"
      >
        <div className="flex h-full flex-col overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
          <SheetHeader className="space-y-0 text-start">
            <SheetTitle className="flex items-center">
              <img src={wordmarkUrl} alt={t("brand")} className="h-7 w-auto object-contain" />
            </SheetTitle>
          </SheetHeader>

          {/* Priority 1 — the account / sign-in action */}
          <Link
            to={user ? home : "/auth"}
            search={user ? undefined : { next: returnPath }}
            onClick={() => setOpen(false)}
            className="press mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            {user ? (
              <>
                <LayoutDashboard className="size-4" />
                {isManager ? m.dashboard : m.bookings}
              </>
            ) : (
              <>
                <LogIn className="size-4" />
                {t("sign_in")}
              </>
            )}
          </Link>
          {!user && (
            <Link
              to="/auth"
              search={{ next: returnPath }}
              onClick={() => setOpen(false)}
              className="press mt-2 flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-semibold text-foreground"
            >
              <UserPlus className="size-4" />
              {m.createAccount}
            </Link>
          )}

          {/* Priority 2 — customer navigation */}
          <p className="mt-6 px-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
            {m.customers}
          </p>
          <nav aria-label="Menu" className="mt-2 flex flex-col gap-1">
            {customer.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                activeProps={{ className: "bg-primary/10 !text-primary" }}
                className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {label}
              </Link>
            ))}
          </nav>

          {/* Priority 3 — business, hidden once signed in */}
          {!user && (
            <div className="mt-6 rounded-3xl border border-border bg-muted/60 p-3">
              <p className="px-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
                {m.business}
              </p>
              <nav aria-label="Business menu" className="mt-2 flex flex-col gap-1">
                {business.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to + label}
                    to={to}
                    onClick={() => setOpen(false)}
                    className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-foreground transition-colors hover:bg-background"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          )}

          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
            <div>
              <p className="mb-2 px-1 text-[0.7rem] font-bold uppercase tracking-wide text-muted-foreground">
                {t("language")}
              </p>
              <LanguageSwitcher variant="row" />
            </div>
            {user && (
              <button
                type="button"
                onClick={signOut}
                className="flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-destructive"
              >
                <LogOut className="size-4 shrink-0" />
                {m.signOut}
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Full public header: logo, customer links, demoted business menu, account action. */
export function SiteHeader({ lang: langProp }: NavProps) {
  const { lang: activeLang } = useLocale();
  const lang = langProp ?? activeLang;
  const returnPath = useReturnPath();
  const { customer, business, user, home, isManager, m } = useNavLinks(lang);
  const { t } = useTranslation("common");

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <header className="sticky top-0 z-(--z-nav) px-3 pt-3 sm:px-4 sm:pt-4">
      <div className="glass glass-highlight mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-3xl px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3">
        <Link to="/" className="flex min-w-0 items-center">
          <div className="min-w-0">
            <img src={wordmarkUrl} alt={t("brand")} className="h-6 w-auto object-contain sm:h-7" />
            <p className="truncate text-[0.7rem] text-muted-foreground sm:text-xs">
              {t("tagline")}
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Customer links first */}
          <nav aria-label="Primary" className="hidden items-center gap-1 pe-1 md:flex">
            {customer.slice(0, 4).map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact: to === "/" }}
                activeProps={{ className: "text-foreground bg-primary/10" }}
                className="rounded-2xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Business links tucked into a secondary menu */}
          <DropdownMenu>
            <DropdownMenuTrigger className="hidden items-center gap-1 rounded-2xl px-3 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground md:flex">
              {m.business}
              <ChevronDown className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 glass">
              <DropdownMenuLabel>{m.business}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {business.map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to + label} asChild>
                  <Link to={to} className="flex items-center gap-2 font-semibold">
                    <Icon className="size-4" />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <NotificationCenter />

          <LanguageSwitcher className="hidden shrink-0 sm:flex" />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="press hidden min-h-11 shrink-0 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground md:flex">
                <User className="size-4" />
                {isManager ? m.dashboard : m.account}
                <ChevronDown className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 glass">
                <DropdownMenuItem asChild>
                  <Link to={home} className="font-semibold">
                    {isManager ? m.dashboard : m.bookings}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/favorites" className="font-semibold">
                    {m.favorites}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="font-semibold">
                    {m.account}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => void signOut()}
                  className="font-semibold text-destructive"
                >
                  {m.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to="/auth"
              search={{ next: returnPath }}
              className="press flex min-h-11 shrink-0 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:px-5"
            >
              {t("sign_in")}
            </Link>
          )}

          {/* Mobile: everything lives in one prioritized sheet */}
          <div className="md:hidden">
            <NavMenu lang={lang} />
          </div>
        </div>
      </div>
    </header>
  );
}
