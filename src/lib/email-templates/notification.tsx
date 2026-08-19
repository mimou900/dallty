import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";
import { dirFor } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n";
import { getEmailNamespace, tEmail } from "./i18n";
import type { NamespaceKeyMap } from "@/lib/i18n/keys.gen";

interface Props {
  lang?: Lang;
  templateKey?: string;
  vars?: Record<string, string | number>;
  ctaUrl?: string;
  /** Pre-resolved by renderNotificationEmailData() before this component is ever
   * instantiated — emails render once, synchronously, server-side (send-email.ts's
   * `render(element)`), so there is no event-loop turn available for an async fetch inside
   * the component itself. */
  dict?: Record<string, unknown>;
}

/**
 * One generic template for every notification-engine event (brief §66-67: templates use
 * translation keys, never hardcoded copy in TS/React) — registered once, selected by
 * `templateKey` at send time, same COPY-lookup-by-key pattern as business-status.tsx. Unlike
 * every other email template in this codebase (all hardcoded English — see
 * DALLTY_NOTIFICATION_ARCHITECTURE.md for why those were deliberately left alone), this one
 * is the actual, real consumer of the `emails` i18n namespace this project activates.
 * Variables are interpolated by tEmail()'s {{var}} substitution — never string-concatenated
 * into the translation source, so nothing here can inject a translation-breaking value.
 */
const Email = ({
  lang = "en",
  templateKey = "booking_confirmed",
  vars,
  ctaUrl,
  dict = {},
}: Props) => {
  const dir = dirFor(lang);
  const heading = tEmail(dict, `${templateKey}.heading` as NamespaceKeyMap["emails"], vars);
  const subject = tEmail(dict, `${templateKey}.subject` as NamespaceKeyMap["emails"], vars);
  const body = tEmail(dict, `${templateKey}.body` as NamespaceKeyMap["emails"], vars);
  const cta = tEmail(dict, `${templateKey}.cta` as NamespaceKeyMap["emails"], vars);

  return (
    <Html lang={lang} dir={dir}>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={wordmark}>Dallty</Text>
          <Heading style={heading_}>{heading}</Heading>
          <Text style={text}>{body}</Text>
          {ctaUrl ? (
            <Button href={ctaUrl} style={button}>
              {cta}
            </Button>
          ) : null}
          <Hr style={hr} />
          <Text style={footer}>Dallty — find, book, relax.</Text>
        </Container>
      </Body>
    </Html>
  );
};

export async function renderNotificationEmailData(
  lang: Lang,
  templateKey: string,
  vars: Record<string, string | number>,
  ctaUrl?: string,
) {
  const dict = await getEmailNamespace(lang);
  return { lang, templateKey, vars, ctaUrl, dict };
}

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) => {
    const dict = (data?.dict ?? {}) as Record<string, unknown>;
    return tEmail(
      dict,
      `${data?.templateKey ?? "booking_confirmed"}.subject` as NamespaceKeyMap["emails"],
      data?.vars as Record<string, string | number> | undefined,
    );
  },
  displayName: "Notification (generic, i18n)",
  previewData: {
    lang: "en",
    templateKey: "booking_confirmed",
    vars: { business: "Glow Studio", service: "Haircut", date: "Thu 20 Aug", time: "18:00" },
    dict: {
      booking_confirmed: {
        subject: "Your booking at {{business}} is confirmed",
        heading: "You're booked",
        body: "{{service}} at {{business}} on {{date}} at {{time}} is confirmed.",
        cta: "View booking",
      },
    },
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Arial, Helvetica, sans-serif" };
const container = { padding: "28px 26px", maxWidth: "560px" };
const wordmark = {
  fontSize: "24px",
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "#0f766e",
  margin: "0 0 8px",
};
const heading_ = { fontSize: "24px", fontWeight: 800, color: "#0b1a17", margin: "10px 0 4px" };
const text = { fontSize: "15px", lineHeight: "24px", color: "#33413d" };
const button = {
  backgroundColor: "#0f766e",
  borderRadius: "10px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 700,
  padding: "12px 20px",
  display: "inline-block",
  marginTop: "8px",
};
const hr = { borderColor: "#e6ecea", margin: "24px 0 12px" };
const footer = { fontSize: "12px", color: "#8a9793" };
