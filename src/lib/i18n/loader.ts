import type { Lang } from "@/lib/i18n";
import type { ActiveNamespace } from "./namespaces";

const modules = import.meta.glob<{ default: Record<string, unknown> }>("/locales/*/*.json");

const cache = new Map<string, Record<string, unknown>>(); // key: `${lang}/${namespace}`

export async function loadNamespace(
  lang: Lang,
  namespace: ActiveNamespace,
): Promise<Record<string, unknown>> {
  const path = `/locales/${lang}/${namespace}.json`;
  const load = modules[path];
  if (!load) throw new Error(`Missing translation file: ${path}`);
  return (await load()).default;
}

export async function preloadNamespaces(
  lang: Lang,
  namespaces: ActiveNamespace[],
): Promise<void> {
  await Promise.all(
    namespaces.map(async (ns) => {
      const key = `${lang}/${ns}`;
      if (!cache.has(key)) cache.set(key, await loadNamespace(lang, ns));
    }),
  );
}

export function getCachedNamespace(
  lang: Lang,
  namespace: ActiveNamespace,
): Record<string, unknown> | undefined {
  return cache.get(`${lang}/${namespace}`);
}
