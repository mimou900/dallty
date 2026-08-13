import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

/**
 * Buckets are private, so browse URLs must be signed. Results are memoised for
 * the lifetime of the page to avoid re-signing on every render.
 */
export async function signedUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  cache.set(key, data.signedUrl);
  return data.signedUrl;
}

export async function signedUrls(bucket: string, paths: string[]) {
  const urls = await Promise.all(paths.map((p) => signedUrl(bucket, p)));
  return urls.filter((u): u is string => Boolean(u));
}

export async function uploadTo(bucket: string, userId: string, file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return path;
}

/**
 * Uploads and returns a long-lived signed URL, so the resulting string can be
 * stored directly in a table column and rendered anywhere.
 */
export async function uploadAndSign(bucket: string, userId: string, file: File) {
  const path = await uploadTo(bucket, userId, file);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not read uploaded file");
  return data.signedUrl;
}

