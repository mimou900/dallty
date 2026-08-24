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
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/client-error-reporting";
import { AuthProvider } from "@/hooks/use-auth";
import { ReferenceDataProvider } from "@/lib/reference-data";
import { supabase } from "@/integrations/supabase/client";
import { takeNextPath } from "@/lib/next-path";
import { Toaster } from "@/components/ui/sonner";
import { ConnectionBanner } from "@/components/dallty/connection-banner";
import { LocaleProvider, DEFAULT_LANG, dirFor, langFromSearch, localizedPath } from "@/lib/i18n";
import { preloadNamespaces } from "@/lib/i18n/loader";
import { ACTIVE_NAMESPACES } from "@/lib/i18n/namespaces";

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
  beforeLoad: async ({ location }) => {
    const lang = langFromSearch(location.search) ?? DEFAULT_LANG;
    try {
      await preloadNamespaces(lang, ACTIVE_NAMESPACES);
    } catch (error) {
      console.error("[i18n] failed to preload namespaces", error);
    }
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
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
      },
      { rel: "preconnect", href: "https://api.fontshare.com" },
      { rel: "preconnect", href: "https://cdn.fontshare.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&display=swap",
      },
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
  const { pathname, searchStr, urlLang } = useRouterState({
    select: (state) => ({
      pathname: state.location.pathname,
      searchStr: state.location.searchStr,
      urlLang: langFromSearch(state.location.search),
    }),
  });
  const lang = urlLang ?? "en";

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
  const { queryClient } = Route.useRouteContext();
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
          <LocaleProvider>
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
