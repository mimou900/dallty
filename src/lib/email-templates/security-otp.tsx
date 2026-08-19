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
import { BrandHeader } from "./brand-header";

import { card, codeStyle, container, divider, footer, h1, main, text } from "./brand";

export type OtpPurpose = "login_step_up" | "change_email" | "change_password";

interface Props {
  code?: string;
  purpose?: OtpPurpose;
  expiryMinutes?: number;
}

const COPY: Record<OtpPurpose, { subject: string; heading: string; body: string }> = {
  login_step_up: {
    subject: "Your Dallty sign-in code",
    heading: "Confirm it’s you",
    body: "Enter this code to finish signing in to your Dallty account:",
  },
  change_email: {
    subject: "Your Dallty email change code",
    heading: "Confirm your new email",
    body: "Enter this code to confirm the email change on your Dallty account:",
  },
  change_password: {
    subject: "Your Dallty password change code",
    heading: "Confirm your password change",
    body: "Enter this code to confirm the password change on your Dallty account:",
  },
};

const Email = ({ code = "000000", purpose = "login_step_up", expiryMinutes = 10 }: Props) => {
  const c = COPY[purpose] ?? COPY.login_step_up;
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{c.subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <BrandHeader />
          <Section style={card}>
            <Heading style={h1}>{c.heading}</Heading>
            <Text style={text}>{c.body}</Text>
            <Text style={codeStyle}>{code}</Text>
            <Hr style={divider} />
            <Text style={footer}>
              This code expires in {expiryMinutes} minutes. If you didn't request it, you can safely
              ignore this email — your account is still secure.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (data: Record<string, unknown>) =>
    (COPY[(data?.purpose as OtpPurpose) ?? "login_step_up"] ?? COPY.login_step_up).subject,
  displayName: "Security OTP code",
  previewData: {
    code: "482913",
    purpose: "login_step_up",
    expiryMinutes: 10,
  },
} satisfies TemplateEntry;

export default Email;
