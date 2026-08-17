/**
 * Provider-agnostic online-payment abstraction (brief §17-19, §94-95).
 *
 * IMPORTANT — read before implementing an adapter: no payment provider credentials (CIB,
 * Edahabia, Stripe, or otherwise) exist anywhere in this project's environment, confirmed
 * repeatedly across Projects 00-06. This file defines the CONTRACT every future provider
 * adapter must satisfy so that `payment_intents`/`payments`/the ledger never need to change
 * shape when a real provider is added — only a new file implementing this interface, plus
 * a webhook route calling `parseWebhookEvent`/`verifyWebhook`, would be needed.
 *
 * Do not implement a fake/stub adapter that pretends to succeed — that would violate the
 * project's explicit instruction never to claim money was processed unless a provider
 * actually confirmed it. `payment_methods` for every online method (cib/edahabia) is
 * seeded with `active = false` for exactly this reason.
 */

export type PaymentProviderCode = "cib" | "edahabia" | "stripe" | "paypal";

export type CreatePaymentParams = {
  paymentIntentId: string;
  amount: number;
  currency: string;
  bookingId: string;
  businessId: string;
  customerId: string | null;
};

export type CreatePaymentResult = {
  providerReference: string;
  redirectUrl?: string;
  clientSecret?: string;
};

export type PaymentStatusResult = {
  status: "pending" | "succeeded" | "failed" | "cancelled";
  providerReference: string;
  amount: number;
  currency: string;
};

export type WebhookEvent = {
  type: "payment.succeeded" | "payment.failed" | "refund.succeeded" | "refund.failed";
  providerReference: string;
  amount: number;
  currency: string;
  eventId: string; // provider's own idempotency key for this event — brief §20's "unique provider event ID"
};

/**
 * Every provider adapter (Stripe, CIB, Edahabia, ...) implements this. Core booking/ledger
 * code depends only on this interface, never on a specific provider's SDK — see brief §94:
 * "Do not allow provider-specific details to leak into core booking/ledger logic."
 */
export interface PaymentProvider {
  readonly code: PaymentProviderCode;

  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  getPaymentStatus(providerReference: string): Promise<PaymentStatusResult>;
  cancelPayment(providerReference: string): Promise<void>;
  refundPayment(providerReference: string, amount: number): Promise<{ providerReference: string }>;

  /** Verifies the raw webhook payload's signature came from this provider. Never trust an unverified webhook body. */
  verifyWebhook(rawBody: string, signatureHeader: string): boolean;
  parseWebhookEvent(rawBody: string): WebhookEvent;
}

/**
 * Reconciliation guard for a webhook against Dallty's own expectation (brief §69-71) — this
 * is provider-agnostic and safe to build now even with zero real providers wired up, since
 * every future webhook handler will need exactly this check before trusting an event.
 * Returns 'ok', or a specific mismatch reason — never silently accepts a wrong amount,
 * wrong currency, or unknown reference.
 */
export function reconcileWebhookEvent(
  event: WebhookEvent,
  expected: { providerReference: string; amount: number; currency: string } | null,
): "ok" | "unknown_reference" | "amount_mismatch" | "currency_mismatch" {
  if (!expected || expected.providerReference !== event.providerReference)
    return "unknown_reference";
  if (Math.abs(expected.amount - event.amount) > 0.005) return "amount_mismatch";
  if (expected.currency !== event.currency) return "currency_mismatch";
  return "ok";
}
