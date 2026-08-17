/**
 * SMS is explicitly NOT V1 (brief §34) — this file exists only so the notification engine's
 * channel dispatch can already branch on `"sms"` without a future SMS project needing to
 * touch the engine itself. No adapter, no provider selection logic, no cost/volume handling
 * — genuinely just the contract shape, matching the brief's "do not implement expensive SMS
 * infrastructure now" instruction.
 */

export interface SendSmsParams {
  to: string; // E.164 phone number
  body: string;
}

export interface SendSmsResult {
  providerMessageId: string;
  status: "queued" | "sent" | "failed";
}

export interface SmsProvider {
  readonly code: string;
  sendSms(params: SendSmsParams): Promise<SendSmsResult>;
}

export function isSmsAvailable(): boolean {
  return false;
}
