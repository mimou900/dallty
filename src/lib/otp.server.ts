import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/** Generates a 6-digit numeric code, zero-padded (e.g. "004821"). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function secret(): string {
  const value = process.env.OTP_HMAC_SECRET;
  if (!value) throw new Error("OTP_HMAC_SECRET is not configured");
  return value;
}

/** HMAC-SHA256(secret, code) as hex — never store or compare the raw code. */
export function hashOtpCode(code: string): string {
  return createHmac("sha256", secret()).update(code).digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function otpCodeMatches(code: string, hash: string): boolean {
  const submitted = Buffer.from(hashOtpCode(code), "hex");
  const stored = Buffer.from(hash, "hex");
  if (submitted.length !== stored.length) return false;
  return timingSafeEqual(submitted, stored);
}
