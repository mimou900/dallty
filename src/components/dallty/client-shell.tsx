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
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const { lang } = useLocale();
  const { t } = useTranslation("common");

  return (
    <div className="relative min-h-dvh pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-12">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-32 start-[-10%] size-[34rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-0 end-[-10%] size-[30rem] rounded-full bg-gold/15 blur-3xl" />
      </div>

      <SiteHeader lang={lang} />

      <main className={`mx-auto ${width} px-4 pt-5 sm:px-5`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>

        <div className="mt-6">{children}</div>
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
