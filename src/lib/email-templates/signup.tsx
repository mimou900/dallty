import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { BrandHeader } from "./brand-header";

import { button, card, codeStyle, container, divider, footer, h1, link, main, text } from "./brand";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
  /**
   * Supabase classifies a signInWithOtp() call for an email that doesn't have an
   * account yet as a "signup" event, not "magiclink" -- so this template, not
   * magic-link.tsx, is what a genuinely new customer sees on the booking page's
   * inline email-OTP step. The code has to be the primary path here for the
   * same reason it is in magic-link.tsx: the app only ever asks the customer to
   * type a code back in, never to have clicked a link.
   *
   * The link stays too (secondary, not the first thing shown) because this
   * template is also reused by the separate password+email `auth.signUp()`
   * fallback (auth.tsx's "password" step), which has no code-entry UI at all --
   * that flow's `ensureSessionAfterSignUp` genuinely waits on the confirmation
   * link being clicked. Optional so a caller without a token (there isn't one
   * today, but the type shouldn't assume every "signup" event has one forever)
   * still renders a sensible link-only email.
   */
  token?: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {token
        ? `Your ${siteName} verification code`
        : `Confirm your email to start booking on ${siteName}`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Section style={card}>
          <Heading style={h1}>Welcome to {siteName}</Heading>
          <Text style={text}>
            Confirm{" "}
            <Link href={`mailto:${recipient}`} style={link}>
              {recipient}
            </Link>{" "}
            and your account is ready — browse salons, pick a time, and book in a few taps.
          </Text>
          {token ? (
            <>
              <Text style={text}>Enter this code to finish creating your account:</Text>
              <Text style={codeStyle}>{token}</Text>
              <Text style={{ ...text, margin: "0 0 22px" }}>
                Or{" "}
                <Link href={confirmationUrl} style={link}>
                  confirm automatically
                </Link>{" "}
                instead.
              </Text>
            </>
          ) : (
            <Button style={button} href={confirmationUrl}>
              Verify email
            </Button>
          )}
          <Hr style={divider} />
          <Text style={footer}>
            If you didn't create a {siteName} account, you can safely ignore this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default SignupEmail;
