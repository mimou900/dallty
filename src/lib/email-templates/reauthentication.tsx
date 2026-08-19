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
import { BrandHeader } from "./brand-header";

import { card, codeStyle, container, divider, footer, h1, main, text } from "./brand";

interface ReauthenticationEmailProps {
  token: string;
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Dallty verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Section style={card}>
          <Heading style={h1}>Confirm it's you</Heading>
          <Text style={text}>Enter this verification code to confirm your identity:</Text>
          <Text style={codeStyle}>{token}</Text>
          <Hr style={divider} />
          <Text style={footer}>
            This code expires shortly. If you didn't request it, you can safely ignore this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default ReauthenticationEmail;
