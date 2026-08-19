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

import { button, card, container, divider, footer, h1, link, main, text } from "./brand";

interface SignupEmailProps {
  siteName: string;
  siteUrl: string;
  recipient: string;
  confirmationUrl: string;
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your email to start booking on {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <BrandHeader />
        <Section style={card}>
          <Heading style={h1}>Confirm your email</Heading>
          <Text style={text}>
            Welcome to{" "}
            <Link href={siteUrl} style={link}>
              <strong>{siteName}</strong>
            </Link>
            . Confirm{" "}
            <Link href={`mailto:${recipient}`} style={link}>
              {recipient}
            </Link>{" "}
            and your account is ready — browse salons, pick a time, and book in a few taps.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Verify email
          </Button>
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
