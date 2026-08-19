import type { ComponentType } from "react";

import { template as businessStatusTemplate } from "./business-status";
import { template as staffInviteTemplate } from "./staff-invite";
import { template as securityOtpTemplate } from "./security-otp";
import { template as accountChangeNoticeTemplate } from "./account-change-notice";
import { template as notificationTemplate } from "./notification";

export interface TemplateEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- props genuinely vary per template
  component: ComponentType<any>;
  subject: string | ((data: Record<string, unknown>) => string);
  displayName?: string;
  previewData?: Record<string, unknown>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  "business-status": businessStatusTemplate,
  "staff-invite": staffInviteTemplate,
  "security-otp": securityOtpTemplate,
  "account-change-notice": accountChangeNoticeTemplate,
  notification: notificationTemplate,
};
