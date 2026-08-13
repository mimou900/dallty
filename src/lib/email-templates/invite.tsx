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

import {
  brandName,
  brandTag,
  button,
  card,
  container,
  divider,
  footer,
  h1,
  link,
  main,
  text,
} from "./brand";

interface InviteEmailProps {
  siteName: string;
  siteUrl: string;
  confirmationUrl: string;
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your booking is confirmed — create your {siteName} account</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brandName}>{siteName}</Text>
        <Text style={brandTag}>Beauty booking, refined</Text>
        <Section style={card}>
          <Heading style={h1}>Your booking is confirmed 🎉</Heading>
          <Text style={text}>
            Thanks for booking with{" "}
            <Link href={siteUrl} style={link}>
              <strong>{siteName}</strong>
            </Link>
            . Create your free account to track this appointment, get reminders, and earn loyalty
            points on future visits.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Create your account
          </Button>
          <Hr style={divider} />
          <Text style={footer}>
            If you didn't book with {siteName}, you can safely ignore this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export default InviteEmail;
