import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/client-error-reporting";
import { AuthProvider } from "@/hooks/use-auth";
import { ReferenceDataProvider } from "@/lib/reference-data";
import { supabase } from "@/integrations/supabase/client";
import { takeNextPath } from "@/lib/next-path";
import { Toaster } from "@/components/ui/sonner";
import { ConnectionBanner } from "@/components/dallty/connection-banner";
import {
  LocaleProvider,
  DEFAULT_LANG,
  dirFor,
  localizedPath,
  resolveInitialLang,
  type Lang,
} from "@/lib/i18n";
import {
  preloadNamespaces,
  seedCache,
  snapshotCache,
  type NamespaceSnapshot,
} from "@/lib/i18n/loader";
import { ACTIVE_NAMESPACES } from "@/lib/i18n/namespaces";

/** Per-language snapshot of already-fetched namespace data, carried from SSR's
 *  `beforeLoad` down to the client via route context — see the comment on
 *  `beforeLoad` and `seedCache`/`snapshotCache` (src/lib/i18n/loader.ts). */
type I18nSeed = Partial<Record<Lang, NamespaceSnapshot>>;

/**
 * `@tanstack/react-start/server` (for `getRequest()`) can't be statically imported
 * from this file at all — it's reachable from the client bundle (this is the root
 * layout), and the build's import-protection rejects that specifier outright even
 * inside a `typeof document` guard, since it scans imports statically rather than
 * per-branch. `createIsomorphicFn` is the supported way to give a route hook two
 * real per-environment implementations without either one leaking into the wrong
 * bundle: the `.server()` callback (and its dynamic import) only ships server-side,
 * `.client()` only ships client-side.
 */
const getLangSignals = createIsomorphicFn()
  .server(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const headers = getRequest()?.headers;
    return {
      cookieHeader: headers?.get("cookie") ?? null,
      acceptLanguageHeader: headers?.get("accept-language") ?? null,
    };
  })
  .client(() => ({
    cookieHeader: document.cookie as string | null,
    acceptLanguageHeader: null as string | null,
  }));

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Awaited before the route tree renders — both during SSR and on every
  // client navigation — so every screen's translations are already in cache
  // by first paint. Without this, each page's first mount shows raw i18n
  // keys until its own useTranslation() effect finishes loading (see
  // src/lib/i18n/hooks.ts). Namespace fetches are cheap (~15KB total) and
  // preloadNamespaces() no-ops anything already cached, so this only ever
  // costs real time on the very first navigation.
  //
  // DEFAULT_LANG is preloaded alongside the active language (a no-op when
  // they're the same) so that if a specific key is genuinely missing from a
  // non-default language's file, useTranslation()'s fallback (see
  // src/lib/i18n/hooks.ts) has real data to fall back to instead of ever
  // surfacing the raw key.
  //
  // `lang` here is resolved with the SAME priority LocaleProvider used to only
  // apply after mount (URL > saved cookie > Accept-Language > default) — the
  // difference is this runs before the route renders, server-side included, by
  // reading the cookie/header off the real request instead of the browser-only
  // localStorage. That's what fixes the "renders in English, then flips to the
  // saved language" flash: previously SSR always fell back to DEFAULT_LANG
  // whenever the URL had no `?lang=`, even for a returning non-English visitor,
  // and the client only discovered their real preference after hydration.
  beforeLoad: async ({ location }): Promise<{ lang: Lang; i18nSeed: I18nSeed }> => {
    const { cookieHeader, acceptLanguageHeader } = await getLangSignals();
    const lang = resolveInitialLang({
      search: location.search,
      cookieHeader,
      acceptLanguageHeader,
    });
    try {
      await Promise.all([
        preloadNamespaces(lang, ACTIVE_NAMESPACES),
        lang === DEFAULT_LANG
          ? Promise.resolve()
          : preloadNamespaces(DEFAULT_LANG, ACTIVE_NAMESPACES),
      ]);
    } catch (error) {
      console.error("[i18n] failed to preload namespaces", error);
    }
    // Ships whatever SSR just fetched down to the client as plain serializable
    // data (see snapshotCache/seedCache in src/lib/i18n/loader.ts) — the whole
    // point being that RootComponent can seed the client's own cache with this
    // SYNCHRONOUSLY, during its first render, instead of the client needing to
    // re-fetch the same namespace files itself before it has anything to render.
    // That re-fetch gap was a real (if narrow) race: on a cold client the first
    // render could momentarily land before the fetch resolved, showing the
    // fallback language for a beat before flipping to the resolved one.
    const i18nSeed: I18nSeed = { [lang]: snapshotCache(lang, ACTIVE_NAMESPACES) };
    if (lang !== DEFAULT_LANG)
      i18nSeed[DEFAULT_LANG] = snapshotCache(DEFAULT_LANG, ACTIVE_NAMESPACES);
    return { lang, i18nSeed };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5",
      },
      { name: "theme-color", content: "#0F4F35" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Dallty" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { title: "Dallty — Find. Book. Relax." },
      {
        name: "description",
        content:
          "Book salons, barbers, nails and spa across the Arab world in under a minute with Dallty.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Fonts are self-hosted (@font-face rules in styles.css, files under
      // public/fonts/) — this used to be three cross-origin stylesheets
      // (fonts.googleapis.com, api.fontshare.com, each pulling from its own
      // CDN), each a separate DNS+TLS negotiation plus a CSS-then-font fetch
      // hop, all render-blocking on the critical path. Same exact font
      // files, now served from this origin as part of appCss above instead.
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const SITE_URL = "https://dallty.com";

function RootShell({ children }: { children: ReactNode }) {
  const { pathname, searchStr } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
    }),
  });
  // Server-resolved (see beforeLoad above) so the very first byte of HTML already
  // carries the right lang/dir — no separate "urlLang ?? en" guess here that could
  // disagree with what LocaleProvider ends up using further down the tree.
  const { lang } = Route.useRouteContext();

  return (
    <html lang={lang} dir={dirFor(lang)}>
      <head>
        <HeadContent />
        {/* Each language is a separately indexable URL. */}
        <link rel="canonical" href={SITE_URL + localizedPath(pathname, lang, searchStr)} />
        <link
          rel="alternate"
          hrefLang="en"
          href={SITE_URL + localizedPath(pathname, "en", searchStr)}
        />
        <link
          rel="alternate"
          hrefLang="fr"
          href={SITE_URL + localizedPath(pathname, "fr", searchStr)}
        />
        <link
          rel="alternate"
          hrefLang="ar"
          href={SITE_URL + localizedPath(pathname, "ar", searchStr)}
        />
        <link
          rel="alternate"
          hrefLang="x-default"
          href={SITE_URL + localizedPath(pathname, "en", searchStr)}
        />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient, lang, i18nSeed } = Route.useRouteContext();
  // Synchronous, not an effect — must land before <Outlet/>'s subtree does its
  // first render, in the SAME pass, or the very race this exists to close (a
  // child's t() call landing before the client has any data for `lang`) would
  // still be possible. seedCache() no-ops anything already cached, so this is
  // cheap and safe to run on every render.
  for (const [seedLang, dict] of Object.entries(i18nSeed)) {
    seedCache(seedLang as Lang, dict);
  }
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      // OAuth returns to the site root; send the user back where they were.
      if (event === "SIGNED_IN") {
        const saved = takeNextPath();
        if (saved && window.location.pathname !== saved) {
          router.navigate({ to: saved, replace: true });
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <ReferenceDataProvider>
        <AuthProvider>
          <LocaleProvider initialLang={lang}>
            {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
            <Outlet />
            <Toaster />
            <ConnectionBanner />
          </LocaleProvider>
        </AuthProvider>
      </ReferenceDataProvider>
    </QueryClientProvider>
  );
}
