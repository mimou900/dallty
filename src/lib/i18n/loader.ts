import type { Lang } from "@/lib/i18n";
import type { ActiveNamespace } from "./namespaces";

const modules = import.meta.glob<{ default: Record<string, unknown> }>("/locales/*/*.json");

const cache = new Map<string, Record<string, unknown>>(); // key: `${lang}/${namespace}`

let version = 0;
const listeners = new Set<() => void>();

/** Subscribed by useTranslation() via useSyncExternalStore so a namespace that
 * finishes loading after first render still triggers a re-render — without
 * this, a component mounted before its preload resolves would show raw keys
 * forever, since nothing else would prompt React to re-read the cache. */
export function subscribeToCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCacheVersion(): number {
  return version;
}

export async function loadNamespace(
  lang: Lang,
  namespace: ActiveNamespace,
): Promise<Record<string, unknown>> {
  const path = `/locales/${lang}/${namespace}.json`;
  const load = modules[path];
  if (!load) throw new Error(`Missing translation file: ${path}`);
  return (await load()).default;
}

export async function preloadNamespaces(lang: Lang, namespaces: ActiveNamespace[]): Promise<void> {
  await Promise.all(
    namespaces.map(async (ns) => {
      const key = `${lang}/${ns}`;
      if (!cache.has(key)) {
        cache.set(key, await loadNamespace(lang, ns));
        version += 1;
        for (const listener of listeners) listener();
      }
    }),
  );
}

export function getCachedNamespace(
  lang: Lang,
  namespace: ActiveNamespace,
): Record<string, unknown> | undefined {
  return cache.get(`${lang}/${namespace}`);
}
