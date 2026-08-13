import React from 'react'
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
} from '@react-email/components'
import type { TemplateEntry } from './registry'

export type BusinessStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

interface Props {
  businessName?: string
  ownerName?: string
  status?: BusinessStatus
  note?: string
}

const COPY: Record<BusinessStatus, { heading: string; body: string; subject: string }> = {
  pending: {
    subject: 'Your Dallty business is under review',
    heading: 'We received your registration',
    body: 'Our team is reviewing your business details. This usually takes less than 24 hours — we will email you the moment a decision is made.',
  },
  approved: {
    subject: 'Your Dallty business is approved 🎉',
    heading: 'You are live on Dallty',
    body: 'Your business has been approved and is now visible to customers. Sign in to your dashboard to add services, staff and working hours.',
  },
  rejected: {
    subject: 'Update on your Dallty business registration',
    heading: 'We could not approve your business yet',
    body: 'Our team reviewed your registration and could not approve it at this time. You can update your details and reply to this email to request another review.',
  },
  suspended: {
    subject: 'Your Dallty business has been suspended',
    heading: 'Your business is temporarily suspended',
    body: 'Your business is no longer visible to customers. Reply to this email if you believe this was a mistake and our team will take another look.',
  },
}

const Email = ({ businessName, ownerName, status = 'pending', note }: Props) => {
  const c = COPY[status] ?? COPY.pending
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{c.subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={brand}>Dallty</Text>
          <Heading style={heading}>{c.heading}</Heading>
          <Text style={text}>{ownerName ? `Hi ${ownerName},` : 'Hi there,'}</Text>
          <Text style={text}>
            {businessName ? <strong>{businessName}</strong> : 'Your business'} — {c.body}
          </Text>
          {note ? (
            <Section style={noteBox}>
              <Text style={noteText}>{note}</Text>
            </Section>
          ) : null}
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
    (COPY[(data?.status as BusinessStatus) ?? 'pending'] ?? COPY.pending).subject,
  displayName: 'Business status update',
  previewData: {
    businessName: 'Glow Studio',
    ownerName: 'Sara',
    status: 'approved',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '28px 26px', maxWidth: '560px' }
const brand = { fontSize: '14px', fontWeight: 700, letterSpacing: '2px', color: '#0f766e' }
const heading = { fontSize: '24px', fontWeight: 800, color: '#0b1a17', margin: '10px 0 4px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#33413d' }
const noteBox = { backgroundColor: '#f4f7f6', borderRadius: '12px', padding: '12px 16px' }
const noteText = { fontSize: '14px', lineHeight: '22px', color: '#33413d', margin: 0 }
const hr = { borderColor: '#e6ecea', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#8a9793' }
