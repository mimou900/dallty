import { useEffect, useSyncExternalStore } from "react";

import { useLocale } from "@/lib/i18n";
import { getCachedNamespace, getCacheVersion, subscribeToCache } from "./loader";
import type { ActiveNamespace } from "./namespaces";
import type { NamespaceKeyMap } from "./keys.gen";

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

export function useTranslation<N extends ActiveNamespace>(namespace: N | N[]) {
  const { lang, registerNamespaces } = useLocale();
  const namespaces = Array.isArray(namespace) ? namespace : [namespace];

  useEffect(() => {
    registerNamespaces(namespaces);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespaces.join(",")]);

  // Re-renders once a namespace this component needs finishes loading after
  // first mount — without this, a component mounted before its preload
  // resolves would show raw keys forever.
  useSyncExternalStore(subscribeToCache, getCacheVersion, getCacheVersion);

  function t(key: NamespaceKeyMap[N], vars?: Record<string, string | number>): string {
    for (const ns of namespaces) {
      const dict = getCachedNamespace(lang, ns);
      if (!dict) continue;
      const value = getPath(dict, key as string);
      if (typeof value === "string") return interpolate(value, vars);
    }
    if (import.meta.env.DEV) {
      console.warn(
        `[i18n] missing key "${String(key)}" in namespace(s) [${namespaces.join(", ")}] for lang "${lang}"`,
      );
    }
    return key as string;
  }

  return { t };
}
