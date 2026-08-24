/**
 * Client-side prep for any user-submitted photo (avatar, review photo) before it reaches
 * Supabase Storage. Three things in one pass:
 *
 * 1. Security: the file is decoded through the browser's own image pipeline
 *    (createImageBitmap), never trusted as bytes-are-what-the-extension-says. A file that
 *    isn't actually a real image (a renamed script, a malformed/polyglot file) fails to
 *    decode and is rejected before it ever leaves the browser. What gets uploaded is a
 *    freshly re-rasterized canvas export — never the original bytes — which also strips
 *    anything a crafted image might have smuggled in its metadata (EXIF GPS included).
 * 2. Filename independence: iPhone/Android photos arrive under all kinds of names
 *    (IMG_1234.HEIC, no extension, unicode names) and HEIC specifically isn't renderable
 *    in most browsers. Re-encoding always produces a plain, predictable `image/webp` blob,
 *    so nothing downstream ever has to parse or trust the original filename.
 * 3. Size: downscaled to `maxDimension` before encoding, which keeps typical phone-camera
 *    photos (12+ MP) well under the bucket's own hard limit instead of relying on the
 *    original upload already being small.
 *
 * WebP, not AVIF: canvas.toBlob("image/avif") is still unsupported in Safari/iOS as of
 * this writing, which would silently break uploads for a large share of phones. WebP has
 * universal encode support across current browsers and gets most of the size win.
 */
export async function prepareImageForUpload(
  file: File,
  { maxDimension = 1600, quality = 0.85 }: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn't a readable image — try a JPG, PNG, WebP or iPhone photo.");
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", quality),
  );
  if (!blob) throw new Error("Could not process this image");

  const base = file.name.replace(/\.[^./\\]+$/, "").trim() || "photo";
  return new File([blob], `${base}.webp`, { type: "image/webp" });
}
