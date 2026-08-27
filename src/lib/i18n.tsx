import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouterState } from "@tanstack/react-router";
import { arDZ, enUS, fr } from "date-fns/locale";

import type { Lang } from "@/lib/dallty-content";
import { preloadNamespaces } from "@/lib/i18n/loader";
import type { ActiveNamespace } from "@/lib/i18n/namespaces";

export type { Lang };

export const LANGUAGES = [
  {
    code: "en" as const,
    label: "English",
    native: "English",
    dir: "ltr" as const,
    dateFnsLocale: enUS,
  },
  {
    code: "fr" as const,
    label: "French",
    native: "Français",
    dir: "ltr" as const,
    dateFnsLocale: fr,
  },
  {
    code: "ar" as const,
    label: "Arabic",
    native: "العربية",
    dir: "rtl" as const,
    dateFnsLocale: arDZ,
  },
];

export const DEFAULT_LANG: Lang = "en";
const STORAGE_KEY = "dallty.lang";
const COOKIE_KEY = "dallty_lang";

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "fr" || value === "ar";
}

export function dirFor(lang: Lang): "ltr" | "rtl" {
  return LANGUAGES.find((l) => l.code === lang)?.dir ?? "ltr";
}

export function dateFnsLocaleFor(lang: Lang) {
  return LANGUAGES.find((l) => l.code === lang)?.dateFnsLocale ?? enUS;
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

/** Reads the persisted-language cookie out of a raw `Cookie` header string — works
 *  both server-side (from the incoming request's headers) and client-side (from
 *  `document.cookie`, which has the exact same `name=value; name2=value2` shape),
 *  so the same helper resolves the saved language before first paint everywhere. */
export function langFromCookieString(cookieHeader: string | null | undefined): Lang | null {
  const value = cookieHeader?.match(/(?:^|;\s*)dallty_lang=(\w+)/)?.[1];
  return isLang(value) ? value : null;
}

/** Same prefix-matching rule as `detectBrowserLang` below, fed by the `Accept-Language`
 *  request header instead of `navigator.languages` — lets SSR make the same "browser
 *  language" guess for a first-time visitor that the client would otherwise only make
 *  after hydration, which is what used to cause a visible language flash. */
export function langFromAcceptLanguageHeader(header: string | null | undefined): Lang | null {
  if (!header) return null;
  const tags = header.split(",").map((t) => t.split(";")[0].trim().toLowerCase());
  for (const tag of tags) {
    if (tag.startsWith("ar")) return "ar";
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("en")) return "en";
  }
  return null;
}

/**
 * Resolves the language SSR should render with, and that the client's first hydration
 * pass must agree on bit-for-bit — same priority the client already used post-mount
 * (URL > saved cookie > browser language > default), just evaluated once up front
 * instead of starting at DEFAULT_LANG and correcting itself after mount. This is the
 * fix for the "renders in English, then flips to the saved/browser language" flash:
 * unlike localStorage, the language cookie (and the Accept-Language header) travel
 * with the HTTP request, so the server can make the same call the client used to only
 * make after the fact.
 */
export function resolveInitialLang(params: {
  search: unknown;
  cookieHeader: string | null | undefined;
  acceptLanguageHeader?: string | null;
}): Lang {
  return (
    langFromSearch(params.search) ??
    langFromCookieString(params.cookieHeader) ??
    (params.acceptLanguageHeader
      ? langFromAcceptLanguageHeader(params.acceptLanguageHeader)
      : null) ??
    DEFAULT_LANG
  );
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
  setLang: (next: Lang) => Promise<void>;
  /** Registers namespaces the active route/component needs, so a language switch re-preloads them before committing. */
  registerNamespaces: (namespaces: ActiveNamespace[]) => void;
};

const LocaleContext = createContext<LocaleValue | null>(null);

export function LocaleProvider({
  children,
  initialLang,
}: {
  children: ReactNode;
  /** Server-resolved via `resolveInitialLang()` (URL > saved cookie > Accept-Language
   *  header > default) and passed down from the root route's `beforeLoad` — the whole
   *  point is that this already matches what SSR rendered, so the first client render
   *  needs no post-mount correction (that correction was the "renders in English, then
   *  flips to the saved language" flash). */
  initialLang: Lang;
}) {
  const location = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
      urlLang: langFromSearch(state.location.search),
    }),
  });

  const [preferred, setPreferred] = useState<Lang>(initialLang);
  const lang = location.urlLang ?? preferred;

  // Only fires for an explicit URL language (a hreflang link, a shared `?lang=` URL,
  // or setLang's own history.replaceState) — the saved-preference/browser-language
  // case is already resolved into `initialLang` above, before first paint.
  useEffect(() => {
    if (location.urlLang) {
      persist(location.urlLang);
      setPreferred(location.urlLang);
    }
  }, [location.urlLang]);

  // "common" is chrome shared by nearly every screen — always warm.
  useEffect(() => {
    void preloadNamespaces(lang, ["common"]);
  }, [lang]);

  // Keep the document in sync so RTL, fonts and screen readers follow along.
  useEffect(() => {
    const el = document.documentElement;
    el.lang = lang;
    el.dir = dirFor(lang);
  }, [lang]);

  const activeNamespacesRef = useRef<Set<ActiveNamespace>>(new Set());

  const registerNamespaces = useCallback((namespaces: ActiveNamespace[]) => {
    for (const ns of namespaces) activeNamespacesRef.current.add(ns);
  }, []);

  const setLang = useCallback(async (next: Lang) => {
    await preloadNamespaces(next, Array.from(activeNamespacesRef.current));
    persist(next);
    setPreferred(next);
    window.history.replaceState(
      window.history.state,
      "",
      localizedPath(window.location.pathname, next, window.location.search),
    );
  }, []);

  const value = useMemo<LocaleValue>(
    () => ({
      lang,
      dir: dirFor(lang),
      isRtl: dirFor(lang) === "rtl",
      setLang,
      registerNamespaces,
    }),
    [lang, setLang, registerNamespaces],
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
    setLang: async () => {},
    registerNamespaces: () => {},
  };
}
