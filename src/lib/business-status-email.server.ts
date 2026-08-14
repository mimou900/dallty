import { sendTemplateEmail } from "@/lib/email-templates/send-email";

type Status = "pending" | "approved" | "rejected" | "suspended";

/**
 * Emails the business owner about a status change. Never throws — a failed
 * notification must not fail the underlying admin action.
 */
export async function notifyBusinessStatus(params: {
  to: string | null | undefined;
  businessName: string;
  ownerName?: string;
  status: Status;
  note?: string;
  businessId: string;
}) {
  if (!params.to) return;
  try {
    await sendTemplateEmail("business-status", params.to, {
      templateData: {
        businessName: params.businessName,
        ownerName: params.ownerName,
        status: params.status,
        note: params.note,
      },
      idempotencyKey: `business-status-${params.businessId}-${params.status}-${Date.now()}`,
    });
  } catch (error) {
    console.error("[business-status-email] send failed", error);
  }
}
