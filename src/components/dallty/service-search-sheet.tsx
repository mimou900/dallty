import { useMemo } from "react";
import { ArrowLeft, Search, Grid2x2 } from "lucide-react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useCategories, translate, type Category } from "@/lib/reference-data";
import { useLiveBusinesses } from "@/hooks/use-live-businesses";
import { useLocale } from "@/lib/i18n";

export type ServiceSelection =
  { kind: "category"; value: string; label: string } | { kind: "query"; value: string };

function CategoryIcon({ name }: { name: string }) {
  const Icon = (Icons as unknown as Record<string, LucideIcon>)[name] ?? Icons.Sparkles;
  return <Icon className="size-5" />;
}

/**
 * Full-screen service search — browse Dallty's real, DB-backed category taxonomy
 * (`categories` table, the same one business owners pick from at signup) when the
 * input is empty, or live-filter real businesses by name once the visitor types.
 * There is no per-individual-service catalog in the backend (no "Haircut"/"Manicure"
 * master list to search across businesses), so this deliberately searches at the
 * category + business-name level rather than inventing a finer taxonomy.
 */
export function ServiceSearchSheet({
  open,
  query,
  onQueryChange,
  onClose,
  onSelectCategory,
  onSelectBusiness,
  onSubmitQuery,
}: {
  open: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  onSelectCategory: (category: Category) => void;
  onSelectBusiness: (businessSlug: string) => void;
  onSubmitQuery: (q: string) => void;
}) {
  const { lang } = useLocale();
  const categories = useCategories();
  const { data: liveBusinesses } = useLiveBusinesses();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (liveBusinesses ?? [])
      .filter((b) => b.en.name.toLowerCase().includes(q) || b.ar.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [liveBusinesses, query]);

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
          aria-label="Back"
          className="press grid size-10 shrink-0 place-items-center rounded-full bg-muted/60"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="text-h3 truncate">Search</h1>
      </header>

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
              placeholder="Search by service or business"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </label>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {query.trim() ? (
          <>
            <p className="px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Businesses
            </p>
            {matches.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No businesses match "{query.trim()}" yet — try Search instead.
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
              Categories
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
                  <span className="text-sm text-muted-foreground">Loading categories…</span>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
