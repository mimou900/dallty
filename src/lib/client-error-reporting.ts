/**
 * Client-side error reporting — replaces `reportLovableError`, which forwarded
 * React error-boundary exceptions to `window.__lovableEvents`/
 * `window.__lovableReportRuntimeError`, hooks injected only by Lovable's own
 * editor preview. Outside that preview (i.e. in real production) those hooks
 * never existed, so errors were silently swallowed — no observability at all.
 *
 * This project has no dedicated error-tracking service yet (see
 * docs/DALLTY_IMPLEMENTATION_ROADMAP.md, phase 22 — Observability: NOT
 * STARTED). Until one is added, a structured `console.error` is the honest,
 * dependency-free fallback: visible in the browser console and, if the host
 * ever wires up console forwarding, in whatever collects it.
 */

type ErrorReportOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  severity?: "error" | "warning" | "info";
};

export function reportClientError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorReportOptions = {},
) {
  if (typeof window === "undefined") return;

  // Loaders and server fns commonly throw a raw Response; String(it) is the
  // opaque "[object Response]", so pull out the status and URL instead.
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  console.error(`[client-error]${options.severity ? ` [${options.severity}]` : ""}`, message, {
    mechanism: options.mechanism ?? "manual",
    route: window.location.pathname,
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });
}
