/**
 * Small hand-rolled User-Agent parser — friendly output for security emails,
 * not analytics-grade. A misclassification here is cosmetic (the OTP/
 * password checks are the actual security gate), so no dependency is worth
 * pulling in for this.
 */
export interface ParsedUserAgent {
  browser: string;
  os: string;
  /** e.g. "Chrome on Windows" */
  summary: string;
}

const UNKNOWN: ParsedUserAgent = {
  browser: "an unknown browser",
  os: "an unknown device",
  summary: "an unknown device",
};

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return UNKNOWN;

  let browser = "an unknown browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/CriOS\//.test(ua)) browser = "Chrome";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";

  let os = "an unknown device";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";

  const summary =
    browser === "an unknown browser" && os === "an unknown device"
      ? UNKNOWN.summary
      : `${browser} on ${os}`;
  return { browser, os, summary };
}
