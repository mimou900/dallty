import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// Security headers, applied to every response this Worker returns (pages, server-function
// RPCs, everything) — this is the one place in the app that sees every outgoing response,
// so it's the correct single injection point rather than per-route configuration.
//
// CSP is scoped to the third-party origins this app actually loads from today (confirmed by
// reading the source, not guessed): Google Maps JS API (src/lib/maps-loader.ts), Google
// Fonts and Fontshare — Clash Display, project-ui-ux-transformation — (src/routes/__root.tsx's
// preconnect links) for script/style/font, and Supabase (REST + Realtime websocket) for
// connect-src — the logo is a bundled same-origin asset (src/assets/dallty-*.png), not a
// separate host, so it needs no extra entry.
//
// `unsafe-inline` on script-src is a deliberate, verified exception, not an oversight:
// TanStack Start's client hydration injects an inline bootstrap script carrying per-request
// loader data (`window.$_TSR`) directly into the HTML. Confirmed by testing this CSP against
// the running dev server before trusting it — a stricter script-src broke hydration entirely
// ("Invariant failed: Expected to find bootstrap data window.$_TSR, but we did not"). A
// hash-based CSP isn't viable here since that script's content (and therefore its hash)
// changes on every request; a nonce-based CSP would need per-request nonce injection into
// TanStack Start's own hydration output, which isn't wired up in this app's current setup.
// style-src needs it for the same reason (Tailwind/Radix inline style attributes at runtime).
const SUPABASE_ORIGIN = "https://cbacaplvcxytzclpiyir.supabase.co";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://maps.googleapis.com`,
  `style-src 'self' 'unsafe-inline'`,
  `font-src 'self'`,
  `img-src 'self' data: blob: https://maps.gstatic.com https://maps.googleapis.com ${SUPABASE_ORIGIN}`,
  `connect-src 'self' ${SUPABASE_ORIGIN} wss://cbacaplvcxytzclpiyir.supabase.co https://maps.googleapis.com`,
  // A library in this app spins up a blob: Web Worker (confirmed by testing — the browser
  // reported a blocked `Creating a worker from 'blob:...'` without worker-src set,
  // falling back to script-src, which correctly doesn't allow blob: URLs).
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CSP);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  headers.set("X-Frame-Options", "DENY");
  // HSTS is meaningful only over HTTPS, which is all this app ever serves in production
  // (Vercel, behind Cloudflare) — safe to set unconditionally.
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
