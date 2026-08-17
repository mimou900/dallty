/**
 * Standard Webhooks signature verification (https://www.standardwebhooks.com) —
 * the same non-proprietary HMAC-SHA256 scheme Supabase Auth Hooks use, and the
 * one `@lovable.dev/webhooks-js` wrapped. Reimplemented directly here (Web
 * Crypto only, no new dependency) so Dallty's own webhook routes don't need
 * that package.
 *
 * Secret format matches what Supabase's dashboard generates for a hook:
 * `whsec_<base64>` (an optional `v1,` prefix is also accepted and stripped).
 */

export class WebhookVerificationError extends Error {}

export interface StandardWebhookHeaders {
  id: string;
  timestamp: string;
  signature: string;
}

const TOLERANCE_SECONDS = 5 * 60;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function decodeSecret(secret: string): Uint8Array {
  const withoutVersion = secret.startsWith("v1,") ? secret.slice(3) : secret;
  const raw = withoutVersion.startsWith("whsec_") ? withoutVersion.slice(6) : withoutVersion;
  return base64ToBytes(raw);
}

export function readStandardWebhookHeaders(request: Request): StandardWebhookHeaders | null {
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return null;
  return { id, timestamp, signature };
}

/**
 * Verifies a raw request body against Standard Webhooks headers. Throws
 * `WebhookVerificationError` on any failure (missing headers, stale
 * timestamp, no matching signature) — callers should treat that as a 401.
 */
export async function verifyStandardWebhook(
  body: string,
  headers: StandardWebhookHeaders,
  secret: string,
): Promise<void> {
  const timestampSeconds = Number(headers.timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    throw new WebhookVerificationError("invalid webhook-timestamp");
  }
  const skewSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (skewSeconds > TOLERANCE_SECONDS) {
    throw new WebhookVerificationError("webhook-timestamp outside tolerance");
  }

  const signedContent = `${headers.id}.${headers.timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    decodeSecret(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent) as BufferSource,
  );
  const expected = bytesToBase64(new Uint8Array(mac));

  const candidates = headers.signature.split(" ").map((part) => {
    const [version, sig] = part.split(",");
    return version === "v1" ? sig : undefined;
  });

  const matched = candidates.some((sig) => sig && constantTimeEqual(sig, expected));
  if (!matched) {
    throw new WebhookVerificationError("signature mismatch");
  }
}
