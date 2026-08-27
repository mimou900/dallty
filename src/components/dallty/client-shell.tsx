import { type ReactNode } from "react";

import { BottomNav } from "@/components/dallty/bottom-nav";
import { SiteHeader } from "@/components/dallty/site-nav";
import { useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";

/**
 * Shared logged-in customer layout: persistent header, section tabs and the
 * mobile bottom navigation so the nav never disappears after login.
 */
export function ClientShell({
  title,
  subtitle,
  actions,
  children,
  width = "max-w-3xl",
  surface = "default",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
  /** "cream" swaps the page canvas for the brand's warm editorial cream instead
   *  of the site-wide mint neutral — opt in per page, see the --cream token. */
  surface?: "default" | "cream";
}) {
  const { lang } = useLocale();
  const { t } = useTranslation("common");

  return (
    <div
      className={`relative min-h-dvh pb-nav-safe md:pb-12 ${
        surface === "cream" ? "bg-cream text-cream-foreground" : ""
      }`}
    >
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="glow-blob -top-32 start-[-10%] size-[34rem]" />
        <div
          className="glow-blob bottom-0 end-[-10%] size-[30rem]"
          style={{ animationDelay: "-8s" }}
        />
      </div>

      <SiteHeader lang={lang} />

      <main className={`mx-auto ${width} px-4 pt-6 sm:px-5 sm:pt-8`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-h1 truncate">{title}</h1>
            {subtitle && (
              <p className="text-body-sm mt-1.5 line-clamp-2 text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        <div className="mt-7 sm:mt-8">{children}</div>
      </main>

      <BottomNav
        tabs={[
          t("nav.home"),
          t("nav.search"),
          t("nav.bookings"),
          t("nav.favorites"),
          t("nav.profile"),
        ]}
      />
    </div>
  );
}
