// Shared Dallty brand styling for auth emails.
// Body background stays #ffffff for email-client compatibility.

export const BRAND = {
  emerald: "#1F7A5E",
  emeraldDark: "#155945",
  gold: "#D9A441",
  ink: "#1B2B25",
  body: "#4A5C55",
  muted: "#8A9993",
  hairline: "#E3EDE8",
  surface: "#F5FAF7",
};

export const main = {
  backgroundColor: "#ffffff",
  fontFamily: "'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  margin: "0",
  padding: "0",
};

export const container = {
  maxWidth: "560px",
  margin: "0 auto",
  padding: "32px 24px 40px",
};

export const card = {
  border: `1px solid ${BRAND.hairline}`,
  borderRadius: "18px",
  padding: "32px 28px",
  backgroundColor: BRAND.surface,
};

export const brandName = {
  fontSize: "26px",
  fontWeight: 800 as const,
  letterSpacing: "-0.01em",
  fontFamily: "'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  color: BRAND.emerald,
  margin: "0 0 4px",
};

export const brandTag = {
  fontSize: "11px",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: BRAND.gold,
  fontWeight: 700 as const,
  margin: "0 0 24px",
};

export const h1 = {
  fontSize: "23px",
  fontWeight: 800 as const,
  letterSpacing: "-0.02em",
  color: BRAND.ink,
  margin: "0 0 14px",
};

export const text = {
  fontSize: "15px",
  color: BRAND.body,
  lineHeight: "1.65",
  margin: "0 0 22px",
};

export const link = { color: BRAND.emerald, textDecoration: "underline" };

export const button = {
  backgroundColor: BRAND.emerald,
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 700 as const,
  borderRadius: "999px",
  padding: "14px 30px",
  textDecoration: "none",
  display: "inline-block",
};

export const codeStyle = {
  fontFamily: "'IBM Plex Mono', Courier, monospace",
  fontSize: "30px",
  letterSpacing: "0.28em",
  fontWeight: 700 as const,
  color: BRAND.emerald,
  backgroundColor: "#ffffff",
  border: `1px solid ${BRAND.hairline}`,
  borderRadius: "14px",
  padding: "18px 20px",
  textAlign: "center" as const,
  margin: "0 0 24px",
};

export const divider = {
  border: "none",
  borderTop: `1px solid ${BRAND.hairline}`,
  margin: "28px 0 18px",
};

export const footer = {
  fontSize: "12px",
  color: BRAND.muted,
  lineHeight: "1.6",
  margin: "0",
};
