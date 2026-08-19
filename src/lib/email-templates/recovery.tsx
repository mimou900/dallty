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

interface RecoveryEmailProps {
  siteName: string;
  confirmationUrl: string;
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {siteName} password</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Section style={card}>
          <Heading style={h1}>Reset your password</Heading>
          <Text style={text}>
            We received a request to reset the password for your {siteName} account. Choose a new
            one using the button below.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Reset password
          </Button>
          <Hr style={divider} />
          <Text style={footer}>
            If you didn't request this, you can safely ignore this email — your password stays
            unchanged.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default RecoveryEmail;
