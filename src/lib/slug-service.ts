import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

type AnySupabase = SupabaseClient<Database>;

/**
 * Turns a name into a URL slug. Latin names slugify directly; non-Latin
 * names (e.g. Arabic-only) are deliberately NOT transliterated -- there is
 * no universally correct transliteration, so `usable: false` signals the
 * caller to fall back to a random identifier instead of guessing.
 */
export function slugify(name: string): { value: string; usable: boolean } {
  const stripped = name
    .normalize("NFC")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC");
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { value: slug, usable: slug.length >= 3 && slug.length <= 60 && /[a-z]/.test(slug) };
}

export type SlugValidationError =
  | "too_short"
  | "too_long"
  | "invalid_characters"
  | "consecutive_hyphens"
  | "leading_or_trailing_hyphen";

/** Format rules only -- does not check reservation or uniqueness. */
export function validateSlugFormat(slug: string): { valid: boolean; error?: SlugValidationError } {
  if (slug.length < 3) return { valid: false, error: "too_short" };
  if (slug.length > 60) return { valid: false, error: "too_long" };
  if (!/^[a-z0-9-]+$/.test(slug)) return { valid: false, error: "invalid_characters" };
  if (slug.includes("--")) return { valid: false, error: "consecutive_hyphens" };
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return { valid: false, error: "leading_or_trailing_hyphen" };
  }
  return { valid: true };
}

/** Checks the Super-Admin-managed reserved word list. Case-insensitive. */
export async function isReservedSlug(supabase: AnySupabase, slug: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("reserved_slugs")
    .select("id")
    .eq("active", true)
    .ilike("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/**
 * Finds a free slug starting from `base`, appending -2, -3, ... on collision.
 * Checks both the live table and its redirect-history table so a retired
 * slug is never reissued. Parameterized over table names so a future entity
 * (categories, specialists, cities) can reuse this without a rewrite --
 * businesses is the only caller today.
 */
export async function resolveUniqueSlug(params: {
  supabase: AnySupabase;
  table: "businesses";
  redirectTable: "business_slug_redirects";
  redirectColumn: "old_slug";
  base: string;
}): Promise<string> {
  const { supabase, table, redirectTable, redirectColumn, base } = params;
  let candidate = base;
  let suffix = 1;
  for (;;) {
    const [{ data: liveHit }, { data: retiredHit }] = await Promise.all([
      supabase.from(table).select("id").ilike("slug", candidate).maybeSingle(),
      supabase.from(redirectTable).select("id").ilike(redirectColumn, candidate).maybeSingle(),
    ]);
    if (!liveHit && !retiredHit) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}
