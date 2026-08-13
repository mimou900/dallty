import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouterState } from "@tanstack/react-router";

import { copy, type Lang } from "@/lib/dallty-content";

export type { Lang };

export const LANGUAGES = [
  { code: "en" as const, label: "English", native: "English", dir: "ltr" as const },
  { code: "ar" as const, label: "Arabic", native: "العربية", dir: "rtl" as const },
];

export const DEFAULT_LANG: Lang = "en";
const STORAGE_KEY = "dallty.lang";
const COOKIE_KEY = "dallty_lang";

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "ar";
}

export function dirFor(lang: Lang) {
  return lang === "ar" ? ("rtl" as const) : ("ltr" as const);
}

/** Locale-specific URL for a path — used for canonical + hreflang alternates. */
export function localizedPath(pathname: string, lang: Lang, searchStr = "") {
  const params = new URLSearchParams(searchStr.replace(/^\?/, ""));
  if (lang === DEFAULT_LANG) params.delete("lang");
  else params.set("lang", lang);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Language asked for in the URL — the only value that is safe during SSR/hydration. */
export function langFromSearch(search: unknown): Lang | null {
  const value = (search as { lang?: unknown } | undefined)?.lang;
  return isLang(value) ? value : null;
}

function readStored(): Lang | null {
  if (typeof document === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  const cookie = document.cookie.match(/(?:^|;\s*)dallty_lang=(\w+)/)?.[1];
  return isLang(cookie) ? cookie : null;
}

/** Browser language, the default signal for first-time visitors. */
function detectBrowserLang(): Lang {
  if (typeof navigator === "undefined") return DEFAULT_LANG;
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of candidates) {
    const code = (raw || "").toLowerCase();
    if (code.startsWith("ar")) return "ar";
    if (code.startsWith("en")) return "en";
  }
  return DEFAULT_LANG;
}

function persist(lang: Lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage blocked */
  }
  document.cookie = `${COOKIE_KEY}=${lang};path=/;max-age=31536000;samesite=lax`;
}

type LocaleValue = {
  lang: Lang;
  dir: "ltr" | "rtl";
  isRtl: boolean;
  isArabic: boolean;
  /** Existing bilingual copy dictionary for the active language. */
  t: (typeof copy)[Lang];
  /** Inline helper: pick(englishText, arabicText). */
  pick: <T>(en: T, ar: T) => T;
  setLang: (next: Lang) => void;
  toggleLang: () => void;
};

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
      urlLang: langFromSearch(state.location.search),
    }),
  });

  // SSR + first client render agree on the URL language, so hydration is safe.
  const [preferred, setPreferred] = useState<Lang | null>(null);
  const lang = location.urlLang ?? preferred ?? DEFAULT_LANG;

  // After mount: honour a saved choice, otherwise the browser language.
  useEffect(() => {
    if (location.urlLang) {
      persist(location.urlLang);
      setPreferred(location.urlLang);
      return;
    }
    // Only apply the stored/browser preference in state — rewriting the URL here
    // would fight hydration. Explicit switches (setLang) update the URL instead.
    setPreferred(readStored() ?? detectBrowserLang());
  }, [location.urlLang]);

  // Keep the document in sync so RTL, fonts and screen readers follow along.
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = dirFor(lang);
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      persist(next);
      setPreferred(next);
      window.history.replaceState(
        window.history.state,
        "",
        localizedPath(window.location.pathname, next, window.location.search),
      );
    },
    [],
  );

  const value = useMemo<LocaleValue>(
    () => ({
      lang,
      dir: dirFor(lang),
      isRtl: lang === "ar",
      isArabic: lang === "ar",
      t: copy[lang],
      pick: <T,>(en: T, ar: T) => (lang === "ar" ? ar : en),
      setLang,
      toggleLang: () => setLang(lang === "ar" ? "en" : "ar"),
    }),
    [lang, setLang],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleValue {
  const ctx = useContext(LocaleContext);
  if (ctx) return ctx;
  // Safe fallback for components rendered outside the provider (e.g. error pages).
  return {
    lang: DEFAULT_LANG,
    dir: "ltr",
    isRtl: false,
    isArabic: false,
    t: copy[DEFAULT_LANG],
    pick: <T,>(en: T) => en,
    setLang: () => {},
    toggleLang: () => {},
  };
}
