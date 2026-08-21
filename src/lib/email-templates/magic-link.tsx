import * as React from "react";

import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { BrandHeader } from "./brand-header";

import { card, codeStyle, container, divider, footer, h1, main, text } from "./brand";

interface MagicLinkEmailProps {
  siteName: string;
  token: string;
}

/**
 * The app's own sign-in UI (src/routes/auth.tsx) is a type-the-code flow
 * (signInWithOtp -> a code-entry screen -> verifyOtp), not a click-to-login
 * flow, despite Supabase naming this hook action "magiclink" — so this
 * renders the numeric code, not a confirmation link, matching what the UI
 * actually asks the user for. Mirrors reauthentication.tsx's own code
 * display for the same reason.
 */
export const MagicLinkEmail = ({ siteName, token }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} sign-in code</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Section style={card}>
          <Heading style={h1}>Your sign-in code</Heading>
          <Text style={text}>Enter this code to sign in to {siteName}:</Text>
          <Text style={codeStyle}>{token}</Text>
          <Hr style={divider} />
          <Text style={footer}>
            Didn't ask to sign in? You can safely ignore this email — no one can access your account
            without this code.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default MagicLinkEmail;
