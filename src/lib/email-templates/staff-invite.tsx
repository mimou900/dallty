import React from 'react'
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
} from '@react-email/components'
import type { TemplateEntry } from './registry'

export type StaffInviteMode = 'invite' | 'reset'

interface Props {
  staffName?: string
  salonName?: string
  actionUrl?: string
  mode?: StaffInviteMode
}

const COPY: Record<StaffInviteMode, { subject: string; heading: string; body: string; cta: string }> = {
  invite: {
    subject: 'Your Dallty team account is ready',
    heading: 'Set your password and join the team',
    body: 'has added you to their team on Dallty. Create a password to open your specialist dashboard, where you can see your appointments and manage your working hours.',
    cta: 'Create my password',
  },
  reset: {
    subject: 'Reset your Dallty team password',
    heading: 'Choose a new password',
    body: 'sent you a password recovery link for your Dallty specialist account. The link expires shortly — if you did not expect it, you can ignore this email.',
    cta: 'Reset my password',
  },
}

const Email = ({ staffName, salonName, actionUrl, mode = 'invite' }: Props) => {
  const c = COPY[mode] ?? COPY.invite
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{c.subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>Dallty</Text>
          <Heading style={heading}>{c.heading}</Heading>
          <Text style={text}>{staffName ? `Hi ${staffName},` : 'Hi there,'}</Text>
          <Text style={text}>
            <strong>{salonName || 'Your salon'}</strong> {c.body}
          </Text>
          {actionUrl ? (
            <Button href={actionUrl} style={button}>
              {c.cta}
            </Button>
          ) : null}
          <Text style={muted}>
            If the button does not work, copy this link into your browser:
            <br />
            {actionUrl}
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Dallty — find, book, relax.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    (COPY[(data.mode as StaffInviteMode) ?? 'invite'] ?? COPY.invite).subject,
  displayName: 'Staff invite / password link',
  previewData: {
    staffName: 'Layla',
    salonName: 'Bloom Beauty Lounge',
    actionUrl: 'https://dallty.com/reset-password',
    mode: 'invite',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '28px 24px', maxWidth: '560px' }
const brand = { fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase' as const, color: '#0f766e', fontWeight: 700 }
const heading = { fontSize: '24px', lineHeight: '32px', margin: '12px 0 8px', color: '#111827' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#374151' }
const button = {
  backgroundColor: '#0f766e',
  color: '#ffffff',
  borderRadius: '12px',
  padding: '12px 22px',
  fontSize: '15px',
  fontWeight: 700,
  display: 'inline-block',
  margin: '10px 0 4px',
}
const muted = { fontSize: '12px', lineHeight: '18px', color: '#6b7280', wordBreak: 'break-all' as const }
const hr = { borderColor: '#e5e7eb', margin: '22px 0' }
const footer = { fontSize: '12px', color: '#6b7280' }
