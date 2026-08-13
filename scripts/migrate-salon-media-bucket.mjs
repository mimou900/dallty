// scripts/migrate-salon-media-bucket.mjs
//
// One-off: copies every object from the old private `salon-media` bucket to
// the new `business-media` bucket at the same path, then rewrites every
// stored image_url/logo_url/cover_url/business_gallery.url that points at
// the old bucket to a freshly-signed URL against the new one. Signed URLs
// can't be produced by text substitution (see the business-rename plan's
// Task 6 design note) — this downloads+reuploads bytes and calls
// createSignedUrl() for real.
//
// Usage: node scripts/migrate-salon-media-bucket.mjs
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const admin = createClient(url, key);

const OLD_BUCKET = "salon-media";
const NEW_BUCKET = "business-media";
const FIVE_YEARS = 60 * 60 * 24 * 365 * 5;

async function listAllPaths(bucket) {
  const paths = [];
  async function walk(prefix) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw new Error(`list(${prefix}) failed: ${error.message}`);
    for (const entry of data ?? []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) await walk(full); // folder marker
      else paths.push(full);
    }
  }
  await walk("");
  return paths;
}

async function main() {
  const paths = await listAllPaths(OLD_BUCKET);
  console.log(`Found ${paths.length} objects in ${OLD_BUCKET}.`);

  const rewrites = []; // { path, oldUrlSubstring, newSignedUrl }

  for (const path of paths) {
    const { data: file, error: dlError } = await admin.storage.from(OLD_BUCKET).download(path);
    if (dlError) throw new Error(`download(${path}) failed: ${dlError.message}`);

    const { error: upError } = await admin.storage
      .from(NEW_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (upError) throw new Error(`upload(${path}) failed: ${upError.message}`);

    const { data: signed, error: signError } = await admin.storage
      .from(NEW_BUCKET)
      .createSignedUrl(path, FIVE_YEARS);
    if (signError || !signed?.signedUrl) {
      throw new Error(`createSignedUrl(${path}) failed: ${signError?.message}`);
    }

    // Old stored URLs look like:
    //   https://<host>/storage/v1/object/sign/salon-media/<path>?token=...
    // Matching on "/salon-media/<path>?" is specific enough to identify the
    // row without touching the /salons/hair.jpg-style static asset paths
    // (those never contain "/storage/v1/object/sign/").
    rewrites.push({ path, oldUrlSubstring: `/sign/${OLD_BUCKET}/${path}?`, newSignedUrl: signed.signedUrl });
    console.log(`Copied ${path}`);
  }

  let updated = 0;
  for (const col of ["image_url", "logo_url", "cover_url"]) {
    for (const r of rewrites) {
      const { data: rows, error: selError } = await admin
        .from("businesses")
        .select(`id, ${col}`)
        .like(col, `%${r.oldUrlSubstring}%`);
      if (selError) throw new Error(`select businesses.${col} failed: ${selError.message}`);
      for (const row of rows ?? []) {
        const { error: updError } = await admin
          .from("businesses")
          .update({ [col]: r.newSignedUrl })
          .eq("id", row.id);
        if (updError) throw new Error(`update businesses.${row.id}.${col} failed: ${updError.message}`);
        updated++;
        console.log(`Rewrote businesses.${row.id}.${col}`);
      }
    }
  }
  for (const r of rewrites) {
    const { data: rows, error: selError } = await admin
      .from("business_gallery")
      .select("id, url")
      .like("url", `%${r.oldUrlSubstring}%`);
    if (selError) throw new Error(`select business_gallery.url failed: ${selError.message}`);
    for (const row of rows ?? []) {
      const { error: updError } = await admin
        .from("business_gallery")
        .update({ url: r.newSignedUrl })
        .eq("id", row.id);
      if (updError) throw new Error(`update business_gallery.${row.id}.url failed: ${updError.message}`);
      updated++;
      console.log(`Rewrote business_gallery.${row.id}.url`);
    }
  }

  console.log(`Done. Copied ${paths.length} objects, rewrote ${updated} stored URL(s).`);
  console.log("Old bucket left in place — verify, then remove it in Task 7.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
