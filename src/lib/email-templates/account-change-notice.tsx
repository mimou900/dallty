import * as React from "react";

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

import {
  brandName,
  brandTag,
  button,
  card,
  container,
  divider,
  footer,
  h1,
  main,
  text,
} from "./brand";

export type AccountChange = "email" | "password" | "phone";

interface Props {
  change?: AccountChange;
  detail?: string;
  /** e.g. "Chrome on Windows", from src/lib/user-agent.ts */
  device?: string;
  /** Pre-formatted date/time string — formatting happens server-side, not in the template. */
  timestamp?: string;
  secureAccountUrl?: string;
}

const COPY: Record<AccountChange, { subject: string; heading: string; body: string }> = {
  email: {
    subject: "Your Dallty email address was changed",
    heading: "Your email address changed",
    body: "The email address on your Dallty account was just changed.",
  },
  password: {
    subject: "Your Dallty password was changed",
    heading: "Your password changed",
    body: "The password on your Dallty account was just changed. Every other device has been signed out.",
  },
  phone: {
    subject: "Your Dallty phone number was changed",
    heading: "Your phone number changed",
    body: "The phone number on your Dallty account was just changed.",
  },
};

const Email = ({ change = "password", detail, device, timestamp, secureAccountUrl }: Props) => {
  const c = COPY[change] ?? COPY.password;
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{c.subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brandName}>dallty</Text>
          <Text style={brandTag}>Beauty booking, refined</Text>
          <Section style={card}>
            <Heading style={h1}>{c.heading}</Heading>
            <Text style={text}>{c.body}</Text>
            {detail ? <Text style={text}>{detail}</Text> : null}
            {(device || timestamp) && (
              <Text style={text}>
                {device ? `Device: ${device}` : null}
                {device && timestamp ? <br /> : null}
                {timestamp ? `Time: ${timestamp}` : null}
              </Text>
            )}
            <Hr style={divider} />
            <Text style={footer}>
              If you didn't make this change, secure your account immediately.
            </Text>
            {secureAccountUrl ? (
              <Section style={{ textAlign: "center" as const, margin: "18px 0 0" }}>
                <a href={secureAccountUrl} style={button}>
                  Secure my account
                </a>
              </Section>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    (COPY[(data?.change as AccountChange) ?? "password"] ?? COPY.password).subject,
  displayName: "Account change notice",
  previewData: {
    change: "password",
    device: "Chrome on Windows",
    timestamp: "2026-08-13 14:22 UTC",
    secureAccountUrl: "https://dallty.com/auth",
  },
} satisfies TemplateEntry;

export default Email;
