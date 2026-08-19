import * as React from "react";

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { BrandHeader } from "./brand-header";

import { button, card, container, divider, footer, h1, main, text } from "./brand";

interface MagicLinkEmailProps {
  siteName: string;
  confirmationUrl: string;
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your secure sign-in link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Section style={card}>
          <Heading style={h1}>Your sign-in link</Heading>
          <Text style={text}>
            Tap the button below to sign in to {siteName}. For your security this link works once
            and expires shortly.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Sign in
          </Button>
          <Hr style={divider} />
          <Text style={footer}>
            Didn't ask to sign in? You can safely ignore this email — no one can access your account
            without this link.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default MagicLinkEmail;
