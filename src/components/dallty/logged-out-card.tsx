import { Link, type LinkProps } from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { ComponentType } from "react";

import { useTranslation } from "@/lib/i18n/hooks";

/**
 * Shown on pages that are personal-to-an-account (Bookings, Favorites) when
 * the visitor isn't signed in — instead of the `_authenticated` layout's
 * hard `beforeLoad` redirect to `/auth`, these two routes are intentionally
 * NOT nested under that layout (see their own route files) so an anonymous
 * visitor can land here directly and choose to sign in, rather than being
 * bounced before ever seeing the page they asked for.
 */
export function LoggedOutCard({
  icon: Icon,
  title,
  subtitle,
  nextPath,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  /** Where `/auth` sends them back to after signing in. */
  nextPath: LinkProps["to"];
}) {
  const { t } = useTranslation("common");
  return (
    <div className="mt-8 rounded-3xl border border-border/60 bg-card p-8 text-center">
      <Icon className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-4 text-lg font-extrabold">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{subtitle}</p>
      <div className="mx-auto mt-6 flex max-w-xs flex-col gap-2.5">
        <Link
          to="/auth"
          search={{ next: nextPath }}
          className="press flex min-h-12 items-center justify-center rounded-2xl bg-primary px-6 text-sm font-extrabold text-primary-foreground"
        >
          {t("logged_out.cta")}
        </Link>
        <Link
          to="/"
          className="press flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border/60 px-6 text-sm font-bold text-foreground"
        >
          <Search className="size-4" />
          {t("logged_out.discover")}
        </Link>
      </div>
    </div>
  );
}
