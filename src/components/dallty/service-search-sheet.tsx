import { useMemo } from "react";
import { ArrowLeft, Search, Grid2x2, Sparkles } from "lucide-react";
import { DynamicIcon, type IconName } from "lucide-react/dynamic.mjs";

import { useCategories, translate, type Category } from "@/lib/reference-data";
import { useLiveBusinesses } from "@/hooks/use-live-businesses";
import { useLocale } from "@/lib/i18n";
import { useTranslation } from "@/lib/i18n/hooks";

export type ServiceSelection =
  { kind: "category"; value: string; label: string } | { kind: "query"; value: string };

/** DB category icons are stored PascalCase (e.g. "HeartHandshake", matching lucide's
 *  named-export style — see supabase/migrations/20260813010300_seed_categories.sql);
 *  `DynamicIcon` expects lucide's kebab-case icon-file names ("heart-handshake"). */
function toKebabIconName(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Za-z])(\d)/g, "$1-$2")
    .toLowerCase();
}

/**
 * Renders a category icon by its DB-stored name without bundling the whole
 * ~1500-icon library — `import * as Icons from "lucide-react"` (the previous
 * approach) forces every icon into one shared chunk, since a dynamic property
 * lookup on a namespace import can't be tree-shaken. `DynamicIcon` fetches only
 * the one icon file actually needed, as its own tiny chunk, per icon name seen.
 */
function CategoryIcon({ name }: { name: string }) {
  return (
    <DynamicIcon
      name={toKebabIconName(name) as IconName}
      className="size-5"
      fallback={() => <Sparkles className="size-5" />}
    />
  );
}

type BodyProps = {
  query: string;
  onQueryChange: (q: string) => void;
  onSelectCategory: (category: Category) => void;
  onSelectBusiness: (businessSlug: string) => void;
  onSubmitQuery: (q: string) => void;
  autoFocus?: boolean;
  /** Compact popover body caps its own list height and scrolls internally instead of
   *  taking over the page — the full-screen sheet instead lets its parent scroll. */
  maxListHeight?: string;
};

/**
 * Shared body for both the mobile full-screen sheet and the desktop popover — browse
 * Dallty's real, DB-backed category taxonomy (`categories` table, the same one
 * business owners pick from at signup) when the input is empty, or live-filter real
 * businesses by name once the visitor types. There is no per-individual-service
 * catalog in the backend (no "Haircut"/"Manicure" master list to search across
 * businesses), so this deliberately searches at the category + business-name level
 * rather than inventing a finer taxonomy.
 */
function ServiceSearchBody({
  query,
  onQueryChange,
  onSelectCategory,
  onSelectBusiness,
  onSubmitQuery,
  autoFocus,
  maxListHeight,
}: BodyProps) {
  const { lang } = useLocale();
  const { t } = useTranslation("marketplace");
  const categories = useCategories();
  const { data: liveBusinesses } = useLiveBusinesses();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (liveBusinesses ?? [])
      .filter((b) => b.en.name.toLowerCase().includes(q) || b.ar.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [liveBusinesses, query]);

  return (
    <>
      <div className="shrink-0 p-4 pb-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) onSubmitQuery(query.trim());
          }}
        >
          <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4">
            <Search className="size-4.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={t("search_service_placeholder")}
              autoFocus={autoFocus}
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </label>
        </form>
      </div>

      <div
        className="flex-1 overflow-y-auto px-2 pb-4"
        style={maxListHeight ? { maxHeight: maxListHeight } : undefined}
      >
        {query.trim() ? (
          <>
            <p className="px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("service_sheet_businesses_label")}
            </p>
            {matches.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                {t("service_sheet_no_match", { query: query.trim() })}
              </p>
            ) : (
              <ul>
                {matches.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => onSelectBusiness(b.slug)}
                      className="press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start hover:bg-muted/60"
                    >
                      <img
                        src={b.image}
                        alt=""
                        className="size-12 shrink-0 rounded-xl object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">
                          {lang === "ar" ? b.ar.name : b.en.name}
                        </span>
                        <span className="block truncate text-sm text-muted-foreground">
                          {b.businessType} · {b.city}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("service_sheet_categories_label")}
            </p>
            <ul>
              {(categories.data ?? []).map((cat) => (
                <li key={cat.id}>
                  <button
                    type="button"
                    onClick={() => onSelectCategory(cat)}
                    className="press flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-start hover:bg-muted/60"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <CategoryIcon name={cat.icon} />
                    </span>
                    <span className="font-semibold">{translate(cat, lang)}</span>
                  </button>
                </li>
              ))}
              {(categories.data ?? []).length === 0 && (
                <li className="flex items-center gap-3 rounded-2xl px-2 py-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <Grid2x2 className="size-5" />
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t("service_sheet_loading_categories")}
                  </span>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

type FlowProps = {
  query: string;
  onQueryChange: (q: string) => void;
  onSelectCategory: (category: Category) => void;
  onSelectBusiness: (businessSlug: string) => void;
  onSubmitQuery: (q: string) => void;
};

/** Mobile/tablet — full-screen takeover, back arrow + title, page itself scrolls. */
export function ServiceSearchSheet({
  open,
  onClose,
  ...body
}: FlowProps & { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("marketplace");
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-(--z-overlay) flex flex-col bg-cream text-cream-foreground"
      role="dialog"
      aria-modal
    >
      <header
        className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 pb-3"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("back_aria")}
          className="press grid size-10 shrink-0 place-items-center rounded-full bg-muted/60"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-h3 truncate">{t("service_sheet_title")}</h1>
      </header>

      <ServiceSearchBody {...body} autoFocus />
    </div>
  );
}

/** Desktop — compact panel meant to sit inside a Popover anchored to the Service
 *  field, not a phone-sized screen. */
export function ServiceSearchPanel(props: FlowProps) {
  return (
    <div className="flex max-h-[28rem] w-[26rem] flex-col overflow-hidden rounded-3xl">
      <ServiceSearchBody {...props} maxListHeight="20rem" />
    </div>
  );
}
