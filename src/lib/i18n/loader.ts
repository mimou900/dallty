import type { Lang } from "@/lib/i18n";
import type { ActiveNamespace } from "./namespaces";

/** Plain JSON value — unlike `Record<string, unknown>`, this satisfies TanStack
 *  Router's serializable-context check, needed because a namespace snapshot
 *  crosses the beforeLoad server→client boundary (see snapshotCache/seedCache). */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

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

/**
 * Plain, JSON-serializable snapshot of every namespace already cached for `lang` —
 * used to carry SSR's already-fetched translation data down to the client (see
 * `seedCache` below and its call site in `__root.tsx`). The server and the browser
 * are separate JS runtimes with separate module state, so populating this `cache`
 * Map server-side (via `preloadNamespaces` in `beforeLoad`) does nothing for the
 * client on its own — without this, the client's first render has an empty cache
 * regardless of what SSR already resolved, which is what caused a real (if narrow)
 * race: `t()` briefly falling through to its fallback language before the client's
 * own async fetch of the same data completed.
 */
export type NamespaceSnapshot = Partial<Record<ActiveNamespace, Record<string, Json>>>;

export function snapshotCache(
  lang: Lang,
  namespaces: readonly ActiveNamespace[],
): NamespaceSnapshot {
  const snapshot: NamespaceSnapshot = {};
  for (const ns of namespaces) {
    const dict = getCachedNamespace(lang, ns);
    if (dict) snapshot[ns] = dict as Record<string, Json>;
  }
  return snapshot;
}

/** Writes already-known namespace data directly into the cache — no fetch, no
 *  await, safe to call synchronously during render. No-ops anything already
 *  cached (e.g. a second render, or data the client already fetched itself). */
export function seedCache(lang: Lang, snapshot: NamespaceSnapshot | undefined): void {
  if (!snapshot) return;
  for (const [ns, dict] of Object.entries(snapshot)) {
    const key = `${lang}/${ns}`;
    if (!cache.has(key)) {
      cache.set(key, dict as Record<string, unknown>);
      version += 1;
    }
  }
}
