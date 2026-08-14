import { Languages } from "lucide-react";

import { LANGUAGES, useLocale, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SHORT_LABEL: Record<Lang, string> = { en: "EN", fr: "FR", ar: "ع" };

/**
 * Language switcher (English / Français / العربية).
 * Writes the choice to the URL (?lang=) so each language is its own indexable page.
 */
export function LanguageSwitcher({
  className,
  variant = "segmented",
}: {
  className?: string;
  variant?: "segmented" | "row";
}) {
  const { lang, setLang } = useLocale();

  if (variant === "row") {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            type="button"
            lang={l.code}
            aria-pressed={lang === l.code}
            onClick={() => setLang(l.code)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-semibold transition-colors",
              lang === l.code
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {lang === l.code && <Languages className="size-4 shrink-0" />}
            {l.native}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "flex items-center gap-0.5 rounded-2xl border border-border bg-card p-0.5",
        className,
      )}
    >
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
          className={cn(
            "min-h-9 rounded-[0.9rem] px-2.5 text-xs font-bold transition-colors",
            lang === l.code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {SHORT_LABEL[l.code]}
        </button>
      ))}
    </div>
  );
}
