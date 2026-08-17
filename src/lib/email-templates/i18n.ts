import type { Lang } from "@/lib/i18n";
import { loadNamespace } from "@/lib/i18n/loader";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";

/**
 * Server-side translation resolver for emails — deliberately NOT the useTranslation() hook,
 * since emails are rendered outside any React context/provider (send-email.ts calls
 * `render(element)` directly, no <I18nProvider> wraps it). `loadNamespace()` itself has no
 * React dependency (it's a plain async function backed by a Vite glob import), so it's safe
 * to call from this server-only module. Mirrors hooks.ts's getPath/interpolate exactly, so
 * `{{var}}` interpolation behaves identically to the rest of the app's i18n.
 */

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[part];
    return undefined;
  }, obj);
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{{${name}}}`,
  );
}

export async function getEmailNamespace(lang: Lang): Promise<Record<string, unknown>> {
  try {
    return await loadNamespace(lang, "emails");
  } catch {
    return await loadNamespace("en", "emails");
  }
}

export function tEmail(
  dict: Record<string, unknown>,
  key: NamespaceKeyMap["emails"],
  vars?: Record<string, string | number>,
): string {
  const value = getPath(dict, key);
  if (typeof value === "string") return interpolate(value, vars);
  return key as string;
}
